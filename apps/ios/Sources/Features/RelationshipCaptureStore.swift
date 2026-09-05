import Foundation

@MainActor
final class RelationshipCaptureStore: ObservableObject {
    @Published private(set) var stage: RelationshipCaptureStage
    @Published var draft: RecognizedCaptureDraft
    @Published private(set) var identityCase: IdentityResolutionCase?
    @Published var selectedCandidateID: String?
    @Published var selectedContextID: String?
    @Published private(set) var changes: CaptureChangeReview?
    @Published var claimEdits: [String: String] = [:]
    @Published var selectedClaimID: String?
    @Published var reviewedSpeaker: TextSignalSpeaker?
    @Published private(set) var originalAvailable: Bool
    let seed: PendingCaptureSeed
    private let recognizer: ConversationTextRecognizing
    private let service: RelationshipCaptureServing
    private let inbox: PendingCaptureInbox
    private var task: Task<Void, Never>?
    private var draftTask: Task<Void, Never>?
    private var retentionTask: Task<Void, Never>?
    private var didStart = false
    private var hasInitialDraft: Bool
    private var recovery = CaptureReviewRecovery()
    private var pendingDecision: IdentityDecision?
    private var boundPersonID: String?
    private var boundContextID: String?
    private var removedFromInbox = false

    init(seed: PendingCaptureSeed,
         recognizer: ConversationTextRecognizing = VisionConversationTextRecognizer(),
         service: RelationshipCaptureServing, initialDraft: RecognizedCaptureDraft? = nil,
         inbox: PendingCaptureInbox = .shared) {
        self.seed = seed
        self.recognizer = recognizer
        self.service = service
        self.inbox = inbox
        draft = initialDraft ?? .empty
        hasInitialDraft = initialDraft != nil
        stage = initialDraft == nil ? .recognizing : .reviewing
        originalAvailable = !seed.imageData.isEmpty && Date().timeIntervalSince(seed.createdAt) < 7 * 86_400
    }
    deinit { task?.cancel(); draftTask?.cancel(); retentionTask?.cancel() }

    var isBusy: Bool {
        switch stage {
        case .recognizing, .submitting, .decidingIdentity, .loadingChanges, .savingChange, .compilingWiki: true
        default: false
        }
    }
    var hasSubmitted: Bool { recovery.submittedDraft != nil }
    var canRemoveLocalCopy: Bool { !isBusy && recovery.pendingClaim == nil && recovery.pendingSpeaker == nil }
    var reviewScopeLabel: String {
        [resolvedPersonDisplayLabel, resolvedRelationshipDisplayLabel].compactMap { $0 }.joined(separator: " · ")
    }
    func updateMessageTime(_ text: String) {
        draft.messageTimestampInput = text
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: draft.sourceTimezone ?? TimeZone.current.identifier)
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        formatter.isLenient = false
        let date = formatter.date(from: text)
        draft.messageTimestamp = date.flatMap { formatter.string(from: $0) == text ? $0 : nil }
    }
    var canCreatePerson: Bool {
        identityCase?.hasCurrentCandidate != true && draft.displayNameHint.nonEmpty != nil &&
        draft.relationshipLabel.nonEmpty != nil && draft.relationshipPurpose.nonEmpty != nil
    }
    var canBindSelection: Bool {
        guard let candidate = identityCase?.candidates.first(where: { $0.id == selectedCandidateID }) else { return false }
        return isCandidateSelectable(candidate) &&
            (candidate.relationshipContexts.isEmpty ? draft.relationshipLabel.nonEmpty != nil : selectedContextID != nil)
    }
    func start() {
        guard !didStart else { return }
        didStart = true
        retentionTask = Task { [weak self, seed] in
            for days in [7, 30] {
                let delay = seed.createdAt.addingTimeInterval(Double(days) * 86_400).timeIntervalSinceNow
                do {
                    if delay > 0 { try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000)) }
                    try Task.checkCancellation()
                    await self?.checkLocalRetention()
                } catch { return }
            }
        }
        recognize()
    }
    func recognize() {
        run(stage: .recognizing, recoveryStage: .recognition) {
            try await LabClientDiagnostics.measure(.captureReviewPreparation) {
                if let saved = try await self.inbox.loadDraft(for: self.seed.id, scope: self.service.runtimeScope) {
                    self.draft = saved
                    self.hasInitialDraft = true
                }
                if let saved = try await self.inbox.loadRecovery(for: self.seed.id, scope: self.service.runtimeScope) {
                    self.recovery = saved
                    self.claimEdits = saved.claimEdits
                    self.selectedClaimID = saved.selectedClaimID
                    if let frozen = saved.submittedDraft { self.draft = frozen }
                    if saved.capture != nil { try await self.resumeCanonical(); return }
                    if saved.submittedDraft != nil {
                        self.fail("The previous save needs reconciliation. Retry uses the same source and request.", at: .submission)
                        return
                    }
                }
                if !self.hasInitialDraft {
                    guard self.originalAvailable else {
                        self.fail("The original image is no longer available. Import it again to recognize text.", at: .recognition)
                        return
                    }
                    self.draft = CaptureDraftBuilder.makeDraft(from: try await self.recognizer.recognizeText(in: self.seed.imageData))
                }
                try await self.saveRecovery()
                self.stage = .reviewing
            }
        }
    }
    func persistDraft() {
        guard !hasSubmitted else { return }
        draftTask?.cancel()
        draftTask = Task { [weak self] in
            do {
                try await Task.sleep(nanoseconds: 250_000_000)
                guard let self else { return }
                try await self.saveRecovery()
            } catch is CancellationError { }
            catch { self?.fail(error.localizedDescription, at: .recognition) }
        }
    }
    func persistReviewPosition() {
        guard !isBusy, !removedFromInbox else { return }
        draftTask?.cancel()
        draftTask = Task { [weak self] in
            do {
                try await Task.sleep(nanoseconds: 250_000_000)
                guard let self else { return }
                try await self.saveRecovery()
            } catch is CancellationError { }
            catch { self?.fail(error.localizedDescription, at: .changes) }
        }
    }
    func keepForLater() async -> Bool {
        guard !isBusy else { return false }
        if removedFromInbox { return true }
        draftTask?.cancel()
        do { try await saveRecovery(); return true }
        catch { fail(error.localizedDescription, at: hasSubmitted ? .changes : .recognition); return false }
    }
    func submitReviewedDraft() {
        guard !isBusy, draft.canSubmit else { return }
        draftTask?.cancel()
        run(stage: .submitting, recoveryStage: .submission) {
            if self.recovery.capture != nil { try await self.resumeCanonical(); return }
            if self.recovery.submittedDraft == nil {
                self.draft.sourceByteCount = self.seed.imageData.count
                self.draft.sourceTimezone = TimeZone.current.identifier
                self.recovery.submittedDraft = self.draft
            }
            // Persist immutable intent before transmission; response loss reuses it.
            try await self.saveRecovery()
            let result: ResourceCaptureResult
            if self.recovery.submittedByAgent == true {
                result = try await self.service.createProposedCapture(
                    seed: self.seed,
                    draft: self.recovery.submittedDraft!
                )
            } else {
                result = try await self.service.createCapture(
                    seed: self.seed,
                    draft: self.recovery.submittedDraft!
                )
            }
            try Task.checkCancellation()
            self.recovery.capture = result
            try await self.saveRecovery()
            try await self.continueAfterCapture(result)
        }
    }
    func selectCandidate(_ candidate: IdentityResolutionCandidate) {
        guard !isBusy, isCandidateSelectable(candidate) else { return }
        selectedCandidateID = candidate.personID
        selectedContextID = candidate.relationshipContexts.count == 1 ? candidate.relationshipContexts.first?.id : nil
        persistReviewPosition()
    }
    func selectContext(_ context: RelationshipContextChoice) {
        guard !isBusy, identityCase?.candidates.first(where: { $0.id == selectedCandidateID })?
            .relationshipContexts.contains(where: { $0.id == context.id }) == true else { return }
        selectedContextID = context.id
        persistReviewPosition()
    }
    func isCandidateSelectable(_ candidate: IdentityResolutionCandidate) -> Bool {
        !(candidate.temporalRole == .historical && identityCase?.hasCurrentCandidate == true)
    }
    func bindSelectedCandidate() {
        guard canBindSelection, let candidate = identityCase?.candidates.first(where: { $0.id == selectedCandidateID }) else { return }
        decide(.bind(candidate: candidate, context: candidate.relationshipContexts.first { $0.id == selectedContextID }))
    }
    func createNewPerson() { if canCreatePerson { decide(.createNew) } }
    func leaveUnresolved() { decide(.leaveUnresolved) }
    func retry() {
        guard case let .failed(failure) = stage else { return }
        switch failure.recoveryStage {
        case .recognition: recognize()
        case .submission: submitReviewedDraft()
        case .identity: run(stage: .submitting, recoveryStage: .identity) { try await self.resumeCanonical() }
        case .changes:
            if recovery.pendingSpeaker != nil { submitPendingSpeaker() }
            else if recovery.pendingClaim != nil { submitPendingClaim() } else { refreshChanges() }
        case .compilation: finishReview()
        }
    }
    func returnToReview() {
        guard !isBusy else { return }
        if hasSubmitted { refreshChanges() } else { stage = .reviewing }
    }
    @discardableResult
    func discard() async -> Bool {
        guard !isBusy, recovery.pendingClaim == nil, recovery.pendingSpeaker == nil else { return false }
        draftTask?.cancel()
        do { try await inbox.remove(id: seed.id); originalAvailable = false; removedFromInbox = true; return true }
        catch { fail(error.localizedDescription, at: .recognition); return false }
    }
    func refreshChanges() {
        guard !isBusy else { return }
        run(stage: .loadingChanges, recoveryStage: .changes) { try await self.resumeCanonical() }
    }
    func decideClaim(_ claim: CaptureChangeReview.Claim, decision: String, correctedValue: String? = nil) {
        guard stage == .reviewingChanges, recovery.pendingClaim == nil, claim.needsReview,
              let token = claim.reviewToken, !claim.hasBlockingEvidence else { return }
        let value = correctedValue?.nonEmpty
        if decision == "confirm" {
            if claim.requiresDate && !Self.isCompleteDate(value ?? "") { return }
            if claim.proposalStatus == "ambiguous" && value == nil { return }
        }
        recovery.pendingClaim = CaptureClaimDecision(assertionID: claim.id,
            idempotencyKey: "ios-claim:\(UUID().uuidString.lowercased())", version: claim.version,
            reviewToken: token, decision: decision, correctedValue: value)
        selectedClaimID = claim.id
        submitPendingClaim()
    }

    func confirmSpeaker(_ fragment: CaptureChangeReview.Fragment) {
        guard stage == .reviewingChanges, recovery.pendingSpeaker == nil,
              let speaker = reviewedSpeaker, speaker != .unknown else { return }
        recovery.pendingSpeaker = .init(fragmentID: fragment.id,
            idempotencyKey: "ios-speaker:\(UUID().uuidString.lowercased())", expectedStatus: fragment.reviewStatus,
            expectedReviewID: fragment.lastReviewID, speaker: speaker)
        submitPendingSpeaker()
    }
    private func submitPendingSpeaker() {
        guard !isBusy, let pending = recovery.pendingSpeaker else { return }
        run(stage: .savingChange, recoveryStage: .changes) {
            try await self.saveRecovery()
            let receiptID: String
            do { receiptID = try await self.service.confirmSpeaker(pending) }
            catch let error as RelationshipCaptureClientError {
                if case let .backend(code, _) = error, ["EVIDENCE_REVIEW_AUTHORITY_STALE", "SPEAKER_CORRECTION_REQUIRES_NEW_SOURCE",
                    "EVIDENCE_FRAGMENT_NOT_FOUND", "EVIDENCE_SOURCE_AUTHORIZATION_UNAVAILABLE"].contains(code) {
                    self.recovery.pendingSpeaker = nil
                    try await self.saveRecovery()
                }
                throw error
            }
            try await self.loadChanges()
            guard self.changes?.fragments.contains(where: {
                $0.id == pending.fragmentID && $0.attribution.actor == pending.speaker.rawValue &&
                $0.attribution.status == "confirmed" && $0.lastReviewID == receiptID
            }) == true else { throw RelationshipCaptureClientError.invalidResponse }
            self.recovery.pendingSpeaker = nil
            try await self.saveRecovery()
        }
    }
    private func submitPendingClaim() {
        guard !isBusy, let decision = recovery.pendingClaim else { return }
        run(stage: .savingChange, recoveryStage: .changes) {
            try await self.saveRecovery()
            let receiptID: String
            do { receiptID = try await self.service.decideClaim(decision) }
            catch let error as RelationshipCaptureClientError {
                if case let .backend(code, _) = error, [
                    "CLAIM_REVIEW_STALE", "CLAIM_EVIDENCE_UNAVAILABLE", "CLAIM_DECISION_SUPERSEDED",
                    "ASSERTION_VERSION_CONFLICT", "ASSERTION_ALREADY_DECIDED", "CALENDAR_DATE_REQUIRED",
                    "STATE_CONFLICT_REQUIRES_SUPERSESSION", "SUPERSESSION_TARGET_STALE"
                    , "ASSERTION_DELETED", "ASSERTION_SOURCE_AUTHORIZATION_UNAVAILABLE", "ASSERTION_NOT_FOUND"
                ].contains(code) {
                    self.recovery.pendingClaim = nil
                    try await self.saveRecovery()
                }
                throw error
            }
            try Task.checkCancellation()
            try await self.loadChanges()
            guard let observed = self.changes?.claims.first(where: { $0.id == decision.assertionID }),
                  observed.version > decision.version,
                  observed.lastDecisionID == receiptID,
                  observed.reviewStatus == (decision.decision == "confirm" ? "confirmed" : decision.decision == "dismiss" ? "dismissed" : "unresolved") else {
                throw RelationshipCaptureClientError.invalidResponse
            }
            self.recovery.pendingClaim = nil
            try await self.saveRecovery()
            self.stage = .reviewingChanges
        }
    }
    func finishReview() {
        guard !isBusy, recovery.pendingClaim == nil, recovery.pendingSpeaker == nil, recovery.capture?.identity.personID != nil else { return }
        run(stage: .compilingWiki, recoveryStage: .compilation) {
            try await self.loadChanges()
            guard let capture = self.recovery.capture, let person = self.boundPersonID,
                  let context = self.boundContextID else { throw RelationshipCaptureClientError.invalidResponse }
            self.stage = .compilingWiki
            guard let changes = self.changes else { throw RelationshipCaptureClientError.invalidResponse }
            let wiki = try await self.service.compileWiki(personID: person, relationshipContextID: context,
                seedID: self.seed.id, reviewFingerprint: changes.reviewFingerprint)
            try Task.checkCancellation()
            let completion = self.completion(capture: capture, wiki: wiki)
            if completion.needsReview { try await self.saveRecovery() }
            else { try await self.inbox.remove(id: self.seed.id); self.originalAvailable = false; self.removedFromInbox = true }
            self.stage = .completed(completion)
        }
    }
    private func resumeCanonical() async throws {
        guard let saved = recovery.capture else { throw RelationshipCaptureClientError.invalidResponse }
        let current = try await service.loadCapture(id: saved.captureID)
        guard current.captureID == saved.captureID, current.resource.id == saved.resource.id else {
            throw RelationshipCaptureClientError.invalidResponse
        }
        recovery.capture = current
        try await saveRecovery()
        try await continueAfterCapture(current)
    }
    private func continueAfterCapture(_ result: ResourceCaptureResult) async throws {
        if let person = result.identity.personID, let context = result.identity.relationshipContextID {
            boundPersonID = person
            boundContextID = context
            try await loadChanges()
            if recovery.pendingClaim != nil || recovery.pendingSpeaker != nil { fail("A saved decision needs reconciliation. Retry preserves the original operation.", at: .changes) }
            return
        }
        guard let caseID = result.identity.resolutionCaseID else { throw RelationshipCaptureClientError.invalidResponse }
        identityCase = try await service.loadIdentityCase(id: caseID)
        try Task.checkCancellation()
        selectedCandidateID = identityCase?.candidates.first(where: {
            $0.id == recovery.selectedCandidateID && isCandidateSelectable($0)
        })?.id
        selectedContextID = identityCase?.candidates.first(where: { $0.id == selectedCandidateID })?
            .relationshipContexts.first(where: { $0.id == recovery.selectedContextID })?.id
        stage = .resolvingIdentity
    }
    private func loadChanges() async throws {
        guard let saved = recovery.capture else { throw RelationshipCaptureClientError.invalidResponse }
        let current = try await service.loadCapture(id: saved.captureID)
        guard current.captureID == saved.captureID, current.resource.id == saved.resource.id,
              current.identity.status == "bound", let person = current.identity.personID,
              let context = current.identity.relationshipContextID else { throw RelationshipCaptureClientError.invalidResponse }
        if let boundPersonID, boundPersonID != person { throw RelationshipCaptureClientError.invalidResponse }
        if let boundContextID, boundContextID != context { throw RelationshipCaptureClientError.invalidResponse }
        boundPersonID = person
        boundContextID = context
        recovery.capture = current
        let review = try await service.prepareChanges(captureID: current.captureID)
        guard review.resource.captureID == current.captureID, review.resource.id == current.resource.id,
              review.resource.authorization == "authorized" else { throw RelationshipCaptureClientError.invalidResponse }
        try Task.checkCancellation()
        changes = review
        for claim in review.claims where claimEdits[claim.id] == nil {
            claimEdits[claim.id] = claim.requiresDate && !Self.isCompleteDate(claim.proposedValue ?? "") ? "" : claim.proposedValue ?? ""
        }
        try await saveRecovery()
        stage = .reviewingChanges
    }
    private func decide(_ decision: IdentityDecision) {
        guard !isBusy, let identityCase, recovery.capture != nil else { return }
        pendingDecision = decision
        run(stage: .decidingIdentity, recoveryStage: .identity) {
            try await self.saveRecovery()
            let result = try await self.service.decideIdentity(identityCase: identityCase, decision: decision, seed: self.seed, draft: self.draft)
            try Task.checkCancellation()
            if result.identityStatus == "bound" { try await self.resumeCanonical() }
            else {
                try await self.saveRecovery()
                self.stage = .completed(self.completion(capture: self.recovery.capture!, wiki: nil))
            }
        }
    }
    private func completion(capture: ResourceCaptureResult, wiki: WikiCompilationReceipt?) -> RelationshipCaptureCompletion {
        RelationshipCaptureCompletion(captureID: capture.captureID,
            personID: capture.identity.personID, personDisplayLabel: resolvedPersonDisplayLabel,
            relationshipContextID: capture.identity.relationshipContextID,
            relationshipDisplayLabel: resolvedRelationshipDisplayLabel, resourceID: capture.resource.id,
            decision: capture.identity.status == "bound" ? "reviewed_changes" : "leave_unresolved", wiki: wiki,
            confirmedCount: changes?.confirmedCount ?? 0, unresolvedCount: changes?.pendingCount ?? 0,
            dismissedCount: changes?.dismissedCount ?? 0, needsEvidenceReview: changes?.needsEvidenceReview ?? false)
    }
    private func saveRecovery() async throws {
        guard !removedFromInbox else { return }
        recovery.selectedCandidateID = selectedCandidateID
        recovery.selectedContextID = selectedContextID
        recovery.selectedClaimID = selectedClaimID
        recovery.claimEdits = claimEdits
        try await inbox.saveReview(seed: seed, draft: draft, recovery: recovery, scope: service.runtimeScope)
        if draft.keepOriginalForReview == false || Date().timeIntervalSince(seed.createdAt) >= 7 * 86_400 { originalAvailable = false }
    }
    func checkLocalRetention() async {
        guard !removedFromInbox else { return }
        do {
            _ = try await inbox.count()
            if Date().timeIntervalSince(seed.createdAt) >= 7 * 86_400 { originalAvailable = false }
            if Date().timeIntervalSince(seed.createdAt) >= 30 * 86_400 {
                removedFromInbox = true
                task?.cancel(); draftTask?.cancel()
                fail("The local review expired. Reopen the saved source from the person page or import it again.", at: .recognition)
            }
        } catch { fail(error.localizedDescription, at: .recognition) }
    }
    private func run(stage: RelationshipCaptureStage, recoveryStage: RelationshipCaptureFailure.RecoveryStage,
                     operation: @escaping @MainActor () async throws -> Void) {
        task?.cancel()
        self.stage = stage
        task = Task { [weak self] in
            do { try await operation() }
            catch is CancellationError { }
            catch { self?.fail(error.localizedDescription, at: recoveryStage) }
        }
    }
    private func fail(_ message: String, at recoveryStage: RelationshipCaptureFailure.RecoveryStage) {
        stage = .failed(.init(title: "Review needs attention", message: message, recoveryStage: recoveryStage))
    }
    static func isCompleteDate(_ text: String) -> Bool {
        guard text.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil else { return false }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        guard let date = formatter.date(from: text) else { return false }
        return formatter.string(from: date) == text
    }
    private var resolvedPersonDisplayLabel: String? {
        if let canonical = recovery.capture?.identity.personDisplayLabel { return canonical }
        if case let .bind(candidate, _) = pendingDecision { return candidate.displayLabel }
        if case let .bindFromAgent(candidate, _) = pendingDecision { return candidate.displayLabel }
        return draft.displayNameHint.nonEmpty
    }
    private var resolvedRelationshipDisplayLabel: String? {
        if let canonical = recovery.capture?.identity.relationshipDisplayLabel { return canonical }
        if case let .bind(_, context) = pendingDecision, let context { return context.displayLabel }
        if case let .bindFromAgent(_, context) = pendingDecision { return context.displayLabel }
        return draft.relationshipLabel.nonEmpty
    }
}
private extension String {
    var nonEmpty: String? {
        let value = trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }
}
