import XCTest
@testable import TalentSignalMac

final class RelationshipServiceBoundaryTests: XCTestCase {
    func testFixtureServiceCanOnlyReturnSyntheticFixtureCase() async throws {
        let response = try await FixtureRelationshipService(initialMode: .needsDecision).loadWorkspace()
        switch response {
        case .syntheticFixture(let fixture):
            XCTAssertEqual(fixture.mode, .needsDecision)
            XCTAssertTrue(fixture.fixtureID.hasPrefix("synthetic-"))
        case .canonical, .connected:
            XCTFail("Fixture service must never manufacture canonical or connected readback.")
        }
    }

    func testCanonicalProofRequiresEveryScopeAndNoExternalEffects() {
        let presentation = FixtureRelationshipService.fixture(mode: .ready).presentation
        let valid = CanonicalRelationshipReadback(
            workspaceID: "workspace",
            accountID: "account",
            pursuitID: "pursuit",
            personID: "person",
            relationshipContextID: "context",
            captureID: "capture",
            evidenceFragmentIDs: ["fragment"],
            taskID: "task",
            taskStatus: "completed",
            externalEffects: [],
            displayMode: .noAction,
            presentation: presentation,
            runAudit: nil,
            clarification: nil,
            pendingDecision: nil,
            receipt: nil
        )
        XCTAssertTrue(valid.provesCanonicalSafeReadback)

        let unsafe = CanonicalRelationshipReadback(
            workspaceID: "workspace",
            accountID: "account",
            pursuitID: "pursuit",
            personID: "person",
            relationshipContextID: "context",
            captureID: "capture",
            evidenceFragmentIDs: ["fragment"],
            taskID: "task",
            taskStatus: "completed",
            externalEffects: ["message.send"],
            displayMode: .noAction,
            presentation: presentation,
            runAudit: nil,
            clarification: nil,
            pendingDecision: nil,
            receipt: nil
        )
        XCTAssertFalse(unsafe.provesCanonicalSafeReadback)
    }

    func testEveryRequiredLocalStateHasPlainLanguageAndNoPersonRankingCopy() {
        XCTAssertEqual(Set(WorkspaceMode.allCases), Set([
            .empty, .ready, .working, .needsDecision, .noAction, .receipt,
            .clarification, .ambiguousIdentity, .identityReviewSaved, .stale, .failed, .outcomeUnknown, .deleted
        ]))
        XCTAssertTrue(WorkspaceMode.allCases.allSatisfy { !$0.title.isEmpty })

        let fixture = FixtureRelationshipService.fixture(mode: .needsDecision).presentation
        let visibleCopy = [
            fixture.candidateName,
            fixture.pursuitTitle,
            fixture.changedSummary,
            fixture.dependency,
            fixture.proposal
        ].joined(separator: " ").lowercased()
        let prohibitedRankingLanguage = ["fit" + " score", "candidate" + " quality", "acceptance" + " probability", "culture" + " fit"]
        XCTAssertTrue(prohibitedRankingLanguage.allSatisfy { !visibleCopy.contains($0) })
    }

    func testClarificationReadbackRequiresExactOpenRequestForTheSameTask() {
        let presentation = FixtureRelationshipService.fixture(mode: .clarification).presentation
        let clarification = CanonicalClarification(
            id: "clarification",
            taskID: "task",
            taskRevision: 2,
            requestRevision: 1,
            question: "What exact calendar date, timezone, duration, and meeting consent apply?",
            reason: "A relative time phrase is not scheduling authority.",
            status: "open",
            expiresAt: "2026-09-02T09:00:00Z"
        )
        let valid = CanonicalRelationshipReadback(
            workspaceID: "workspace",
            accountID: "account",
            pursuitID: "pursuit",
            personID: "person",
            relationshipContextID: "context",
            captureID: "capture",
            evidenceFragmentIDs: ["fragment"],
            taskID: "task",
            taskStatus: "waiting_for_clarification",
            externalEffects: [],
            displayMode: .clarification,
            presentation: presentation,
            runAudit: nil,
            clarification: clarification,
            pendingDecision: nil,
            receipt: nil
        )
        XCTAssertTrue(valid.provesCanonicalSafeReadback)

        let missing = CanonicalRelationshipReadback(
            workspaceID: valid.workspaceID,
            accountID: valid.accountID,
            pursuitID: valid.pursuitID,
            personID: valid.personID,
            relationshipContextID: valid.relationshipContextID,
            captureID: valid.captureID,
            evidenceFragmentIDs: valid.evidenceFragmentIDs,
            taskID: valid.taskID,
            taskStatus: valid.taskStatus,
            externalEffects: [],
            displayMode: .clarification,
            presentation: presentation,
            runAudit: nil,
            clarification: nil,
            pendingDecision: nil,
            receipt: nil
        )
        XCTAssertFalse(missing.provesCanonicalSafeReadback)
    }

    func testLiveServiceRejectsNonLoopbackBackends() {
        XCTAssertThrowsError(
            try URLMacRelationshipService(
                configuration: .init(
                    baseURL: URL(string: "https://example.com")!,
                    accountSlug: "example",
                    userEmail: "recruiter@example.com"
                )
            )
        )
    }

    func testOutcomeUnknownCorrelationIsEncryptedAndSurvivesStoreRecreation() throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "talent-signal-unknown-resolution-\(UUID().uuidString)", directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: directory) }
        let keyProvider = FixedUnknownResolutionKeyProvider()
        let firstStore = SecureUnknownResolutionStore(
            directory: directory,
            keyProvider: keyProvider
        )
        let scopeKey = "http://127.0.0.1:4321|fixture-alpha|recruiter@alpha.local"
        let expected = DurableUnknownResolution(
            schemaVersion: DurableUnknownResolution.currentSchemaVersion,
            operationID: "11111111-1111-4111-8111-111111111111",
            bundleID: "22222222-2222-4222-8222-222222222222",
            taskID: "33333333-3333-4333-8333-333333333333",
            taskRevision: 2,
            bundleRevision: 1,
            proposalID: "44444444-4444-4444-8444-444444444444",
            baseRevision: 7,
            reason: "The recruiter confirmed the exact review-only diff.",
            decisions: [.init(
                itemID: "55555555-5555-4555-8555-555555555555",
                choice: CanonicalDecisionChoice.accept.rawValue
            )],
            workspaceID: "66666666-6666-4666-8666-666666666666",
            accountID: "66666666-6666-4666-8666-666666666666",
            pursuitID: "77777777-7777-4777-8777-777777777777",
            personID: "88888888-8888-4888-8888-888888888888",
            relationshipContextID: "99999999-9999-4999-8999-999999999999",
            captureID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            resourceID: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            evidenceIDs: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"],
            savedAt: Date(timeIntervalSince1970: 1_788_200_000),
            transportError: "The response was lost after dispatch."
        )

        try firstStore.save(expected, scopeKey: scopeKey)
        let files = try FileManager.default.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: nil
        )
        let file = try XCTUnwrap(files.first)
        let encrypted = try Data(contentsOf: file)
        XCTAssertNil(encrypted.range(of: Data(expected.operationID.utf8)))

        let recreatedStore = SecureUnknownResolutionStore(
            directory: directory,
            keyProvider: keyProvider
        )
        XCTAssertEqual(try recreatedStore.load(scopeKey: scopeKey), expected)
        try recreatedStore.clear(scopeKey: scopeKey)
        XCTAssertNil(try recreatedStore.load(scopeKey: scopeKey))
    }

    @MainActor
    func testDecisionRequiresAnExplicitChoiceForEveryItemBeforeReceipt() async throws {
        let model = AppModel(
            service: FixtureRelationshipService(initialMode: .needsDecision),
            initialMode: .needsDecision
        )

        await model.load()
        let item = try XCTUnwrap(model.pendingDecision?.items.first)
        XCTAssertFalse(model.canResolveCanonicalDecision)
        XCTAssertNil(model.canonicalReceipt)

        model.setDecision(itemID: item.id, choice: .accept)
        XCTAssertTrue(model.canResolveCanonicalDecision)

        await model.resolveCanonicalDecision()
        XCTAssertEqual(model.mode, .receipt)
        XCTAssertEqual(model.canonicalReceipt?.externalEffects, [])
        XCTAssertEqual(model.canonicalReceipt?.beforeRevision, 7)
        XCTAssertEqual(model.canonicalReceipt?.afterRevision, 8)
    }

    @MainActor
    func testClearScrubsRelationshipDecisionAndReceiptProjections() async {
        let model = AppModel(
            service: FixtureRelationshipService(initialMode: .receipt),
            initialMode: .receipt
        )
        await model.load()
        XCTAssertNotNil(model.canonicalReceipt)

        model.clearLocalContext()

        XCTAssertEqual(model.mode, .deleted)
        XCTAssertNil(model.pendingDecision)
        XCTAssertNil(model.canonicalReceipt)
        XCTAssertTrue(model.decisionSelections.isEmpty)
        XCTAssertEqual(model.presentation.candidateName, "No relationship details displayed")
        XCTAssertTrue(model.presentation.actionProjections.isEmpty)
    }

    @MainActor
    func testSaveIdentityReviewCreatesNonBindingReceipt() async {
        let model = AppModel(
            service: FixtureRelationshipService(initialMode: .ambiguousIdentity),
            initialMode: .ambiguousIdentity
        )
        await model.load()

        model.saveIdentityForReview()

        XCTAssertEqual(model.mode, .identityReviewSaved)
        XCTAssertNotNil(model.identityReviewReceipt)
        XCTAssertNil(model.pendingDecision)
        XCTAssertNil(model.canonicalReceipt)
    }

    @MainActor
    func testFactConfirmationDoesNotPrepareCopyOrSendLocalDraft() {
        let model = AppModel(
            service: FixtureRelationshipService(initialMode: .needsDecision),
            initialMode: .needsDecision
        )

        model.confirmFactProposal()

        XCTAssertEqual(model.factReviewStatus, .confirmed)
        XCTAssertEqual(model.localDraftStatus, .awaitingDecision)
        XCTAssertNil(model.canonicalReceipt)
    }
}

private struct FixedUnknownResolutionKeyProvider: UnknownResolutionKeyProviding {
    func key(scopeKey: String) throws -> Data {
        Data(repeating: 0x5a, count: 32)
    }
}
