import Foundation
import XCTest
@testable import TalentSignal

final class RelationshipCaptureTests: XCTestCase {
    func testDraftBuilderExtractsEmailBeforePhone() {
        let draft = CaptureDraftBuilder.makeDraft(
            from: """
            Lin Wei
            Email lin.wei@example.com
            Phone +65 9123 4567
            """
        )

        XCTAssertEqual(draft.handleType, .email)
        XCTAssertEqual(draft.handleValue, "lin.wei@example.com")
        XCTAssertTrue(draft.reviewedText.contains("+65 9123 4567"))
    }

    func testDraftBuilderNormalizesPhoneWithoutInventingAttribution() {
        let draft = CaptureDraftBuilder.makeDraft(
            from: "Contact: +65 (9123) 4567"
        )

        XCTAssertEqual(draft.handleType, .phone)
        XCTAssertEqual(draft.handleValue, "+6591234567")
    }

    func testTemporalIdentityRoleUsesBackendReasons() {
        XCTAssertEqual(
            TemporalIdentityRole.classify(
                matchReasons: ["Current confirmed phone clue · reviewed source"]
            ),
            .current
        )
        XCTAssertEqual(
            TemporalIdentityRole.classify(
                matchReasons: ["Expired phone clue · explicit binding required"]
            ),
            .historical
        )
        XCTAssertEqual(
            TemporalIdentityRole.classify(matchReasons: ["Name resembles source hint"]),
            .uncertain
        )
    }

    func testPendingInboxRestoresReviewedDraft() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "talent-signal-inbox-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = PendingCaptureInbox(directoryURL: directory)
        let seed = try await inbox.stage(
            imageData: Data([1, 2, 3]),
            fileName: "conversation.png",
            mediaType: "image/png",
            origin: .photosPicker
        )
        var draft = RecognizedCaptureDraft.empty
        draft.reviewedText = "Reviewed evidence"
        draft.displayNameHint = "Lin Wei"
        try await inbox.saveDraft(draft, for: seed.id)

        let restored = try await inbox.load()
        XCTAssertEqual(restored?.id, seed.id)
        XCTAssertEqual(restored?.imageData, seed.imageData)
        XCTAssertEqual(restored?.fileName, seed.fileName)
        let restoredDraft = try await inbox.loadDraft(for: seed.id)
        XCTAssertEqual(restoredDraft, draft)

        try await inbox.remove(id: seed.id)
        let removed = try await inbox.load()
        let removedDraft = try await inbox.loadDraft(for: seed.id)
        XCTAssertNil(removed)
        XCTAssertNil(removedDraft)
    }

    func testPendingInboxQueuesDistinctCapturesAndDeduplicatesExactRetry() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "talent-signal-inbox-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = PendingCaptureInbox(directoryURL: directory)

        let first = try await inbox.stage(
            imageData: Data([1, 2, 3]),
            fileName: "first.png",
            mediaType: "image/png",
            origin: .appShortcut
        )
        try await Task.sleep(nanoseconds: 2_000_000)
        let second = try await inbox.stage(
            imageData: Data([4, 5, 6]),
            fileName: "second.png",
            mediaType: "image/png",
            origin: .appShortcut
        )
        let retriedFirst = try await inbox.stage(
            imageData: Data([1, 2, 3]),
            fileName: "retried-first.png",
            mediaType: "image/png",
            origin: .appShortcut
        )

        let initialCount = try await inbox.count()
        let initialHead = try await inbox.load()
        XCTAssertEqual(retriedFirst.id, first.id)
        XCTAssertEqual(retriedFirst.imageData, first.imageData)
        XCTAssertEqual(initialCount, 2)
        XCTAssertEqual(initialHead?.id, first.id)

        try await inbox.remove(id: first.id)
        let nextHead = try await inbox.load()
        let remainingCount = try await inbox.count()
        XCTAssertEqual(nextHead?.id, second.id)
        XCTAssertEqual(remainingCount, 1)

        let laterReview = try await inbox.stage(
            imageData: Data([1, 2, 3]),
            fileName: "later-review.png",
            mediaType: "image/png",
            origin: .appShortcut
        )
        let countAfterLaterReview = try await inbox.count()
        XCTAssertNotEqual(laterReview.id, first.id)
        XCTAssertEqual(countAfterLaterReview, 2)
    }

    func testPendingInboxKeepsDraftsIsolatedByCapture() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "talent-signal-inbox-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let inbox = PendingCaptureInbox(directoryURL: directory)
        let first = try await inbox.stage(
            imageData: Data([10]),
            fileName: "first.png",
            mediaType: "image/png",
            origin: .photosPicker
        )
        let second = try await inbox.stage(
            imageData: Data([20]),
            fileName: "second.png",
            mediaType: "image/png",
            origin: .appShortcut
        )
        var firstDraft = RecognizedCaptureDraft.empty
        firstDraft.reviewedText = "First reviewed source"
        var secondDraft = RecognizedCaptureDraft.empty
        secondDraft.reviewedText = "Second reviewed source"

        try await inbox.saveDraft(firstDraft, for: first.id)
        try await inbox.saveDraft(secondDraft, for: second.id)

        let restoredFirstDraft = try await inbox.loadDraft(for: first.id)
        let restoredSecondDraft = try await inbox.loadDraft(for: second.id)
        XCTAssertEqual(restoredFirstDraft, firstDraft)
        XCTAssertEqual(restoredSecondDraft, secondDraft)

        try await inbox.remove(id: first.id)
        let removedFirstDraft = try await inbox.loadDraft(for: first.id)
        let retainedSecondDraft = try await inbox.loadDraft(for: second.id)
        XCTAssertNil(removedFirstDraft)
        XCTAssertEqual(retainedSecondDraft, secondDraft)
    }

    func testPendingInboxMigratesLegacySingleCapture() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "talent-signal-inbox-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true
        )
        let id = UUID()
        let createdAt = Date(timeIntervalSince1970: 1_786_400_000)
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        try encoder.encode(
            LegacyPendingMetadata(
                id: id,
                fileName: "legacy.png",
                mediaType: "image/png",
                createdAt: createdAt,
                origin: .appShortcut
            )
        ).write(to: directory.appending(path: "pending.json"), options: .atomic)
        try Data([7, 8, 9]).write(
            to: directory.appending(path: "pending-image"),
            options: .atomic
        )

        let inbox = PendingCaptureInbox(directoryURL: directory)
        let restored = try await inbox.load()

        XCTAssertEqual(restored?.id, id)
        XCTAssertEqual(restored?.imageData, Data([7, 8, 9]))
        let migratedCount = try await inbox.count()
        XCTAssertEqual(migratedCount, 1)
        XCTAssertFalse(
            FileManager.default.fileExists(
                atPath: directory.appending(path: "pending.json").path
            )
        )
        XCTAssertFalse(
            FileManager.default.fileExists(
                atPath: directory.appending(path: "pending-image").path
            )
        )
    }

    @MainActor
    func testCurrentAndHistoricalCandidatesRequireExplicitCurrentSelection() async throws {
        let identityCase = Self.twoOwnerCase()
        let service = RelationshipCaptureServiceStub(
            identityCase: identityCase,
            decisionResult: IdentityDecisionResult(
                decision: "bind_existing",
                identityStatus: "bound",
                personID: Self.currentPersonID,
                relationshipContextID: Self.currentContextID,
                resourceProcessingState: "needs_fact_review"
            ),
            wiki: Self.goldWiki()
        )
        let seed = PendingCaptureSeed(
            imageData: Data(),
            fileName: "recycled-phone.png",
            mediaType: "image/png",
            origin: .deterministicTest
        )
        var draft = RecognizedCaptureDraft.empty
        draft.reviewedText = "Phone: +6580805531"
        draft.displayNameHint = "Current owner"
        draft.handleValue = "+6580805531"
        let store = RelationshipCaptureStore(
            seed: seed,
            service: service,
            initialDraft: draft
        )

        store.submitReviewedDraft()
        try await waitUntil { store.stage == .resolvingIdentity }

        XCTAssertNil(store.selectedCandidateID)
        XCTAssertTrue(store.isCandidateSelectable(identityCase.candidates[0]))
        XCTAssertFalse(store.isCandidateSelectable(identityCase.candidates[1]))

        store.selectCandidate(identityCase.candidates[1])
        XCTAssertNil(store.selectedCandidateID)

        store.selectCandidate(identityCase.candidates[0])
        XCTAssertEqual(store.selectedCandidateID, Self.currentPersonID)
        XCTAssertEqual(store.selectedContextID, Self.currentContextID)
        store.bindSelectedCandidate()

        try await waitUntil {
            if case let .completed(completion) = store.stage {
                return completion.wiki?.quality.verdict == "gold"
            }
            return false
        }
        let decisions = await service.decisions
        XCTAssertEqual(decisions.count, 1)
        guard case let .bind(candidate, _) = try XCTUnwrap(decisions.first) else {
            return XCTFail("Expected an explicit bind decision.")
        }
        XCTAssertEqual(candidate.personID, Self.currentPersonID)
    }

    @MainActor
    func testLeaveUnresolvedCompletesWithoutWiki() async throws {
        let identityCase = Self.twoOwnerCase()
        let service = RelationshipCaptureServiceStub(
            identityCase: identityCase,
            decisionResult: IdentityDecisionResult(
                decision: "leave_unresolved",
                identityStatus: "unresolved",
                personID: nil,
                relationshipContextID: nil,
                resourceProcessingState: "needs_identity_review"
            ),
            wiki: Self.goldWiki()
        )
        let seed = PendingCaptureSeed(
            imageData: Data(),
            fileName: "ambiguous.png",
            mediaType: "image/png",
            origin: .deterministicTest
        )
        var draft = RecognizedCaptureDraft.empty
        draft.reviewedText = "Ambiguous conversation"
        let store = RelationshipCaptureStore(
            seed: seed,
            service: service,
            initialDraft: draft
        )

        store.submitReviewedDraft()
        try await waitUntil { store.stage == .resolvingIdentity }
        store.leaveUnresolved()
        try await waitUntil {
            if case let .completed(completion) = store.stage {
                return completion.isUnresolved && completion.wiki == nil
            }
            return false
        }
        let compileCount = await service.compileCount
        XCTAssertEqual(compileCount, 0)
    }

    @MainActor
    func testWikiRetryDoesNotRepeatIdentityDecision() async throws {
        let identityCase = Self.twoOwnerCase()
        let service = RelationshipCaptureServiceStub(
            identityCase: identityCase,
            decisionResult: IdentityDecisionResult(
                decision: "bind_existing",
                identityStatus: "bound",
                personID: Self.currentPersonID,
                relationshipContextID: Self.currentContextID,
                resourceProcessingState: "needs_fact_review"
            ),
            wiki: Self.goldWiki(),
            compileFailuresBeforeSuccess: 1
        )
        let seed = PendingCaptureSeed(
            imageData: Data(),
            fileName: "retry.png",
            mediaType: "image/png",
            origin: .deterministicTest
        )
        var draft = RecognizedCaptureDraft.empty
        draft.reviewedText = "Phone: +6580805531"
        draft.displayNameHint = "Current owner"
        draft.handleValue = "+6580805531"
        let store = RelationshipCaptureStore(
            seed: seed,
            service: service,
            initialDraft: draft
        )

        store.submitReviewedDraft()
        try await waitUntil { store.stage == .resolvingIdentity }
        store.selectCandidate(identityCase.candidates[0])
        store.bindSelectedCandidate()
        try await waitUntil {
            guard case let .failed(failure) = store.stage else { return false }
            return failure.recoveryStage == .compilation
        }

        store.retry()
        try await waitUntil {
            guard case let .completed(completion) = store.stage else {
                return false
            }
            return completion.wiki?.quality.verdict == "gold"
        }

        let decisions = await service.decisions
        let compileCount = await service.compileCount
        XCTAssertEqual(decisions.count, 1)
        XCTAssertEqual(compileCount, 2)
    }

    @MainActor
    private func waitUntil(
        timeoutNanoseconds: UInt64 = 2_000_000_000,
        condition: @escaping @MainActor () -> Bool
    ) async throws {
        let started = DispatchTime.now().uptimeNanoseconds
        while !condition() {
            if DispatchTime.now().uptimeNanoseconds - started > timeoutNanoseconds {
                XCTFail("Timed out waiting for relationship capture state.")
                return
            }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
    }

    private static let currentPersonID = "11111111-1111-4111-8111-111111111111"
    private static let historicalPersonID = "22222222-2222-4222-8222-222222222222"
    private static let currentContextID = "33333333-3333-4333-8333-333333333333"
    private static let historicalContextID = "44444444-4444-4444-8444-444444444444"

    private static func twoOwnerCase() -> IdentityResolutionCase {
        IdentityResolutionCase(
            id: "55555555-5555-4555-8555-555555555555",
            status: "pending",
            version: 1,
            reason: "Compare current and historical identity evidence.",
            displayNameHint: "Current owner",
            source: .init(
                resourceID: "66666666-6666-4666-8666-666666666666",
                kind: "conversation_screenshot",
                displayName: "recycled-phone.png",
                observedAt: "2026-08-07T00:00:00.000Z",
                excerpt: "Phone: +6580805531",
                fragmentCount: 1
            ),
            candidates: [
                IdentityResolutionCandidate(
                    personID: currentPersonID,
                    displayLabel: "Current owner 080e5531",
                    contextCount: 1,
                    captureCount: 2,
                    relationshipContexts: [
                        .init(
                            id: currentContextID,
                            displayLabel: "Current client relationship"
                        )
                    ],
                    matchReasons: ["Current confirmed phone clue"]
                ),
                IdentityResolutionCandidate(
                    personID: historicalPersonID,
                    displayLabel: "Historical owner 080e5531",
                    contextCount: 1,
                    captureCount: 1,
                    relationshipContexts: [
                        .init(
                            id: historicalContextID,
                            displayLabel: "Prior candidate relationship"
                        )
                    ],
                    matchReasons: [
                        "Expired phone clue · explicit binding required"
                    ]
                )
            ],
            resolvedPersonID: nil,
            resolvedRelationshipContextID: nil
        )
    }

    private static func goldWiki() -> WikiCompilationReceipt {
        WikiCompilationReceipt(
            id: "77777777-7777-4777-8777-777777777777",
            personID: currentPersonID,
            relationshipContextID: currentContextID,
            status: "published",
            blocks: [
                .init(
                    id: "88888888-8888-4888-8888-888888888888",
                    type: "identity_context",
                    content: .init(
                        headline: "Current client relationship",
                        summary: nil,
                        items: ["One governed source"]
                    )
                )
            ],
            quality: .init(verdict: "gold", reasons: ["All gates pass."])
        )
    }
}

private struct LegacyPendingMetadata: Encodable {
    let id: UUID
    let fileName: String
    let mediaType: String
    let createdAt: Date
    let origin: CaptureOrigin
}

private actor RelationshipCaptureServiceStub: RelationshipCaptureServing {
    private let identityCase: IdentityResolutionCase
    private let decisionResult: IdentityDecisionResult
    private let wiki: WikiCompilationReceipt
    private let compileFailuresBeforeSuccess: Int
    private(set) var decisions: [IdentityDecision] = []
    private(set) var compileCount = 0

    init(
        identityCase: IdentityResolutionCase,
        decisionResult: IdentityDecisionResult,
        wiki: WikiCompilationReceipt,
        compileFailuresBeforeSuccess: Int = 0
    ) {
        self.identityCase = identityCase
        self.decisionResult = decisionResult
        self.wiki = wiki
        self.compileFailuresBeforeSuccess = compileFailuresBeforeSuccess
    }

    func createCapture(
        seed: PendingCaptureSeed,
        draft: RecognizedCaptureDraft
    ) async throws -> ResourceCaptureResult {
        ResourceCaptureResult(
            captureID: "99999999-9999-4999-8999-999999999999",
            identity: .init(
                status: "needs_review",
                personID: nil,
                relationshipContextID: nil,
                resolutionCaseID: identityCase.id,
                candidatePersonIDs: identityCase.candidates.map(\.personID)
            ),
            resource: .init(
                id: identityCase.source.resourceID,
                processingState: "needs_identity_review",
                duplicateOfResourceID: nil,
                fragmentCount: 1
            )
        )
    }

    func loadIdentityCase(id: String) async throws -> IdentityResolutionCase {
        identityCase
    }

    func decideIdentity(
        identityCase: IdentityResolutionCase,
        decision: IdentityDecision,
        seed: PendingCaptureSeed,
        draft: RecognizedCaptureDraft
    ) async throws -> IdentityDecisionResult {
        decisions.append(decision)
        return decisionResult
    }

    func compileWiki(
        personID: String,
        relationshipContextID: String,
        seedID: UUID
    ) async throws -> WikiCompilationReceipt {
        compileCount += 1
        if compileCount <= compileFailuresBeforeSuccess {
            throw RelationshipCaptureServiceStubError.transientCompilation
        }
        return wiki
    }
}

private enum RelationshipCaptureServiceStubError: Error {
    case transientCompilation
}
