import XCTest
@testable import TalentSignal

@MainActor
final class AgentTaskProjectionStoreTests: XCTestCase {
    func testDiscoveryRejectsAnotherWorkspaceWithoutTouchingLegacySessions() async {
        let service = StubAgentTaskService(tasks: [Self.task(workspaceID: "other")])
        let store = AgentTaskProjectionStore(
            workspaceID: "workspace",
            pursuitID: "pursuit",
            service: service
        )

        await store.discover()

        XCTAssertNil(store.task)
        XCTAssertEqual(
            store.phase,
            .failed("Agent Task could not be verified from the canonical workspace.")
        )
    }

    func testCursorGapForcesCanonicalSnapshotReconciliation() async {
        let initial = Self.task(latestSequence: 3)
        let reconciled = Self.task(taskRevision: 2, latestSequence: 7)
        let service = StubAgentTaskService(tasks: [initial], readback: reconciled)
        let store = AgentTaskProjectionStore(
            workspaceID: "workspace",
            pursuitID: "pursuit",
            service: service
        )
        await store.discover()

        await store.consume([
            AgentTaskEvent(
                id: "event",
                workspaceID: "workspace",
                taskID: initial.id,
                runID: nil,
                taskSequence: 6,
                streamCursor: "44",
                name: "artifact.ready",
                occurredAt: "2026-08-30T00:00:00.000Z",
                schemaVersion: 1
            )
        ])

        XCTAssertEqual(store.task, reconciled)
        XCTAssertEqual(store.phase, .ready)
        XCTAssertEqual(service.getCalls, 1)
    }

    func testOlderSnapshotCannotReplaceNewerProjection() throws {
        let service = StubAgentTaskService(tasks: [])
        let store = AgentTaskProjectionStore(
            workspaceID: "workspace",
            pursuitID: "pursuit",
            service: service
        )
        let current = Self.task(taskRevision: 3, latestSequence: 9)
        try store.accept(current)
        try store.accept(Self.task(taskRevision: 2, latestSequence: 8))

        XCTAssertEqual(store.task, current)
    }

    private static func task(
        workspaceID: String = "workspace",
        taskRevision: Int = 1,
        latestSequence: Int = 0
    ) -> AgentTaskProjection {
        AgentTaskProjection(
            id: "task",
            workspaceID: workspaceID,
            pursuitID: "pursuit",
            requestedByUserID: "user",
            kind: "pre_call_briefing",
            objective: "Prepare a briefing",
            taskRevision: taskRevision,
            status: .active,
            permissionCeiling: ["read_pursuit"],
            semanticSnapshot: .init(
                pursuitRevision: 1,
                evidenceManifestDigest: String(repeating: "a", count: 64),
                agentDefinitionDigest: String(repeating: "b", count: 64),
                toolSchemaDigest: String(repeating: "c", count: 64),
                policyDigest: String(repeating: "d", count: 64),
                modelDigest: String(repeating: "e", count: 64),
                createdAt: "2026-08-30T00:00:00.000Z"
            ),
            latestRun: nil,
            artifact: nil,
            decisionBundle: nil,
            latestSequence: latestSequence,
            latestCursor: "0",
            continueAllowed: false,
            externalEffects: [],
            createdAt: "2026-08-30T00:00:00.000Z",
            updatedAt: "2026-08-30T00:00:00.000Z",
            completedAt: nil
        )
    }
}

@MainActor
private final class StubAgentTaskService: AgentTaskServing {
    let tasks: [AgentTaskProjection]
    let readback: AgentTaskProjection?
    private(set) var getCalls = 0

    init(tasks: [AgentTaskProjection], readback: AgentTaskProjection? = nil) {
        self.tasks = tasks
        self.readback = readback
    }

    func list(pursuitID: String, includeHistory: Bool) async throws -> [AgentTaskProjection] {
        tasks
    }

    func get(taskID: String) async throws -> AgentTaskProjection {
        getCalls += 1
        guard let readback else { throw AgentTaskClientError.invalidResponse }
        return readback
    }

    func events(taskID: String, afterSequence: Int) async throws -> [AgentTaskEvent] {
        []
    }
}
