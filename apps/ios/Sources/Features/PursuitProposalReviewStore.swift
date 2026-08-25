import Combine
import Foundation

struct PursuitProposalDecisionDraft: Equatable {
    var choice: PursuitProposalReviewChoice?
    var editedFields: [String: String]
}

protocol PursuitPendingOperationPersisting: AnyObject {
    func operationID(for proposalID: String) -> UUID?
    func save(operationID: UUID, for proposalID: String)
    func clear(proposalID: String)
}

final class UserDefaultsPursuitPendingOperationStore: PursuitPendingOperationPersisting {
    private let defaults: UserDefaults
    private let keyPrefix = "talent-signal.pending-pursuit-review."

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func operationID(for proposalID: String) -> UUID? {
        defaults.string(forKey: keyPrefix + proposalID).flatMap(UUID.init(uuidString:))
    }

    func save(operationID: UUID, for proposalID: String) {
        defaults.set(operationID.uuidString.lowercased(), forKey: keyPrefix + proposalID)
    }

    func clear(proposalID: String) {
        defaults.removeObject(forKey: keyPrefix + proposalID)
    }
}

@MainActor
final class PursuitProposalReviewStore: ObservableObject {
    enum Phase: Equatable {
        case previewOnly
        case loading
        case ready
        case confirming(operationID: UUID)
        case recorded(PursuitProposalReviewResult)
        case conflict(String)
        case unknownLocked(operationID: UUID)
        case failed(String)
    }

    @Published private(set) var phase: Phase
    @Published private(set) var proposal: PursuitProposalSnapshot?
    @Published private(set) var drafts: [String: PursuitProposalDecisionDraft] = [:]
    @Published private(set) var notice: String?

    private let session: PursuitProposalReviewSession?
    private let service: PursuitProposalReviewServing?
    private let pendingOperations: PursuitPendingOperationPersisting
    private let operationIDFactory: () -> UUID

    init(
        session: PursuitProposalReviewSession?,
        service: PursuitProposalReviewServing? = nil,
        pendingOperations: PursuitPendingOperationPersisting = UserDefaultsPursuitPendingOperationStore(),
        operationIDFactory: @escaping () -> UUID = UUID.init
    ) {
        self.session = session
        self.pendingOperations = pendingOperations
        self.operationIDFactory = operationIDFactory
        if let session {
            self.service = service ?? URLPursuitProposalReviewClient(
                baseURL: session.baseURL,
                accessToken: session.accessToken
            )
            if let operationID = pendingOperations.operationID(for: session.proposalID) {
                phase = .unknownLocked(operationID: operationID)
            } else {
                phase = .loading
            }
        } else {
            self.service = service
            phase = .previewOnly
        }
    }

    var decidedItemCount: Int {
        guard let proposal else { return 0 }
        return proposal.items.filter { drafts[$0.id]?.choice != nil }.count
    }

    var canSubmit: Bool {
        guard phase == .ready, let proposal else { return false }
        guard evidenceBlockingMessage == nil else { return false }
        return proposal.items.allSatisfy { item in
            guard let draft = drafts[item.id], let choice = draft.choice else {
                return false
            }
            if choice == .edit {
                guard let value = item.proposedValue.applyingEditedFields(draft.editedFields) else {
                    return false
                }
                return value != item.beforeValue
            }
            return true
        }
    }

    var evidenceBlockingMessage: String? {
        guard let proposal else { return nil }
        guard proposal.evidenceState.availability == "available"
                || proposal.evidenceState.availability == "not_required" else {
            return proposal.evidenceState.explanation
        }
        let evidence = Dictionary(
            uniqueKeysWithValues: proposal.reviewContext.evidence.map { ($0.fragmentID, $0) }
        )
        for item in proposal.items where !item.evidenceRefs.isEmpty {
            for reference in item.evidenceRefs {
                guard let fragment = evidence[reference],
                      fragment.text?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false,
                      fragment.fragmentStatus == "active",
                      fragment.sourceProcessingState != "deleted",
                      fragment.reviewStatus == "reviewed",
                      fragment.attributionStatus == "confirmed" else {
                    return "A cited source is unavailable, deleted, unreviewed, or no longer attribution-confirmed. This Proposal cannot be applied."
                }
            }
        }
        return nil
    }

    func load() async {
        if case .unknownLocked = phase {
            await reconcile()
            return
        }
        guard let session, let service else { return }
        phase = .loading
        do {
            let proposal = try await service.loadProposal(id: session.proposalID)
            guard proposal.status == "needs_review" else {
                phase = .failed("This Proposal is \(proposal.status.replacingOccurrences(of: "_", with: " ")) and cannot accept another decision.")
                return
            }
            self.proposal = proposal
            drafts = Dictionary(
                uniqueKeysWithValues: proposal.items.map { item in
                    (
                        item.id,
                        PursuitProposalDecisionDraft(
                            choice: nil,
                            editedFields: item.proposedValue.editableFields ?? [:]
                        )
                    )
                }
            )
            phase = .ready
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    func select(_ choice: PursuitProposalReviewChoice, for itemID: String) {
        guard phase == .ready, drafts[itemID] != nil else { return }
        drafts[itemID]?.choice = choice
    }

    func updateEditedField(_ field: String, value: String, for itemID: String) {
        guard phase == .ready, drafts[itemID] != nil else { return }
        drafts[itemID]?.editedFields[field] = value
    }

    func editValidationMessage(for item: PursuitProposalSnapshot.Item) -> String? {
        guard let draft = drafts[item.id], draft.choice == .edit else { return nil }
        guard let value = item.proposedValue.applyingEditedFields(draft.editedFields) else {
            return "Enter a valid value for every edited field."
        }
        if value == item.beforeValue {
            return "An edit must differ from the current canonical value."
        }
        return nil
    }

    func submit() async {
        guard let proposal, let service, canSubmit else { return }
        let decisions = proposal.items.compactMap { item -> PursuitProposalReviewDecision? in
            guard let draft = drafts[item.id], let choice = draft.choice else { return nil }
            return PursuitProposalReviewDecision(
                itemID: item.id,
                choice: choice,
                editedValue: choice == .edit
                    ? item.proposedValue.applyingEditedFields(draft.editedFields)
                    : nil
            )
        }
        guard decisions.count == proposal.items.count else { return }

        let operationID = operationIDFactory()
        pendingOperations.save(operationID: operationID, for: proposal.id)
        phase = .confirming(operationID: operationID)
        do {
            let result = try await service.review(
                proposal: proposal,
                operationID: operationID,
                decisions: decisions
            )
            guard isTrustedReadback(
                result,
                for: proposal,
                expectedOperationID: operationID
            ) else {
                phase = .unknownLocked(operationID: operationID)
                return
            }
            pendingOperations.clear(proposalID: proposal.id)
            self.proposal = result.proposal
            phase = .recorded(result)
        } catch let error as PursuitProposalReviewClientError {
            switch error {
            case let .conflict(message):
                pendingOperations.clear(proposalID: proposal.id)
                phase = .conflict(message)
            case .loopbackOnly, .loginFailed, .backend:
                pendingOperations.clear(proposalID: proposal.id)
                phase = .failed(error.localizedDescription)
            case .invalidResponse:
                phase = .unknownLocked(operationID: operationID)
            }
        } catch {
            phase = .unknownLocked(operationID: operationID)
        }
    }

    func reconcile() async {
        guard case let .unknownLocked(operationID) = phase,
              let service,
              let session else { return }
        do {
            let readback = try await service.readOperation(id: operationID)
            if let receipt = readback.receipt, readback.operation.status == "applied" {
                let latest = try await service.loadProposal(id: session.proposalID)
                let result = PursuitProposalReviewResult(
                    proposal: latest,
                    pursuit: readback.pursuit,
                    receipt: receipt
                )
                guard readback.operation.id == operationID.uuidString.lowercased(),
                      readback.operation.beforeRevision == receipt.entityRef.beforeRevision,
                      readback.operation.afterRevision == receipt.entityRef.afterRevision,
                      isTrustedReadback(
                        result,
                        for: proposal ?? latest,
                        expectedOperationID: operationID
                      ) else {
                    phase = .unknownLocked(operationID: operationID)
                    return
                }
                pendingOperations.clear(proposalID: session.proposalID)
                proposal = latest
                phase = .recorded(result)
            } else if readback.operation.status == "conflict" {
                pendingOperations.clear(proposalID: session.proposalID)
                phase = .conflict("The Pursuit changed before this review applied.")
            } else if readback.operation.status == "failed" {
                pendingOperations.clear(proposalID: session.proposalID)
                phase = .failed("Canonical readback proves that the review was not applied.")
            } else {
                phase = .unknownLocked(operationID: operationID)
            }
        } catch let error as PursuitProposalReviewClientError {
            if case let .backend(code, _) = error, code == "OPERATION_NOT_FOUND" {
                pendingOperations.clear(proposalID: session.proposalID)
                notice = "Canonical readback found no operation. It is safe to review again."
                phase = .loading
                await load()
            } else {
                phase = .unknownLocked(operationID: operationID)
            }
        } catch {
            phase = .unknownLocked(operationID: operationID)
        }
    }

    private func isTrustedReadback(
        _ result: PursuitProposalReviewResult,
        for original: PursuitProposalSnapshot,
        expectedOperationID: UUID
    ) -> Bool {
        let expectedOperation = expectedOperationID.uuidString.lowercased()
        let outcomeMatchesProposal: Bool
        let revisionMatchesOutcome: Bool
        let changedFieldsMatchOutcome: Bool
        switch result.receipt.outcome {
        case "canonical_applied":
            outcomeMatchesProposal = result.proposal.status == "applied"
            revisionMatchesOutcome = result.receipt.entityRef.afterRevision
                == result.receipt.entityRef.beforeRevision + 1
            changedFieldsMatchOutcome = !result.receipt.changedFields.isEmpty
        case "mixed_applied":
            outcomeMatchesProposal = result.proposal.status == "kept_unresolved"
            revisionMatchesOutcome = result.receipt.entityRef.afterRevision
                == result.receipt.entityRef.beforeRevision + 1
            changedFieldsMatchOutcome = !result.receipt.changedFields.isEmpty
        case "kept_unresolved":
            outcomeMatchesProposal = result.proposal.status == "kept_unresolved"
            revisionMatchesOutcome = result.receipt.entityRef.afterRevision
                == result.receipt.entityRef.beforeRevision
            changedFieldsMatchOutcome = result.receipt.changedFields.isEmpty
        case "rejected":
            outcomeMatchesProposal = result.proposal.status == "rejected"
            revisionMatchesOutcome = result.receipt.entityRef.afterRevision
                == result.receipt.entityRef.beforeRevision
            changedFieldsMatchOutcome = result.receipt.changedFields.isEmpty
        default:
            return false
        }
        let allowedChangedFields = Set(["milestone", "status", "roles", "gaps", "actions"])
        return result.proposal.id == original.id
            && result.pursuit.id == original.pursuitID
            && result.pursuit.workspaceID == result.receipt.workspaceID
            && result.receipt.proposalID == original.id
            && result.receipt.operationID == expectedOperation
            && result.receipt.operationKind == "review_pursuit_proposal"
            && result.receipt.status == "applied"
            && UUID(uuidString: result.receipt.actorUserID) != nil
            && result.receipt.entityRef.beforeRevision == original.baseRevision
            && result.receipt.entityRef.afterRevision == result.pursuit.revision
            && Set(result.receipt.changedFields).isSubset(of: allowedChangedFields)
            && outcomeMatchesProposal
            && revisionMatchesOutcome
            && changedFieldsMatchOutcome
            && result.receipt.externalEffects.isEmpty
    }
}
