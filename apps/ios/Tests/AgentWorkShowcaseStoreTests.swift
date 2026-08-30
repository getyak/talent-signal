import XCTest
@testable import TalentSignal

@MainActor
final class AgentWorkShowcaseStoreTests: XCTestCase {
    func testColdRestoreResumesExactPhaseAndRevision() async {
        let identity = makeIdentity()
        let fake = FakeAgentWorkActivityController(
            snapshot: .init(
                identity: identity,
                state: makeState(stage: .readingEvidence, revision: 7)
            )
        )
        let store = AgentWorkShowcaseStore(controller: fake)

        await store.restore()

        XCTAssertEqual(store.identity, identity)
        XCTAssertEqual(store.phase, .processing(.readingEvidence))
        XCTAssertTrue(store.statusMessage.contains("resumed"))

        await store.advance()

        XCTAssertEqual(fake.lastUpdatedState?.eventRevision, 8)
        XCTAssertEqual(fake.lastUpdatedState?.stage, .resolvingIdentity)
        XCTAssertEqual(store.phase, .processing(.resolvingIdentity))
    }

    func testActionsLinkRejectsRunningStateWithoutEndingActivity() async {
        let identity = makeIdentity()
        let fake = FakeAgentWorkActivityController(
            snapshot: .init(
                identity: identity,
                state: makeState(stage: .readingEvidence, revision: 2)
            )
        )
        let store = AgentWorkShowcaseStore(controller: fake)

        await store.open(.init(identity: identity, destination: .actions))

        XCTAssertEqual(store.phase, .routeRejected)
        XCTAssertNil(store.session)
        XCTAssertEqual(fake.endedIdentities, [])
    }

    func testStatusLinkRejectsTerminalReviewStateWithoutEndingActivity() async {
        let identity = makeIdentity()
        let fake = FakeAgentWorkActivityController(
            snapshot: .init(
                identity: identity,
                state: makeState(
                    execution: .completed,
                    attention: .review,
                    stage: .readyForReview,
                    actionCount: 2,
                    revision: 5
                )
            )
        )
        let store = AgentWorkShowcaseStore(controller: fake)

        await store.open(.init(identity: identity, destination: .status))

        XCTAssertEqual(store.phase, .routeRejected)
        XCTAssertEqual(fake.endedIdentities, [])
    }

    func testActionsLinkAcceptsExactReviewStateAndEndsOnlyThatInstance() async {
        let identity = makeIdentity()
        let fake = FakeAgentWorkActivityController(
            snapshot: .init(
                identity: identity,
                state: makeState(
                    execution: .completed,
                    attention: .review,
                    stage: .readyForReview,
                    actionCount: 2,
                    revision: 5
                )
            )
        )
        let store = AgentWorkShowcaseStore(controller: fake)

        await store.open(.init(identity: identity, destination: .actions))

        XCTAssertEqual(store.phase, .factReview)
        XCTAssertNotNil(store.session)
        XCTAssertNil(store.identity)
        XCTAssertEqual(fake.endedIdentities, [identity])
    }

    func testMissingSystemSurfaceContinuesInAppWithMonotonicState() async {
        let identity = makeIdentity()
        let fake = FakeAgentWorkActivityController(startIdentity: identity)
        fake.updateResult = .missing
        let store = AgentWorkShowcaseStore(controller: fake)

        await store.start()
        await store.advance()

        XCTAssertNil(store.identity)
        XCTAssertEqual(store.phase, .processing(.readingEvidence))
        XCTAssertEqual(fake.lastUpdatedState?.eventRevision, 2)
        XCTAssertTrue(store.statusMessage.contains("continues safely"))
    }

    func testRejectedOlderUpdateDoesNotAdvanceLocalPhaseOrRevision() async {
        let identity = makeIdentity()
        let fake = FakeAgentWorkActivityController(startIdentity: identity)
        fake.updateResult = .ignoredOlder
        let store = AgentWorkShowcaseStore(controller: fake)

        await store.start()
        await store.advance()
        await store.advance()

        XCTAssertEqual(store.identity, identity)
        XCTAssertEqual(store.phase, .processing(.received))
        XCTAssertEqual(fake.updatedStates.map(\.eventRevision), [2, 2])
        XCTAssertTrue(store.statusMessage.contains("stopped"))
    }

    private func makeIdentity() -> AgentWorkActivityIdentity {
        AgentWorkActivityIdentity(
            scopeID: "debug.local",
            taskID: AgentWorkShowcaseScenario.existingContact.taskID,
            activityInstanceID: "instance.0001"
        )
    }

    private func makeState(
        execution: AgentWorkExecution = .running,
        attention: AgentWorkAttention = .observe,
        stage: AgentWorkStage,
        actionCount: Int = 0,
        revision: Int64
    ) -> AgentWorkActivityAttributes.ContentState {
        AgentWorkActivityAttributes.ContentState(
            execution: execution,
            attention: attention,
            freshness: .fresh,
            stage: stage,
            reviewActionCount: actionCount,
            eventRevision: revision,
            updatedAt: Date(timeIntervalSince1970: 1_788_000_000)
        )
    }
}

@MainActor
private final class FakeAgentWorkActivityController: AgentWorkActivityControlling {
    var startIdentity: AgentWorkActivityIdentity?
    var updateResult: AgentWorkActivityControllerResult = .applied
    var endResult: AgentWorkActivityControllerResult = .applied
    var snapshot: AgentWorkActivitySnapshot?
    var updatedStates: [AgentWorkActivityAttributes.ContentState] = []
    var endedIdentities: [AgentWorkActivityIdentity] = []

    var lastUpdatedState: AgentWorkActivityAttributes.ContentState? {
        updatedStates.last
    }

    init(
        startIdentity: AgentWorkActivityIdentity? = nil,
        snapshot: AgentWorkActivitySnapshot? = nil
    ) {
        self.startIdentity = startIdentity
        self.snapshot = snapshot
    }

    func startSyntheticTask(
        scopeID: String,
        taskID: String,
        now: Date,
        fixtureLifetime: TimeInterval
    ) async -> AgentWorkActivityIdentity? {
        startIdentity
    }

    func update(
        identity: AgentWorkActivityIdentity,
        state: AgentWorkActivityAttributes.ContentState,
        now: Date
    ) async -> AgentWorkActivityControllerResult {
        updatedStates.append(state)
        return updateResult
    }

    func end(
        identity: AgentWorkActivityIdentity,
        dismissImmediately: Bool,
        now: Date
    ) async -> AgentWorkActivityControllerResult {
        endedIdentities.append(identity)
        return endResult
    }

    func restoreOrCleanExpired(now: Date) async -> AgentWorkActivitySnapshot? {
        snapshot
    }

    func activeSnapshot(
        identity: AgentWorkActivityIdentity
    ) -> AgentWorkActivitySnapshot? {
        snapshot?.identity == identity ? snapshot : nil
    }
}
