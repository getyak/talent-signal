import Foundation

/// Owns the in-flight Ask submission state for `RelationshipAskView`.
///
/// The view keeps one state value instead of seven unrelated `@State` fields.
/// Task-handle ownership and repeated lifecycle transitions live here; domain
/// branches may still update individual visible values while the remaining
/// orchestration is decomposed incrementally.
struct RelationshipAskOperationState {
    /// Whether an Ask submission currently owns the composer and status bar.
    var isSending = false
    /// Objective accepted for the submission but not yet protected/recorded.
    var pendingObjective: String?
    /// Objective of the scoped send that is waiting for its turn to be rendered.
    var pendingScopedSend: String?
    /// What the pending turn should show while the relationship is resolved.
    var relationshipRecallPhase: RelationshipRecallPhase = .idle
    /// Which submission surface the composer status should render.
    var askSubmissionPhase: AskSubmissionPhase = .idle
    /// The single in-flight Ask operation. A newer operation replaces it.
    private(set) var askOperation: Task<Void, Never>?
    /// Identity of the operation that owns `askOperation`; a stale completion
    /// whose identity no longer matches must be ignored.
    private(set) var operationID: UUID?

    // MARK: - Lifecycle

    /// Marks the start of a submission for `objective` before its protected
    /// Session exists. The caller clears the composer and focuses afterwards.
    mutating func beginSubmission(objective: String) {
        pendingObjective = objective
        isSending = true
    }

    /// Records the accepted objective of a scoped send and publishes the recall
    /// phase the pending turn renders while the Ask resolves.
    mutating func adoptScopedSend(
        objective: String,
        recallPhase: RelationshipRecallPhase
    ) {
        pendingScopedSend = objective
        relationshipRecallPhase = recallPhase
    }

    /// Replaces any in-flight operation, cancelling the prior task, before
    /// creating the replacement with a new ownership identity.
    ///
    /// The factory receives the identity before it creates the Task, so even a
    /// cancellation-unaware replacement can verify ownership after suspension.
    @discardableResult
    mutating func replaceOperation(
        with makeOperation: (UUID) -> Task<Void, Never>
    ) -> UUID {
        cancelOperation()
        let replacementID = UUID()
        operationID = replacementID
        askOperation = makeOperation(replacementID)
        return replacementID
    }

    /// Cancels and forgets the in-flight operation and its ownership without
    /// touching the visible phases or pending values.
    mutating func cancelOperation() {
        operationID = nil
        askOperation?.cancel()
        askOperation = nil
    }

    /// Reports whether `candidateID` still owns the in-flight operation.
    func isCurrentOperation(_ candidateID: UUID) -> Bool {
        operationID == candidateID
    }

    /// Atomically releases the operation handle and identity only when
    /// `candidateID` is still current. A stale completion is rejected so a
    /// superseded operation cannot unlock or reset a newer operation's UI.
    ///
    /// - Returns: `true` when the current ownership was released.
    @discardableResult
    mutating func finishOperationIfCurrent(_ candidateID: UUID) -> Bool {
        guard operationID == candidateID else { return false }
        operationID = nil
        askOperation = nil
        return true
    }

    /// Cancels the operation only when `candidateID` is still its owner.
    @discardableResult
    mutating func cancelOperationIfCurrent(_ candidateID: UUID) -> Bool {
        guard operationID == candidateID else { return false }
        cancelOperation()
        return true
    }

    /// Returns the pending values, busy flag, and both visible phases to idle.
    ///
    /// - Returns: `true` when the submission phase actually changed, so the
    ///   caller can emit the matching diagnostic exactly once.
    @discardableResult
    mutating func returnToIdle() -> Bool {
        pendingObjective = nil
        pendingScopedSend = nil
        relationshipRecallPhase = .idle
        isSending = false
        return transitionAskSubmissionPhase(to: .idle)
    }

    /// Sets the submission phase, reporting whether it changed. Keeping this
    /// the only write path lets the view emit diagnostics on real transitions
    /// while the phase value stays owned here.
    @discardableResult
    mutating func transitionAskSubmissionPhase(to phase: AskSubmissionPhase) -> Bool {
        guard askSubmissionPhase != phase else { return false }
        askSubmissionPhase = phase
        return true
    }
}

/// What the pending turn shows while an Ask resolves which relationship it
/// belongs to.
enum RelationshipRecallPhase: Equatable {
    case idle
    case reading(AgentRelationshipRecallCandidate?)
    case replyingWithoutRelationship
    case ambiguous(
        candidates: [AgentRelationshipRecallCandidate],
        possibleDuplicate: Bool
    )
    case unresolved(recent: [AgentRelationshipRecallCandidate])
}

/// Which submission surface the composer status should render.
enum AskSubmissionPhase: Equatable {
    case idle
    case routingLocally
    case requestingWorkspaceAnswer
}
