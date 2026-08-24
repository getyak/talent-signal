import XCTest
@testable import TalentSignal

@MainActor
final class PursuitProposalReviewStoreTests: XCTestCase {
    func testPreviewWithoutCanonicalSessionCannotSubmit() {
        let store = PursuitProposalReviewStore(session: nil)

        XCTAssertEqual(store.phase, .previewOnly)
        XCTAssertFalse(store.canSubmit)
        XCTAssertNil(store.proposal)
    }

    func testAppliedPresentationRequiresReceiptAndPursuitReadback() async {
        let proposal = Self.proposal()
        let operationID = UUID(uuidString: "77777777-7777-4777-8777-777777777777")!
        let result = Self.result(proposal: proposal, operationID: operationID)
        let service = StubPursuitProposalReviewService(
            proposal: proposal,
            reviewResult: result
        )
        let store = PursuitProposalReviewStore(
            session: .init(
                baseURL: URL(string: "http://127.0.0.1:4317")!,
                proposalID: proposal.id
            ),
            service: service,
            operationIDFactory: { operationID }
        )

        await store.load()
        XCTAssertEqual(store.phase, .ready)
        XCTAssertFalse(store.canSubmit)

        store.select(.confirm, for: proposal.items[0].id)
        XCTAssertTrue(store.canSubmit)
        await store.submit()
        XCTAssertEqual(store.phase, .recorded(result))
        XCTAssertEqual(service.reviewCount, 1)
        XCTAssertEqual(service.lastDecisions?.first?.choice, .confirm)
    }

    func testUnknownOutcomeLocksOperationUntilReadback() async {
        let proposal = Self.proposal()
        let operationID = UUID(uuidString: "77777777-7777-4777-8777-777777777777")!
        let result = Self.result(proposal: proposal, operationID: operationID)
        let service = StubPursuitProposalReviewService(
            proposal: proposal,
            reviewResult: result,
            reviewError: URLError(.networkConnectionLost)
        )
        let pendingOperations = MemoryPendingOperations()
        let store = PursuitProposalReviewStore(
            session: .init(
                baseURL: URL(string: "http://127.0.0.1:4317")!,
                proposalID: proposal.id
            ),
            service: service,
            pendingOperations: pendingOperations,
            operationIDFactory: { operationID }
        )

        await store.load()
        store.select(.confirm, for: proposal.items[0].id)
        await store.submit()
        guard case let .unknownLocked(persistedOperationID) = store.phase else {
            return XCTFail("Expected an unknown locked operation")
        }
        XCTAssertEqual(persistedOperationID, operationID)
        XCTAssertEqual(service.reviewCount, 1)
        XCTAssertEqual(pendingOperations.operationID(for: proposal.id), operationID)

        service.operation = PursuitOperationReadback(
            operation: .init(
                id: operationID.uuidString.lowercased(),
                status: "applied",
                beforeRevision: 1,
                afterRevision: 2
            ),
            receipt: result.receipt,
            pursuit: result.pursuit
        )
        service.proposal = result.proposal
        await store.reconcile()
        guard case let .recorded(reconciled) = store.phase else {
            return XCTFail("Expected applied only after operation readback")
        }
        XCTAssertEqual(reconciled.receipt.id, result.receipt.id)
        XCTAssertEqual(service.reviewCount, 1)
        XCTAssertNil(pendingOperations.operationID(for: proposal.id))
    }

    func testPendingOperationSurvivesStoreRelaunchAndReconcilesWithoutResubmit() async {
        let original = Self.proposal()
        let operationID = UUID()
        let result = Self.result(proposal: original, operationID: operationID)
        let pendingOperations = MemoryPendingOperations()
        pendingOperations.save(operationID: operationID, for: original.id)
        let service = StubPursuitProposalReviewService(
            proposal: result.proposal,
            reviewResult: result
        )
        service.operation = PursuitOperationReadback(
            operation: .init(
                id: operationID.uuidString.lowercased(),
                status: "applied",
                beforeRevision: 1,
                afterRevision: 2
            ),
            receipt: result.receipt,
            pursuit: result.pursuit
        )
        let store = PursuitProposalReviewStore(
            session: .init(
                baseURL: URL(string: "http://127.0.0.1:4317")!,
                proposalID: original.id
            ),
            service: service,
            pendingOperations: pendingOperations
        )

        XCTAssertEqual(store.phase, .unknownLocked(operationID: operationID))
        await store.load()

        guard case .recorded = store.phase else {
            return XCTFail("Expected relaunch to reconcile the persisted operation")
        }
        XCTAssertEqual(service.reviewCount, 0)
        XCTAssertNil(pendingOperations.operationID(for: original.id))
    }

    func testEditRequiresAValidChangedValue() async {
        let proposal = Self.proposal()
        let operationID = UUID()
        let service = StubPursuitProposalReviewService(
            proposal: proposal,
            reviewResult: Self.result(proposal: proposal, operationID: operationID)
        )
        let store = PursuitProposalReviewStore(
            session: .init(
                baseURL: URL(string: "http://127.0.0.1:4317")!,
                proposalID: proposal.id
            ),
            service: service,
            pendingOperations: MemoryPendingOperations(),
            operationIDFactory: { operationID }
        )

        await store.load()
        store.select(.edit, for: proposal.items[0].id)
        store.updateEditedField("value", value: "shortlist_review", for: proposal.items[0].id)
        XCTAssertFalse(store.canSubmit)
        XCTAssertEqual(
            store.editValidationMessage(for: proposal.items[0]),
            "An edit must differ from the current canonical value."
        )

        store.updateEditedField("value", value: "offer_review", for: proposal.items[0].id)
        XCTAssertTrue(store.canSubmit)
    }

    @MainActor
    func testUnavailableEvidenceStateBlocksProposalEvenWhenOldTextRemains() async {
        let unavailable = WorkspaceEvidenceState(
            availability: "unavailable",
            referenceCount: 1,
            availableReferenceCount: 0,
            unavailableReferenceCount: 1
        )
        let proposal = Self.proposal(evidenceState: unavailable)
        let operationID = UUID()
        let service = StubPursuitProposalReviewService(
            proposal: proposal,
            reviewResult: Self.result(proposal: proposal, operationID: operationID)
        )
        let store = PursuitProposalReviewStore(
            session: .init(
                baseURL: URL(string: "http://127.0.0.1:4317")!,
                proposalID: proposal.id
            ),
            service: service,
            pendingOperations: MemoryPendingOperations(),
            operationIDFactory: { operationID }
        )

        await store.load()
        store.select(.confirm, for: proposal.items[0].id)

        XCTAssertFalse(store.canSubmit)
        XCTAssertEqual(store.evidenceBlockingMessage, unavailable.explanation)
    }

    func testMismatchedReceiptOperationNeverPresentsAppliedSuccess() async {
        let proposal = Self.proposal()
        let submittedOperationID = UUID()
        let mismatchedResult = Self.result(proposal: proposal, operationID: UUID())
        let service = StubPursuitProposalReviewService(
            proposal: proposal,
            reviewResult: mismatchedResult
        )
        let pending = MemoryPendingOperations()
        let store = PursuitProposalReviewStore(
            session: .init(
                baseURL: URL(string: "http://127.0.0.1:4317")!,
                proposalID: proposal.id
            ),
            service: service,
            pendingOperations: pending,
            operationIDFactory: { submittedOperationID }
        )

        await store.load()
        store.select(.confirm, for: proposal.items[0].id)
        await store.submit()

        XCTAssertEqual(store.phase, .unknownLocked(operationID: submittedOperationID))
        XCTAssertEqual(pending.operationID(for: proposal.id), submittedOperationID)
    }

    func testMalformedAppliedReceiptNeverPresentsAppliedSuccess() async {
        let proposal = Self.proposal()
        let operationID = UUID()
        let trusted = Self.result(proposal: proposal, operationID: operationID)
        let malformed = PursuitProposalReviewResult(
            proposal: PursuitProposalSnapshot(
                id: trusted.proposal.id,
                pursuitID: trusted.proposal.pursuitID,
                captureID: trusted.proposal.captureID,
                baseRevision: trusted.proposal.baseRevision,
                summary: trusted.proposal.summary,
                status: "needs_review",
                evidenceState: trusted.proposal.evidenceState,
                reviewContext: trusted.proposal.reviewContext,
                items: trusted.proposal.items
            ),
            pursuit: trusted.pursuit,
            receipt: PursuitReviewReceipt(
                id: trusted.receipt.id,
                operationID: trusted.receipt.operationID,
                workspaceID: trusted.receipt.workspaceID,
                operationKind: trusted.receipt.operationKind,
                status: trusted.receipt.status,
                proposalID: trusted.receipt.proposalID,
                actorUserID: trusted.receipt.actorUserID,
                outcome: "canonical_applied",
                entityRef: trusted.receipt.entityRef,
                changedFields: [],
                externalEffects: [],
                summary: trusted.receipt.summary,
                occurredAt: trusted.receipt.occurredAt
            )
        )
        let service = StubPursuitProposalReviewService(
            proposal: proposal,
            reviewResult: malformed
        )
        let store = PursuitProposalReviewStore(
            session: .init(
                baseURL: URL(string: "http://127.0.0.1:4317")!,
                proposalID: proposal.id
            ),
            service: service,
            pendingOperations: MemoryPendingOperations(),
            operationIDFactory: { operationID }
        )

        await store.load()
        store.select(.confirm, for: proposal.items[0].id)
        await store.submit()

        XCTAssertEqual(store.phase, .unknownLocked(operationID: operationID))
    }

    private static func proposal(
        evidenceState: WorkspaceEvidenceState = .availableOne
    ) -> PursuitProposalSnapshot {
        PursuitProposalSnapshot(
            id: "11111111-1111-4111-8111-111111111111",
            pursuitID: "22222222-2222-4222-8222-222222222222",
            captureID: "33333333-3333-4333-8333-333333333333",
            baseRevision: 1,
            summary: "Synthetic review",
            status: "needs_review",
            evidenceState: evidenceState,
            reviewContext: context(),
            items: [
                .init(
                    id: "44444444-4444-4444-8444-444444444444",
                    itemKey: "milestone",
                    changeKind: "set_milestone",
                    beforeValue: .string("shortlist_review"),
                    proposedValue: .string("final_conversation"),
                    basisKind: "evidence_supported",
                    epistemicStatus: "inference",
                    evidenceRefs: ["55555555-5555-4555-8555-555555555555"],
                    evidenceState: evidenceState,
                    reason: "Reviewed evidence names the next conversation.",
                    effectSummary: "Would update only this Pursuit milestone."
                ),
            ]
        )
    }

    private static func result(
        proposal: PursuitProposalSnapshot,
        operationID: UUID
    ) -> PursuitProposalReviewResult {
        PursuitProposalReviewResult(
            proposal: PursuitProposalSnapshot(
                id: proposal.id,
                pursuitID: proposal.pursuitID,
                captureID: proposal.captureID,
                baseRevision: proposal.baseRevision,
                summary: proposal.summary,
                status: "applied",
                evidenceState: proposal.evidenceState,
                reviewContext: proposal.reviewContext,
                items: proposal.items
            ),
            pursuit: PursuitReadback(
                id: proposal.pursuitID,
                workspaceID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                title: "Synthetic search",
                milestone: "final_conversation",
                status: "active",
                revision: 2
            ),
            receipt: PursuitReviewReceipt(
                id: "66666666-6666-4666-8666-666666666666",
                operationID: operationID.uuidString.lowercased(),
                workspaceID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                operationKind: "review_pursuit_proposal",
                status: "applied",
                proposalID: proposal.id,
                actorUserID: "88888888-8888-4888-8888-888888888888",
                outcome: "canonical_applied",
                entityRef: .init(beforeRevision: 1, afterRevision: 2),
                changedFields: ["milestone"],
                externalEffects: [],
                summary: "One Proposal item applied.",
                occurredAt: "2026-08-24T12:30:00.000Z"
            )
        )
    }

    private static func context() -> PursuitProposalSnapshot.ReviewContext {
        .init(
            pursuit: .init(
                id: "22222222-2222-4222-8222-222222222222",
                title: "Synthetic search"
            ),
            capture: .init(
                id: "33333333-3333-4333-8333-333333333333",
                purpose: "Synthetic review proof"
            ),
            subject: .init(
                personID: "99999999-9999-4999-8999-999999999999",
                displayLabel: "Avery Morgan",
                contextualRoles: [
                    .init(
                        roleType: "candidate",
                        status: "active",
                        confidence: "confirmed"
                    ),
                ]
            ),
            evidence: [
                .init(
                    fragmentID: "55555555-5555-4555-8555-555555555555",
                    text: "The final conversation works next Tuesday.",
                    fragmentKind: "message",
                    fragmentStatus: "active",
                    observedAt: "2026-08-24T12:30:00.000Z",
                    sourceTimezone: "Asia/Shanghai",
                    sourceDisplayName: "Synthetic candidate message",
                    inputChannel: "ios_share",
                    sourceProcessingState: "ready",
                    attributedActor: "candidate",
                    attributionStatus: "confirmed",
                    reviewStatus: "reviewed",
                    parser: .init(name: "synthetic", version: "1.0.0")
                ),
            ]
        )
    }
}

private final class StubPursuitProposalReviewService: PursuitProposalReviewServing {
    var proposal: PursuitProposalSnapshot
    let reviewResult: PursuitProposalReviewResult
    let reviewError: Error?
    var operation: PursuitOperationReadback?
    private(set) var reviewCount = 0
    private(set) var lastDecisions: [PursuitProposalReviewDecision]?

    init(
        proposal: PursuitProposalSnapshot,
        reviewResult: PursuitProposalReviewResult,
        reviewError: Error? = nil
    ) {
        self.proposal = proposal
        self.reviewResult = reviewResult
        self.reviewError = reviewError
    }

    func loadProposal(id: String) async throws -> PursuitProposalSnapshot {
        proposal
    }

    func review(
        proposal: PursuitProposalSnapshot,
        operationID: UUID,
        decisions: [PursuitProposalReviewDecision]
    ) async throws -> PursuitProposalReviewResult {
        reviewCount += 1
        lastDecisions = decisions
        if let reviewError { throw reviewError }
        return reviewResult
    }

    func readOperation(id: UUID) async throws -> PursuitOperationReadback {
        guard let operation else { throw URLError(.cannotConnectToHost) }
        return operation
    }
}

private final class MemoryPendingOperations: PursuitPendingOperationPersisting {
    private var values: [String: UUID] = [:]

    func operationID(for proposalID: String) -> UUID? {
        values[proposalID]
    }

    func save(operationID: UUID, for proposalID: String) {
        values[proposalID] = operationID
    }

    func clear(proposalID: String) {
        values.removeValue(forKey: proposalID)
    }
}
