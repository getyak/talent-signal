import Foundation
import XCTest
@testable import TalentSignal

final class TextSignalCaptureTests: XCTestCase {
    func testSameNameScopesExposeDistinctStableIdentityClues() {
        let first = TextSignalScope(
            workspaceID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            pursuitID: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            pursuitTitle: "Synthetic search",
            pursuitRevision: 1,
            currentMilestone: "evidence_review",
            roleID: "11111111-1111-4111-8111-111111111111",
            roleType: "candidate",
            personID: "22222222-2222-4222-8222-222222222222",
            personDisplayLabel: "Alex Chen",
            relationshipContextID: "33333333-3333-4333-8333-333333333333",
            relationshipContextLabel: "Same-name search A"
        )
        let second = TextSignalScope(
            workspaceID: first.workspaceID,
            pursuitID: first.pursuitID,
            pursuitTitle: first.pursuitTitle,
            pursuitRevision: first.pursuitRevision,
            currentMilestone: first.currentMilestone,
            roleID: "44444444-4444-4444-8444-444444444444",
            roleType: "candidate",
            personID: "55555555-5555-4555-8555-555555555555",
            personDisplayLabel: "Alex Chen",
            relationshipContextID: "66666666-6666-4666-8666-666666666666",
            relationshipContextLabel: "Same-name search B"
        )

        XCTAssertNotEqual(first.id, second.id)
        XCTAssertNotEqual(first.pickerLabel, second.pickerLabel)
        XCTAssertTrue(first.pickerLabel.contains("Same-name search A"))
        XCTAssertTrue(second.accessibilityLabel.contains("Same-name search B"))
        XCTAssertTrue(first.pickerLabel.contains(first.pursuitTitle))
    }

    fileprivate static let workspaceID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

    func testOutboxAtomicallyRestoresProtectedExactText() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "text-signal-outbox-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let id = UUID()
        let record = TextSignalOutboxRecord(
            id: id,
            workspaceID: Self.workspaceID,
            text: "The final conversation works next Tuesday.",
            purpose: "Synthetic persistence proof",
            speaker: nil,
            scope: nil,
            proposedMilestone: "",
            proposalReason: ""
        )
        let first = TextSignalOutbox(directoryURL: directory)
        try await first.save(record)

        let relaunched = TextSignalOutbox(directoryURL: directory)
        let restored = try await relaunched.record(id: id, workspaceID: Self.workspaceID)
        let protection = try await relaunched.fileProtection(
            id: id,
            workspaceID: Self.workspaceID
        )

        XCTAssertEqual(restored?.id, record.id)
        XCTAssertEqual(restored?.text, record.text)
        XCTAssertEqual(restored?.purpose, record.purpose)
        XCTAssertEqual(restored?.state, record.state)
#if targetEnvironment(simulator)
        XCTAssertTrue(
            protection == nil || protection == .complete,
            "Simulator filesystems may not expose the device Data Protection class."
        )
#else
        XCTAssertEqual(protection, .complete)
#endif
    }

    @MainActor
    func testSavedLocalSurvivesStoreRelaunchWithoutSync() async throws {
        let id = UUID()
        let outbox = MemoryTextSignalOutbox()
        let service = TextSignalServiceStub()
        let first = TextSignalCaptureStore(
            recordID: id,
            outbox: outbox,
            service: service
        )
        first.load()
        try await waitUntil { first.phase == .editing }
        first.text = "Exact synthetic Signal"
        first.saveLocally()
        try await waitUntil { first.phase == .savedLocal }
        let firstSyncCount = await service.syncCount
        XCTAssertEqual(firstSyncCount, 0)

        let relaunched = TextSignalCaptureStore(
            recordID: id,
            outbox: outbox,
            service: service
        )
        relaunched.load()
        try await waitUntil { relaunched.phase == .savedLocal }

        XCTAssertEqual(relaunched.text, "Exact synthetic Signal")
        XCTAssertNil(relaunched.speaker)
        let relaunchedSyncCount = await service.syncCount
        XCTAssertEqual(relaunchedSyncCount, 0)
    }

    @MainActor
    func testSyncPersistsCanonicalReadbackAndDeletionRemovesPayloadLast() async throws {
        let id = UUID()
        let outbox = MemoryTextSignalOutbox()
        let service = TextSignalServiceStub()
        let store = TextSignalCaptureStore(
            recordID: id,
            outbox: outbox,
            service: service
        )
        store.load()
        try await waitUntil { store.phase == .editing }
        store.text = "The final conversation works next Tuesday."
        store.speaker = .candidate
        store.proposedMilestone = "final_conversation"
        store.proposalReason = "The candidate explicitly agreed to the final conversation timing."
        store.queueAndSync()
        try await waitUntil {
            if case .stagedForReview = store.phase { return true }
            return false
        }

        let savedValue = await outbox.record(id: id, workspaceID: Self.workspaceID)
        let saved = try XCTUnwrap(savedValue)
        XCTAssertEqual(saved.state, .stagedForReview)
        XCTAssertEqual(saved.attemptCount, 1)
        XCTAssertEqual(saved.captureID, TextSignalServiceStub.captureID)
        XCTAssertEqual(saved.proposalID, id.uuidString.lowercased())
        XCTAssertFalse(store.isDraftEditable)
        XCTAssertFalse(store.canSaveLocally)

        store.delete()
        try await waitUntil {
            if case .deleted = store.phase { return true }
            return false
        }
        let deletedLocalRecord = await outbox.record(id: id, workspaceID: Self.workspaceID)
        let deletedCaptureIDs = await service.deletedCaptureIDs
        XCTAssertNil(deletedLocalRecord)
        XCTAssertEqual(deletedCaptureIDs, [TextSignalServiceStub.captureID])
        XCTAssertTrue(store.isDeleted)
        XCTAssertFalse(store.canDelete)
        XCTAssertEqual(store.text, "")
        XCTAssertEqual(store.purpose, "")
        XCTAssertNil(store.speaker)
        XCTAssertNil(store.selectedScopeID)
    }

    @MainActor
    func testInterruptedSyncRetriesSameRecordAndIdempotentIdentity() async throws {
        let id = UUID()
        let outbox = MemoryTextSignalOutbox()
        let service = TextSignalServiceStub(failuresBeforeSuccess: 1)
        let store = TextSignalCaptureStore(
            recordID: id,
            outbox: outbox,
            service: service
        )
        store.load()
        try await waitUntil { store.phase == .editing }
        store.text = "Exact retry Signal"
        store.speaker = .candidate
        store.queueAndSync()
        try await waitUntil {
            if case .failed = store.phase { return true }
            return false
        }
        XCTAssertFalse(store.canDelete)
        XCTAssertFalse(store.isDraftEditable)
        XCTAssertFalse(store.offersInitialSync)

        store.retry()
        try await waitUntil {
            if case .synced = store.phase { return true }
            return false
        }
        let syncedRecordIDs = await service.syncedRecordIDs
        let retriedRecord = await outbox.record(id: id, workspaceID: Self.workspaceID)
        XCTAssertEqual(syncedRecordIDs, [id, id])
        XCTAssertEqual(retriedRecord?.attemptCount, 2)
    }

    @MainActor
    func testMilestoneProposalRequiresCandidateAttributionReasonAndChangedValue() async throws {
        let service = TextSignalServiceStub()
        let store = TextSignalCaptureStore(
            outbox: MemoryTextSignalOutbox(),
            service: service
        )
        store.load()
        try await waitUntil { store.phase == .editing }
        store.text = "Exact evidence"
        store.proposedMilestone = "final_conversation"
        store.speaker = .recruiter
        XCTAssertNotNil(store.syncBlockingMessage)

        store.speaker = .candidate
        XCTAssertNotNil(store.syncBlockingMessage)
        store.proposalReason = "The exact candidate statement names the final conversation."
        XCTAssertNil(store.syncBlockingMessage)

        store.proposedMilestone = TextSignalServiceStub.scope.currentMilestone
        XCTAssertNotNil(store.syncBlockingMessage)
    }

    func testOutboxIsolatesSameRecordIDAcrossWorkspaces() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "text-signal-workspaces-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let id = UUID()
        let alpha = TextSignalOutboxRecord(
            id: id,
            workspaceID: Self.workspaceID,
            text: "Alpha-only evidence",
            purpose: "Synthetic workspace isolation proof",
            speaker: nil,
            scope: nil,
            proposedMilestone: "",
            proposalReason: ""
        )
        let betaWorkspaceID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
        let beta = TextSignalOutboxRecord(
            id: id,
            workspaceID: betaWorkspaceID,
            text: "Beta-only evidence",
            purpose: "Synthetic workspace isolation proof",
            speaker: nil,
            scope: nil,
            proposedMilestone: "",
            proposalReason: ""
        )
        let outbox = TextSignalOutbox(directoryURL: directory)

        try await outbox.save(alpha)
        try await outbox.save(beta)

        let restoredAlpha = try await outbox.record(id: id, workspaceID: Self.workspaceID)
        let restoredBeta = try await outbox.record(id: id, workspaceID: betaWorkspaceID)
        let alphaCount = try await outbox.records(workspaceID: Self.workspaceID).count
        let betaCount = try await outbox.records(workspaceID: betaWorkspaceID).count
        XCTAssertEqual(restoredAlpha?.text, "Alpha-only evidence")
        XCTAssertEqual(restoredBeta?.text, "Beta-only evidence")
        XCTAssertEqual(alphaCount, 1)
        XCTAssertEqual(betaCount, 1)
    }

    func testWorkspaceBindingIsProtectedAndScopedToEndpointAndAccount() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "text-signal-bindings-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = TextSignalWorkspaceBindingStore(directoryURL: directory)
        let endpoint = try XCTUnwrap(URL(string: "http://127.0.0.1:4326"))

        try await store.save(
            workspaceID: Self.workspaceID,
            baseURL: endpoint,
            accountSlug: "fixture-alpha",
            userEmail: "recruiter@alpha.local"
        )

        let matching = try await store.binding(
            baseURL: endpoint,
            accountSlug: "fixture-alpha",
            userEmail: "recruiter@alpha.local"
        )
        let differentEndpoint = try await store.binding(
            baseURL: URL(string: "http://127.0.0.1:9999")!,
            accountSlug: "fixture-alpha",
            userEmail: "recruiter@alpha.local"
        )
        let differentAccount = try await store.binding(
            baseURL: endpoint,
            accountSlug: "fixture-beta",
            userEmail: "recruiter@beta.local"
        )

        XCTAssertEqual(matching?.workspaceID, Self.workspaceID)
        XCTAssertNil(differentEndpoint)
        XCTAssertNil(differentAccount)
    }

    @MainActor
    func testInitialRecordStaysHiddenWhenAuthenticatedWorkspaceDiffers() async throws {
        let initial = TextSignalOutboxRecord(
            id: UUID(),
            workspaceID: Self.workspaceID,
            text: "Never reveal this Alpha evidence in Beta",
            purpose: "Synthetic workspace mismatch proof",
            speaker: .candidate,
            scope: TextSignalServiceStub.scope,
            proposedMilestone: "",
            proposalReason: ""
        )
        let betaWorkspaceID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
        let store = TextSignalCaptureStore(
            initialRecord: initial,
            outbox: MemoryTextSignalOutbox(),
            service: TextSignalServiceStub(workspaceID: betaWorkspaceID)
        )

        XCTAssertEqual(store.text, "")
        store.load()
        try await waitUntil {
            if case .failed = store.phase { return true }
            return false
        }

        XCTAssertEqual(store.text, "")
        XCTAssertNil(store.speaker)
        XCTAssertNil(store.selectedScopeID)
        XCTAssertNotNil(store.syncBlockingMessage)
    }

    @MainActor
    private func waitUntil(
        timeout: TimeInterval = 2,
        condition: @escaping @MainActor () -> Bool
    ) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if condition() { return }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        XCTFail("Timed out waiting for Text Signal state")
    }
}

private actor MemoryTextSignalOutbox: TextSignalOutboxPersisting {
    private var values: [String: TextSignalOutboxRecord] = [:]

    private func key(id: UUID, workspaceID: String) -> String {
        "\(workspaceID):\(id.uuidString)"
    }

    func save(_ record: TextSignalOutboxRecord) {
        values[key(id: record.id, workspaceID: record.workspaceID)] = record
    }

    func record(id: UUID, workspaceID: String) -> TextSignalOutboxRecord? {
        values[key(id: id, workspaceID: workspaceID)]
    }

    func oldest(workspaceID: String) -> TextSignalOutboxRecord? {
        records(workspaceID: workspaceID).first
    }

    func records(workspaceID: String) -> [TextSignalOutboxRecord] {
        values.values
            .filter { $0.workspaceID == workspaceID }
            .sorted { $0.createdAt < $1.createdAt }
    }

    func remove(id: UUID, workspaceID: String) {
        values.removeValue(forKey: key(id: id, workspaceID: workspaceID))
    }
}

private actor TextSignalServiceStub: TextSignalSyncServing {
    static let captureID = "11111111-1111-4111-8111-111111111111"
    static let resourceID = "22222222-2222-4222-8222-222222222222"
    static let evidenceID = "33333333-3333-4333-8333-333333333333"
    static let workspaceID = TextSignalCaptureTests.workspaceID
    static let scope = TextSignalScope(
        workspaceID: workspaceID,
        pursuitID: "44444444-4444-4444-8444-444444444444",
        pursuitTitle: "Chief Product Officer · Meridian Labs",
        pursuitRevision: 1,
        currentMilestone: "shortlist_review",
        roleID: "55555555-5555-4555-8555-555555555555",
        roleType: "candidate",
        personID: "66666666-6666-4666-8666-666666666666",
        personDisplayLabel: "Leila Hartmann",
        relationshipContextID: "77777777-7777-4777-8777-777777777777",
        relationshipContextLabel: "Chief Product Officer search"
    )

    private(set) var syncCount = 0
    private(set) var syncedRecordIDs: [UUID] = []
    private(set) var deletedCaptureIDs: [String] = []
    private var remainingFailures: Int
    private let workspaceID: String

    init(
        failuresBeforeSuccess: Int = 0,
        workspaceID: String = TextSignalServiceStub.workspaceID
    ) {
        remainingFailures = failuresBeforeSuccess
        self.workspaceID = workspaceID
    }

    func loadScopes() -> TextSignalScopeCatalog {
        TextSignalScopeCatalog(
            workspaceID: workspaceID,
            scopes: workspaceID == Self.workspaceID ? [Self.scope] : []
        )
    }

    func sync(_ record: TextSignalOutboxRecord) throws -> TextSignalSyncReceipt {
        syncCount += 1
        syncedRecordIDs.append(record.id)
        if remainingFailures > 0 {
            remainingFailures -= 1
            throw TextSignalSyncError.invalidResponse
        }
        return TextSignalSyncReceipt(
            workspaceID: record.workspaceID,
            pursuitID: record.scope?.pursuitID ?? "",
            roleID: record.scope?.roleID ?? "",
            personID: record.scope?.personID ?? "",
            relationshipContextID: record.scope?.relationshipContextID,
            captureID: Self.captureID,
            resourceID: Self.resourceID,
            evidenceFragmentID: Self.evidenceID,
            proposalID: record.stagesProposal ? record.id.uuidString.lowercased() : nil
        )
    }

    func deleteCapture(id: String, recordID: UUID) -> TextSignalDeletionReceipt {
        deletedCaptureIDs.append(id)
        return TextSignalDeletionReceipt(
            deletionID: "88888888-8888-4888-8888-888888888888",
            captureID: id,
            status: "deleted",
            derivativesDeleted: 1
        )
    }
}
