import Foundation

@MainActor
final class RelationshipCaptureStore: ObservableObject {
    @Published private(set) var stage: RelationshipCaptureStage
    @Published var draft: RecognizedCaptureDraft
    @Published private(set) var identityCase: IdentityResolutionCase?
    @Published var selectedCandidateID: String?
    @Published var selectedContextID: String?

    let seed: PendingCaptureSeed

    private let recognizer: ConversationTextRecognizing
    private let service: RelationshipCaptureServing
    private var task: Task<Void, Never>?
    private var didStart = false
    private var captureResult: ResourceCaptureResult?
    private var pendingDecision: IdentityDecision?
    private var boundPersonID: String?
    private var boundContextID: String?

    init(
        seed: PendingCaptureSeed,
        recognizer: ConversationTextRecognizing = VisionConversationTextRecognizer(),
        service: RelationshipCaptureServing,
        initialDraft: RecognizedCaptureDraft? = nil
    ) {
        self.seed = seed
        self.recognizer = recognizer
        self.service = service
        draft = initialDraft ?? .empty
        stage = initialDraft == nil ? .recognizing : .reviewing
        didStart = initialDraft != nil
    }

    deinit {
        task?.cancel()
    }

    func start() {
        guard !didStart else { return }
        didStart = true
        recognize()
    }

    func recognize() {
        task?.cancel()
        stage = .recognizing
        task = Task { [weak self] in
            guard let self else { return }
            do {
                if let saved = try await PendingCaptureInbox.shared.loadDraft(
                    for: seed.id
                ) {
                    try Task.checkCancellation()
                    draft = saved
                    stage = .reviewing
                    return
                }
                let text = try await recognizer.recognizeText(in: seed.imageData)
                try Task.checkCancellation()
                draft = CaptureDraftBuilder.makeDraft(from: text)
                try await PendingCaptureInbox.shared.saveDraft(draft, for: seed.id)
                stage = .reviewing
            } catch is CancellationError {
                return
            } catch {
                stage = .failed(
                    RelationshipCaptureFailure(
                        title: "Text recognition stopped",
                        message: error.localizedDescription,
                        recoveryStage: .recognition
                    )
                )
            }
        }
    }

    func persistDraft() {
        let draft = draft
        task = Task {
            try? await PendingCaptureInbox.shared.saveDraft(draft, for: seed.id)
        }
    }

    func submitReviewedDraft() {
        guard draft.canSubmit else { return }
        task?.cancel()
        stage = .submitting
        task = Task { [weak self] in
            guard let self else { return }
            do {
                try await PendingCaptureInbox.shared.saveDraft(draft, for: seed.id)
                let result = try await service.createCapture(seed: seed, draft: draft)
                try Task.checkCancellation()
                captureResult = result
                try await continueAfterCapture(result)
            } catch is CancellationError {
                return
            } catch {
                stage = .failed(
                    RelationshipCaptureFailure(
                        title: "Source was not ready",
                        message: error.localizedDescription,
                        recoveryStage: .submission
                    )
                )
            }
        }
    }

    func selectCandidate(_ candidate: IdentityResolutionCandidate) {
        guard isCandidateSelectable(candidate) else { return }
        selectedCandidateID = candidate.personID
        selectedContextID = candidate.relationshipContexts.first?.id
    }

    func selectContext(_ context: RelationshipContextChoice) {
        selectedContextID = context.id
    }

    func isCandidateSelectable(_ candidate: IdentityResolutionCandidate) -> Bool {
        !(candidate.temporalRole == .historical && identityCase?.hasCurrentCandidate == true)
    }

    func bindSelectedCandidate() {
        guard let identityCase,
              let selectedCandidateID,
              let candidate = identityCase.candidates.first(
                where: { $0.personID == selectedCandidateID }
              ),
              isCandidateSelectable(candidate) else {
            return
        }
        let context = candidate.relationshipContexts.first {
            $0.id == selectedContextID
        }
        decide(.bind(candidate: candidate, context: context))
    }

    func createNewPerson() {
        guard draft.displayNameHint.nonEmpty != nil else { return }
        decide(.createNew)
    }

    func leaveUnresolved() {
        decide(.leaveUnresolved)
    }

    func retry() {
        guard case let .failed(failure) = stage else { return }
        switch failure.recoveryStage {
        case .recognition:
            recognize()
        case .submission:
            submitReviewedDraft()
        case .identity:
            if let pendingDecision {
                decide(pendingDecision)
            } else if let caseID = captureResult?.identity.resolutionCaseID {
                loadIdentityCase(caseID)
            } else {
                submitReviewedDraft()
            }
        case .compilation:
            guard let boundPersonID, let boundContextID else {
                submitReviewedDraft()
                return
            }
            compileWiki(personID: boundPersonID, contextID: boundContextID)
        }
    }

    func returnToReview() {
        task?.cancel()
        pendingDecision = nil
        stage = .reviewing
    }

    func discard() async {
        task?.cancel()
        try? await PendingCaptureInbox.shared.remove(id: seed.id)
    }

    private func continueAfterCapture(_ result: ResourceCaptureResult) async throws {
        if let personID = result.identity.personID,
           let contextID = result.identity.relationshipContextID {
            boundPersonID = personID
            boundContextID = contextID
            compileWiki(personID: personID, contextID: contextID)
            return
        }
        guard let caseID = result.identity.resolutionCaseID else {
            try? await PendingCaptureInbox.shared.remove(id: seed.id)
            stage = .completed(
                RelationshipCaptureCompletion(
                    captureID: result.captureID,
                    personID: nil,
                    personDisplayLabel: nil,
                    relationshipContextID: nil,
                    relationshipDisplayLabel: nil,
                    resourceID: result.resource.id,
                    decision: "unresolved",
                    wiki: nil
                )
            )
            return
        }
        loadIdentityCase(caseID)
    }

    private func loadIdentityCase(_ caseID: String) {
        task?.cancel()
        stage = .submitting
        task = Task { [weak self] in
            guard let self else { return }
            do {
                let loaded = try await service.loadIdentityCase(id: caseID)
                try Task.checkCancellation()
                identityCase = loaded
                selectedCandidateID = nil
                selectedContextID = nil
                pendingDecision = nil
                stage = .resolvingIdentity
            } catch is CancellationError {
                return
            } catch {
                stage = .failed(
                    RelationshipCaptureFailure(
                        title: "Identity review could not load",
                        message: error.localizedDescription,
                        recoveryStage: .identity
                    )
                )
            }
        }
    }

    private func decide(_ decision: IdentityDecision) {
        guard let identityCase,
              let captureID = captureResult?.captureID,
              let resourceID = captureResult?.resource.id else {
            return
        }
        task?.cancel()
        pendingDecision = decision
        stage = .decidingIdentity
        task = Task { [weak self] in
            guard let self else { return }
            do {
                let result = try await service.decideIdentity(
                    identityCase: identityCase,
                    decision: decision,
                    seed: seed,
                    draft: draft
                )
                try Task.checkCancellation()
                if result.identityStatus == "bound",
                   let personID = result.personID,
                   let contextID = result.relationshipContextID {
                    boundPersonID = personID
                    boundContextID = contextID
                    compileWiki(personID: personID, contextID: contextID)
                    return
                }
                try? await PendingCaptureInbox.shared.remove(id: seed.id)
                stage = .completed(
                    RelationshipCaptureCompletion(
                        captureID: captureID,
                        personID: nil,
                        personDisplayLabel: nil,
                        relationshipContextID: nil,
                        relationshipDisplayLabel: nil,
                        resourceID: resourceID,
                        decision: result.decision,
                        wiki: nil
                    )
                )
            } catch is CancellationError {
                return
            } catch {
                stage = .failed(
                    RelationshipCaptureFailure(
                        title: "Identity was not changed",
                        message: error.localizedDescription,
                        recoveryStage: .identity
                    )
                )
            }
        }
    }

    private func compileWiki(personID: String, contextID: String) {
        guard let captureID = captureResult?.captureID,
              let resourceID = captureResult?.resource.id else { return }
        task?.cancel()
        stage = .compilingWiki
        task = Task { [weak self] in
            guard let self else { return }
            do {
                let wiki = try await service.compileWiki(
                    personID: personID,
                    relationshipContextID: contextID,
                    seedID: seed.id
                )
                try Task.checkCancellation()
                try? await PendingCaptureInbox.shared.remove(id: seed.id)
                stage = .completed(
                    RelationshipCaptureCompletion(
                        captureID: captureID,
                        personID: personID,
                        personDisplayLabel: resolvedPersonDisplayLabel,
                        relationshipContextID: contextID,
                        relationshipDisplayLabel: resolvedRelationshipDisplayLabel,
                        resourceID: resourceID,
                        decision: pendingDecision.map(Self.decisionLabel) ?? "already_bound",
                        wiki: wiki
                    )
                )
            } catch is CancellationError {
                return
            } catch {
                stage = .failed(
                    RelationshipCaptureFailure(
                        title: "Wiki still needs compilation",
                        message: error.localizedDescription,
                        recoveryStage: .compilation
                    )
                )
            }
        }
    }

    private static func decisionLabel(_ decision: IdentityDecision) -> String {
        switch decision {
        case .bind:
            return "bind_existing"
        case .createNew:
            return "create_new"
        case .leaveUnresolved:
            return "leave_unresolved"
        }
    }

    private var resolvedPersonDisplayLabel: String? {
        if case let .bind(candidate, _) = pendingDecision {
            return candidate.displayLabel
        }
        return draft.displayNameHint.nonEmpty
    }

    private var resolvedRelationshipDisplayLabel: String? {
        if case let .bind(_, context) = pendingDecision, let context {
            return context.displayLabel
        }
        return draft.relationshipLabel.nonEmpty
    }
}


private extension String {
    var nonEmpty: String? {
        let value = trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }
}
