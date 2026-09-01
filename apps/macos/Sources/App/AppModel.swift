import AppKit
import Foundation

@MainActor
final class AppModel: ObservableObject {
    @Published var capsule = ContextCapsuleDraft()
    @Published var mode: WorkspaceMode
    @Published var presentation: WorkspacePresentation
    @Published var isSyntheticFixture = true
    @Published var isPaused = false
    @Published var selectedNavigation: NavigationDestination? = .workspace
    @Published var errorMessage: String?
    @Published var deletionReceipt: String?
    @Published var lastSubmittedManifest: SubmittedContextManifest?
    @Published var factReviewStatus: FactReviewStatus = .proposed
    @Published var localDraftStatus: LocalDraftStatus = .awaitingDecision
    @Published var pendingDecision: CanonicalProposalReview?
    @Published var canonicalReceipt: CanonicalPursuitReceipt?
    @Published var identityReviewReceipt: IdentityReviewReceipt?
    @Published var decisionSelections: [String: CanonicalDecisionChoice] = [:]
    @Published var scopeReviewStatus: RelationshipScopeReviewStatus
    @Published var localRecoveryNotice: String?
    @Published var intakeControlReceipt: String?
    @Published var isSignedOut = false
    @Published var relationshipScopeOptions: [RelationshipScopeOption]
    @Published var selectedScopeOptionID: String?
    @Published var isAccessibilityZoomPreview = ProcessInfo.processInfo.arguments.contains("--accessibility-zoom-200")
    @Published var isReducedMotionPreview = ProcessInfo.processInfo.arguments.contains("--reduced-motion-preview")
    @Published var isSelectingWindow = false
    @Published var windowCaptureReceipt: String?
    @Published var runAudit: RunAuditSummary?

    let service: any MacRelationshipServing
    private let capsuleStore: any LocalCapsulePersisting
    private let windowCapture: any WindowCapturing
    private let preparedDraftClipboard: any PreparedDraftCopying
    private var recoveredAccountIDs: Set<String> = []
    private(set) var accountID: String
    private(set) var pursuitID: String?
    private(set) var personID: String?
    private(set) var relationshipContextID: String?
    private(set) var currentTaskID: String?

    var identityTags: [String] {
        if isSyntheticFixture,
           let raw = Self.value(after: "--identity-tag-count", in: ProcessInfo.processInfo.arguments),
           let count = Int(raw) {
            return Array(["Candidate role", "Scope confirmed", "Candidate-authored source"].prefix(max(0, min(3, count))))
        }
        var tags: [String] = []
        if personID != nil { tags.append("Candidate role") }
        if scopeReviewStatus == .confirmed { tags.append("Scope confirmed") }
        if capsule.sharedItems.contains(where: { $0.actorKind == .candidate }) {
            tags.append("Candidate-authored source")
        }
        return Array(tags.prefix(3))
    }

    var menuBarPrivacySummary: String {
        isSyntheticFixture
            ? "Synthetic fixture · no private source content"
            : "Connected · person, Pursuit, evidence, and message content hidden"
    }

    init(
        service: any MacRelationshipServing,
        initialMode: WorkspaceMode = .ready,
        accountID: String = "synthetic-account",
        pursuitID: String? = "synthetic-pursuit",
        personID: String? = "synthetic-person",
        relationshipContextID: String? = "synthetic-relationship-context",
        capsuleStore: any LocalCapsulePersisting = NullLocalCapsuleStore(),
        windowCapture: (any WindowCapturing)? = nil,
        preparedDraftClipboard: (any PreparedDraftCopying)? = nil
    ) {
        self.service = service
        self.mode = initialMode
        self.accountID = accountID
        self.pursuitID = pursuitID
        self.personID = personID
        self.relationshipContextID = relationshipContextID
        self.capsuleStore = capsuleStore
        self.windowCapture = windowCapture ?? SystemWindowCaptureService.shared
        self.preparedDraftClipboard = preparedDraftClipboard ?? SystemPreparedDraftClipboard()
        self.scopeReviewStatus = [.empty, .ready].contains(initialMode) ? .proposed : .confirmed
        let syntheticOption = Self.syntheticScopeOption
        self.relationshipScopeOptions = [syntheticOption]
        self.selectedScopeOptionID = [.empty, .ready].contains(initialMode) ? nil : syntheticOption.id
        self.presentation = [.empty, .ready].contains(initialMode)
            ? Self.unboundScopePresentation
            : FixtureRelationshipService.fixture(mode: initialMode).presentation
    }

    static func bootstrap() -> AppModel {
        let arguments = ProcessInfo.processInfo.arguments
        let fixtureState = value(after: "--fixture-state", in: arguments)
            .flatMap(WorkspaceMode.argumentValue) ?? .ready

        if let rawBaseURL = value(after: "--live-backend", in: arguments),
           let baseURL = URL(string: rawBaseURL),
           let service = try? URLMacRelationshipService(
               configuration: .init(
                   baseURL: baseURL,
                   accountSlug: value(after: "--account-slug", in: arguments) ?? "fixture-alpha",
                   userEmail: value(after: "--user-email", in: arguments) ?? "recruiter@alpha.local"
               ),
               unknownResolutionStore: SecureUnknownResolutionStore.shared
           ) {
            let model = AppModel(
                service: service,
                initialMode: .working,
                accountID: "pending-live-account",
                pursuitID: nil,
                personID: nil,
                relationshipContextID: nil,
                capsuleStore: SecureLocalCapsuleStore.shared
            )
            model.isSyntheticFixture = false
            return model
        }

        // Fixture mode is an explicit, separate service result and is always
        // labeled in the UI. It is never treated as backend proof.
        return AppModel(
            service: FixtureRelationshipService(initialMode: fixtureState),
            initialMode: fixtureState
        )
    }

    private static func value(after flag: String, in arguments: [String]) -> String? {
        guard let index = arguments.firstIndex(of: flag), arguments.indices.contains(index + 1) else { return nil }
        return arguments[index + 1]
    }

    func load() async {
        do {
            apply(try await service.loadWorkspace())
        } catch {
            fail(error)
        }
    }

    func addSelectedText(_ text: String) {
        guard !isSignedOut else {
            errorMessage = "Sign in before creating a new Context Capsule."
            return
        }
        guard !isPaused else {
            errorMessage = "Context intake is paused. Resume before adding anything."
            return
        }
        capsule.addSelectedText(text)
        persistCapsule()
        mode = capsule.items.isEmpty ? .empty : .ready
        errorMessage = nil
    }

    func addFiles(_ urls: [URL]) {
        guard !isSignedOut else {
            errorMessage = "Sign in before creating a new Context Capsule."
            return
        }
        guard !isPaused else {
            errorMessage = "Context intake is paused. Resume before adding anything."
            return
        }
        for url in urls {
            let didAccess = url.startAccessingSecurityScopedResource()
            defer { if didAccess { url.stopAccessingSecurityScopedResource() } }
            let attributes = try? FileManager.default.attributesOfItem(atPath: url.path)
            let size = (attributes?[.size] as? NSNumber)?.int64Value
            capsule.addFile(url: url, size: size)
        }
        persistCapsule()
        mode = capsule.items.isEmpty ? .empty : .ready
        errorMessage = nil
    }

    func addSystemSelectedWindow() async {
        guard !isSignedOut else {
            errorMessage = "Sign in before creating a new Context Capsule."
            return
        }
        guard !isPaused else {
            errorMessage = "Context intake is paused. Resume before adding anything."
            return
        }
        guard !isSelectingWindow else { return }

        isSelectingWindow = true
        windowCaptureReceipt = "Waiting for the macOS single-window picker. Nothing has been captured yet."
        defer { isSelectingWindow = false }
        do {
            let captured = try await windowCapture.captureOneWindow()
            capsule.addWindowCapture(
                recognizedText: captured.recognizedText,
                imagePNG: captured.imagePNG,
                pixelWidth: captured.pixelWidth,
                pixelHeight: captured.pixelHeight,
                sourceFingerprint: captured.sourceFingerprint
            )
            persistCapsule()
            mode = .ready
            let derivative: String
            if captured.localTextRecognition == .unavailable {
                derivative = "Local text recognition was unavailable. The encrypted image remains on this Mac; no cloud fallback ran."
            } else if captured.recognizedText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                derivative = "No text derivative was recognized; the image cannot leave this Mac."
            } else {
                derivative = "Local OCR produced a reviewable text derivative; it remains local-only until you change the visible boundary."
            }
            windowCaptureReceipt = "Captured exactly one frame from the system-selected window. No cursor or audio was captured. \(derivative)"
            errorMessage = nil
        } catch WindowCaptureError.cancelled {
            windowCaptureReceipt = "Window selection cancelled. Nothing was captured or retained."
            errorMessage = nil
        } catch {
            windowCaptureReceipt = "Window capture failed before a Capsule item was created."
            fail(error)
        }
    }

    func removeCapsuleItem(id: UUID) {
        capsule.remove(id: id)
        persistCapsule()
        mode = capsule.items.isEmpty ? .empty : .ready
    }

    func setLocalOnly(id: UUID, value: Bool) {
        capsule.setLocalOnly(id: id, value: value)
        persistCapsule()
    }

    func setRetention(id: UUID, value: CapsuleRetention) {
        capsule.setRetention(id: id, value: value)
        persistCapsule()
    }

    func setAttribution(id: UUID, actorKind: CapsuleActorKind?) {
        capsule.setActorKind(id: id, value: actorKind)
        persistCapsule()
    }

    func confirmAttribution(id: UUID) {
        capsule.confirmAttribution(id: id)
        persistCapsule()
    }

    func attributeFirstUnresolvedItemToCandidate() {
        guard let item = capsule.items.first(where: { !$0.hasConfirmedAttribution }) else { return }
        setAttribution(id: item.id, actorKind: .candidate)
    }

    func confirmFirstPendingAttribution() {
        guard let item = capsule.items.first(where: {
            $0.actorKind != nil && !$0.hasConfirmedAttribution
        }) else { return }
        confirmAttribution(id: item.id)
    }

    func redactCapsuleItem(id: UUID, exactTerms: [String]) {
        let count = capsule.redact(id: id, exactTerms: exactTerms)
        errorMessage = count == 0
            ? "No matching text was redacted. Enter an exact visible term."
            : nil
        if count > 0 { persistCapsule() }
    }

    func submitCapsule() async {
        do {
            guard scopeReviewStatus == .confirmed else {
                throw RelationshipServiceError.invalidResponse("Confirm the Pursuit, Person, and relationship context, or keep identity unresolved, before submission.")
            }
            let manifest = try capsule.freeze(accountID: accountID, pursuitID: pursuitID, personID: personID)
            lastSubmittedManifest = manifest
            mode = .working
            errorMessage = nil
            apply(try await service.submit(manifest: manifest))
        } catch {
            fail(error)
        }
    }

    var canSubmitCapsule: Bool {
        scopeReviewStatus == .confirmed && capsule.canSubmit && mode != .working
    }

    func confirmRelationshipScope() async {
        guard let selectedScopeOptionID,
              let option = relationshipScopeOptions.first(where: { $0.id == selectedScopeOptionID }) else {
            errorMessage = "Select one exact Pursuit, Person, and relationship context, or keep identity unresolved."
            return
        }
        guard pursuitID == option.pursuitID,
              personID == option.personID,
              relationshipContextID == option.relationshipContextID else {
            errorMessage = "The proposed relationship scope is incomplete. Keep it unresolved instead of guessing."
            return
        }
        do {
            try await service.confirmScope(option.selection)
            scopeReviewStatus = .confirmed
            errorMessage = nil
        } catch {
            fail(error)
        }
    }

    func selectRelationshipScopeOption(id: String) {
        guard scopeReviewStatus == .proposed,
              let option = relationshipScopeOptions.first(where: { $0.id == id }) else { return }
        selectedScopeOptionID = option.id
        pursuitID = option.pursuitID
        personID = option.personID
        relationshipContextID = option.relationshipContextID
        presentation = option.presentation
        errorMessage = nil
    }

    func selectFirstRelationshipScopeFromKeyboard() {
        guard selectedScopeOptionID == nil, let first = relationshipScopeOptions.first else { return }
        selectRelationshipScopeOption(id: first.id)
    }

    func keepRelationshipScopeUnresolved() {
        scopeReviewStatus = .unresolved
        selectedScopeOptionID = nil
        pursuitID = nil
        personID = nil
        relationshipContextID = nil
        mode = .ambiguousIdentity
        pendingDecision = nil
        runAudit = nil
        canonicalReceipt = nil
        decisionSelections = [:]
        errorMessage = nil
    }

    func clearLocalContext() {
        let count = capsule.items.count
        let localReceipt: LocalCapsuleDeletionReceipt
        do {
            localReceipt = try capsuleStore.clear(accountID: accountID, deleteKey: false)
        } catch {
            fail(error)
            return
        }
        capsule = ContextCapsuleDraft()
        lastSubmittedManifest = nil
        pendingDecision = nil
        runAudit = nil
        canonicalReceipt = nil
        identityReviewReceipt = nil
        decisionSelections = [:]
        presentation = .cleared
        scopeReviewStatus = .proposed
        selectedScopeOptionID = nil
        mode = .deleted
        deletionReceipt = "Deleted \(count) visible local Capsule item\(count == 1 ? "" : "s")\(localReceipt.deletedFile ? " and its encrypted recovery file" : ""). No external record was changed."
        localRecoveryNotice = nil
        errorMessage = nil
    }

    func togglePause() {
        guard !isSignedOut else {
            errorMessage = "Sign in before resuming context intake."
            return
        }
        isPaused.toggle()
        intakeControlReceipt = isPaused
            ? "Paused new context intake. Existing local Capsule items were retained; no canonical Task was stopped."
            : "Resumed manual context intake. Nothing is captured until you explicitly add it."
        errorMessage = nil
    }

    func toggleAccessibilityZoomPreview() {
        guard isSyntheticFixture else { return }
        isAccessibilityZoomPreview.toggle()
    }

    func toggleReducedMotionPreview() {
        guard isSyntheticFixture else { return }
        isReducedMotionPreview.toggle()
    }

    func stopContextIntake() {
        guard !isSignedOut else {
            errorMessage = "Context intake is already stopped because this Mac is signed out."
            return
        }
        let count = capsule.items.count
        do {
            let local = try capsuleStore.clear(accountID: accountID, deleteKey: false)
            capsule = ContextCapsuleDraft()
            lastSubmittedManifest = nil
            isPaused = true
            localRecoveryNotice = nil
            let taskBoundary = currentTaskID.map {
                "Canonical Task \($0) was not cancelled; its status remains visible separately."
            } ?? "No canonical Task was active."
            intakeControlReceipt = "Stopped local context intake and deleted \(count) visible local item\(count == 1 ? "" : "s")\(local.deletedFile ? " plus its encrypted recovery file" : ""). \(taskBoundary)"
            deletionReceipt = intakeControlReceipt
            if ![.working, .needsDecision, .receipt, .outcomeUnknown, .failed].contains(mode) {
                mode = count > 0 ? .deleted : .empty
            }
            errorMessage = nil
        } catch {
            isPaused = true
            errorMessage = "Intake paused, but local Capsule deletion could not be verified: \(error.localizedDescription)"
            intakeControlReceipt = "Stopped accepting new context. Existing local recovery may remain until deletion succeeds; no canonical Task was cancelled."
        }
    }

    func signOutAndClearLocalData() async {
        let priorAccountID = accountID
        var remoteReceipt: SessionSignOutReceipt?
        var remoteFailure: Error?
        do {
            remoteReceipt = try await service.signOut()
        } catch {
            remoteFailure = error
        }

        var localReceipt: LocalCapsuleDeletionReceipt?
        var localFailure: Error?
        do {
            localReceipt = try capsuleStore.clear(accountID: priorAccountID, deleteKey: true)
        } catch {
            localFailure = error
        }

        // In-memory authority and content are always removed. A disk deletion
        // failure remains visible and never causes the old signed-in workspace
        // to be presented again.
        capsule = ContextCapsuleDraft()
        lastSubmittedManifest = nil
        pendingDecision = nil
        runAudit = nil
        canonicalReceipt = nil
        identityReviewReceipt = nil
        decisionSelections = [:]
        presentation = .cleared
        accountID = "signed-out"
        pursuitID = nil
        personID = nil
        relationshipContextID = nil
        currentTaskID = nil
        relationshipScopeOptions = []
        selectedScopeOptionID = nil
        scopeReviewStatus = .unresolved
        isPaused = true
        isSignedOut = true
        mode = .empty
        localRecoveryNotice = nil
        intakeControlReceipt = "Signed out. This Mac will not accept new context until a new authenticated session is established."

        let remoteSummary: String
        if let remoteReceipt {
            remoteSummary = "Remote session \(remoteReceipt.sessionID) was revoked at \(remoteReceipt.revokedAt)."
        } else {
            remoteSummary = "Remote session revocation is outcome-unknown. This Mac discarded its local session authority; reconnect to verify the server session."
        }
        let localSummary: String
        if let localReceipt {
            localSummary = "\(localReceipt.deletedFile ? "Deleted encrypted Capsule recovery." : "No Capsule recovery file remained.") \(localReceipt.deletedKey ? "Deleted the account-scoped local key." : "No account-scoped local key remained.")"
        } else {
            localSummary = "Encrypted recovery deletion could not be verified."
        }
        deletionReceipt = "\(remoteSummary) \(localSummary) Visible local context and relationship authority were cleared."

        if let localFailure {
            errorMessage = "Signed out locally, but local recovery deletion needs attention: \(localFailure.localizedDescription)"
        } else if let remoteFailure {
            errorMessage = "Signed out locally; remote revocation outcome is unknown: \(remoteFailure.localizedDescription)"
        } else {
            errorMessage = nil
        }
    }

    func selectFixtureState(_ state: WorkspaceMode) {
        guard isSyntheticFixture else { return }
        apply(.syntheticFixture(FixtureRelationshipService.fixture(mode: state)))
    }

    func openActionProjection(_ action: ActionProjection) async {
        selectedNavigation = .workspace
        if isSyntheticFixture {
            let target: WorkspaceMode = switch action.route {
            case .reviewDecision: .needsDecision
            case .reconcileOperation: .outcomeUnknown
            case .openReceipt: .receipt
            case .reviewStaleSource: .stale
            case .openCurrent: mode
            }
            apply(.syntheticFixture(FixtureRelationshipService.fixture(mode: target)))
            return
        }

        do {
            mode = .working
            errorMessage = nil
            apply(try await service.openProjection(.init(
                objectID: action.id,
                route: action.route
            )))
        } catch {
            fail(error)
        }
    }

    func copyPreparedDraft() {
        let text = "Could you confirm the exact remote-work policy for this role before Wednesday? Draft prepared by Talent Signal; review before sending."
        if preparedDraftClipboard.copyPreparedDraft(text) {
            localDraftStatus = .copied
            errorMessage = nil
        } else {
            localDraftStatus = .prepared
            errorMessage = "The draft remains prepared, but macOS did not confirm the clipboard write. Copy again; nothing was sent."
        }
    }

    func returnToCapsuleAfterFailure() {
        guard mode == .failed else { return }
        errorMessage = nil
        mode = capsule.items.isEmpty ? .empty : .ready
        intakeControlReceipt = "Returned to local Capsule review. No Task, decision, or external action was retried. Canonical failure history remains in Action Center."
    }

    func confirmFactProposal() {
        factReviewStatus = .confirmed
    }

    func dismissFactProposal() {
        factReviewStatus = .dismissed
    }

    func prepareLocalDraft() {
        localDraftStatus = .prepared
    }

    func saveIdentityForReview() {
        guard mode == .ambiguousIdentity else { return }
        identityReviewReceipt = IdentityReviewReceipt(
            id: "identity-review-\(UUID().uuidString.lowercased())",
            taskID: currentTaskID,
            summary: isSyntheticFixture
                ? "Synthetic identity review saved. No person was bound and no fact or action authority was granted."
                : "The canonical Agent Task remains unresolved. No person was bound and no fact or action authority was granted.",
            occurredAt: Date()
        )
        pendingDecision = nil
        runAudit = nil
        canonicalReceipt = nil
        decisionSelections = [:]
        mode = .identityReviewSaved
    }

    func setDecision(itemID: String, choice: CanonicalDecisionChoice) {
        guard pendingDecision?.items.contains(where: { $0.id == itemID }) == true else { return }
        decisionSelections[itemID] = choice
    }

    func decideNextCanonicalItem(_ choice: CanonicalDecisionChoice) {
        guard let item = pendingDecision?.items.first(where: { decisionSelections[$0.id] == nil }) else { return }
        setDecision(itemID: item.id, choice: choice)
    }

    var canResolveCanonicalDecision: Bool {
        guard let pendingDecision else { return false }
        return !pendingDecision.items.isEmpty &&
            pendingDecision.items.allSatisfy { decisionSelections[$0.id] != nil }
    }

    func resolveCanonicalDecision() async {
        guard let pendingDecision, canResolveCanonicalDecision else {
            errorMessage = "Choose Confirm, Reject, or Keep unresolved for every proposal item."
            return
        }
        let decisions = pendingDecision.items.compactMap { item in
            decisionSelections[item.id].map {
                CanonicalDecisionRequest.Decision(itemID: item.id, choice: $0)
            }
        }
        do {
            mode = .working
            errorMessage = nil
            apply(try await service.resolveDecision(.init(
                bundleID: pendingDecision.bundleID,
                taskID: pendingDecision.taskID,
                taskRevision: pendingDecision.taskRevision,
                bundleRevision: pendingDecision.bundleRevision,
                proposalID: pendingDecision.proposalID,
                baseRevision: pendingDecision.baseRevision,
                reason: "The recruiter reviewed exact evidence, before and proposed values, effect, and authority in Talent Signal for Mac.",
                decisions: decisions
            )))
        } catch {
            fail(error)
        }
    }

    func reconcileCanonicalDecision() async {
        do {
            mode = .working
            errorMessage = nil
            apply(try await service.reconcileDecisionOutcome())
        } catch {
            fail(error)
        }
    }

    private func apply(_ response: MacRelationshipServiceResponse) {
        switch response {
        case .connected(let scope):
            let priorAccountID = accountID
            if priorAccountID != scope.accountID {
                // An authenticated account change is an authority boundary.
                // Never carry the previous account's in-memory Capsule,
                // manifest, decisions, or receipts into the new workspace.
                capsule = ContextCapsuleDraft()
                lastSubmittedManifest = nil
                pendingDecision = nil
                runAudit = nil
                canonicalReceipt = nil
                identityReviewReceipt = nil
                decisionSelections = [:]
                localRecoveryNotice = nil
                deletionReceipt = nil
                recoveredAccountIDs.remove(scope.accountID)
            }
            isSyntheticFixture = false
            isSignedOut = false
            accountID = scope.accountID
            pursuitID = nil
            personID = nil
            relationshipContextID = nil
            currentTaskID = nil
            relationshipScopeOptions = scope.options
            selectedScopeOptionID = nil
            presentation = scope.presentation
            pendingDecision = nil
            runAudit = nil
            canonicalReceipt = nil
            identityReviewReceipt = nil
            decisionSelections = [:]
            scopeReviewStatus = .proposed
            mode = .ready
            recoverCapsuleIfNeeded(accountID: scope.accountID)
        case .syntheticFixture(let fixture):
            isSyntheticFixture = true
            isSignedOut = false
            mode = fixture.mode
            presentation = [.empty, .ready].contains(fixture.mode)
                ? Self.unboundScopePresentation
                : fixture.presentation
            factReviewStatus = .proposed
            localDraftStatus = .awaitingDecision
            pendingDecision = fixture.mode == .needsDecision ? FixtureRelationshipService.decisionReviewFixture() : nil
            canonicalReceipt = fixture.mode == .receipt ? FixtureRelationshipService.receiptFixture() : nil
            runAudit = nil
            identityReviewReceipt = fixture.mode == .identityReviewSaved
                ? FixtureRelationshipService.identityReviewReceiptFixture()
                : nil
            decisionSelections = [:]
            scopeReviewStatus = [.empty, .ready].contains(fixture.mode) ? .proposed : .confirmed
            relationshipScopeOptions = [Self.syntheticScopeOption]
            selectedScopeOptionID = [.empty, .ready].contains(fixture.mode) ? nil : Self.syntheticScopeOption.id
            if selectedScopeOptionID != nil {
                pursuitID = Self.syntheticScopeOption.pursuitID
                personID = Self.syntheticScopeOption.personID
                relationshipContextID = Self.syntheticScopeOption.relationshipContextID
            }
        case .canonical(let readback):
            guard readback.provesCanonicalSafeReadback else {
                fail(RelationshipServiceError.canonicalReadbackIncomplete)
                return
            }
            isSyntheticFixture = false
            isSignedOut = false
            accountID = readback.accountID
            pursuitID = readback.pursuitID
            personID = readback.personID
            relationshipContextID = readback.relationshipContextID
            currentTaskID = readback.taskID
            presentation = readback.presentation
            mode = readback.displayMode
            pendingDecision = readback.pendingDecision
            canonicalReceipt = readback.receipt
            runAudit = readback.runAudit
            identityReviewReceipt = nil
            decisionSelections = [:]
            scopeReviewStatus = .confirmed
            relationshipScopeOptions = relationshipScopeOptions.filter {
                $0.pursuitID == readback.pursuitID &&
                    $0.personID == readback.personID &&
                    $0.relationshipContextID == readback.relationshipContextID
            }
            selectedScopeOptionID = relationshipScopeOptions.first?.id
            if [.noAction, .receipt, .failed].contains(readback.displayMode) {
                let purged = capsule.purgeTaskOnlyItems()
                if purged > 0 {
                    persistCapsule()
                    localRecoveryNotice = "Deleted \(purged) task-only local Capsule item\(purged == 1 ? "" : "s") after the canonical task ended."
                }
            }
        }
    }

    private func fail(_ error: Error) {
        if case .staleAuthority = error as? RelationshipServiceError {
            mode = .stale
            pendingDecision = nil
            decisionSelections = [:]
            presentation = WorkspacePresentation(
                candidateName: presentation.candidateName,
                pursuitTitle: presentation.pursuitTitle,
                relationshipContext: presentation.relationshipContext,
                changedSummary: "The reviewed source changed after preview.",
                evidenceQuote: "The prior excerpt is no longer available as current decision authority.",
                evidenceSource: "Canonical source revalidation",
                dependency: "Review the changed evidence and submit a new immutable Capsule version before deciding.",
                proposal: "The prior proposal is stale and cannot be confirmed.",
                actionProjections: presentation.actionProjections.map {
                    ActionProjection(
                        id: $0.id,
                        objectName: $0.objectName,
                        consequence: "No decision write was sent",
                        authority: "Current source authority failed revalidation",
                        status: .stale,
                        nextOperation: "Review changed context and create a new Task version",
                        route: .reviewStaleSource
                    )
                }
            )
            errorMessage = error.localizedDescription
            return
        }
        mode = .failed
        errorMessage = error.localizedDescription
    }

    private func persistCapsule() {
        do {
            try capsuleStore.save(capsule, accountID: accountID, now: Date())
        } catch {
            errorMessage = "Local recovery was not updated: \(error.localizedDescription)"
        }
    }

    private func recoverCapsuleIfNeeded(accountID: String) {
        guard !recoveredAccountIDs.contains(accountID), capsule.items.isEmpty else { return }
        recoveredAccountIDs.insert(accountID)
        do {
            let recovery = try capsuleStore.load(accountID: accountID, now: Date())
            capsule = recovery.draft
            if !capsule.items.isEmpty {
                mode = .ready
                localRecoveryNotice = "Recovered \(capsule.items.count) encrypted local Capsule item\(capsule.items.count == 1 ? "" : "s") for review. Nothing was submitted automatically."
            } else if recovery.expiredItemCount > 0 {
                localRecoveryNotice = "Expired and deleted \(recovery.expiredItemCount) local Capsule item\(recovery.expiredItemCount == 1 ? "" : "s") before recovery."
            }
        } catch {
            errorMessage = "Local Capsule recovery failed closed: \(error.localizedDescription)"
        }
    }

    private static let syntheticScopeOption = RelationshipScopeOption(
        id: "synthetic-scope",
        pursuitID: "synthetic-pursuit",
        pursuitRevision: 1,
        pursuitTitle: "VP Engineering · APAC platform expansion",
        personID: "synthetic-person",
        personDisplayLabel: "Alexandra 陈嘉宁-Sørensen — International Leadership & Platform Transformation",
        relationshipContextID: "synthetic-relationship-context",
        relationshipContextLabel: "Candidate in this Pursuit · identity deliberately reviewable"
    )

    private static let unboundScopePresentation = WorkspacePresentation(
        candidateName: "Choose a Person or keep identity unresolved",
        pursuitTitle: "Relationship scope required",
        relationshipContext: "No Pursuit, Person, or relationship context is selected.",
        changedSummary: "Review the available source owner before adding task authority.",
        evidenceQuote: "No source has been submitted from this Mac.",
        evidenceSource: "Unbound local workspace",
        dependency: "A recruiter must explicitly select one exact scope or preserve an unresolved outcome.",
        proposal: "No proposal exists until a reviewed Capsule is submitted.",
        actionProjections: []
    )
}

enum NavigationDestination: String, CaseIterable, Identifiable {
    case workspace = "Relationship Workspace"
    case actionCenter = "Action Center"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .workspace: "rectangle.split.3x1"
        case .actionCenter: "checklist"
        }
    }
}
