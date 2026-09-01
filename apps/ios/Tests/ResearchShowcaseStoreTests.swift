import XCTest
@testable import TalentSignal

@MainActor
final class ResearchShowcaseStoreTests: XCTestCase {
    func testMainChainUsesOneIdentityAndEndsItOnlyOnReviewDeepLink() async throws {
        let fake = FakeResearchActivityController()
        let store = ResearchShowcaseStore(controller: fake)

        await store.start()
        let identity = try XCTUnwrap(store.identity)
        XCTAssertEqual(store.phase, .running)
        XCTAssertEqual(fake.startedTaskID, ResearchShowcaseStore.taskID)

        await store.completeResearch()
        XCTAssertEqual(store.phase, .review(openedFromActivity: false))
        XCTAssertEqual(fake.updatedIdentity, identity)
        XCTAssertEqual(fake.snapshot?.state.stage, .pagesReadyForReview)
        XCTAssertNil(fake.endedIdentity)

        let url = try XCTUnwrap(
            ResearchDeepLink.url(identity: identity, destination: .review)
        )
        await store.open(try XCTUnwrap(ResearchDeepLink.parse(url)))

        XCTAssertEqual(store.phase, .review(openedFromActivity: true))
        XCTAssertEqual(fake.endedIdentity, identity)
        XCTAssertNil(store.identity)
    }

    func testMismatchedReviewLinkDoesNotEndCurrentActivity() async throws {
        let fake = FakeResearchActivityController()
        let store = ResearchShowcaseStore(controller: fake)
        await store.start()
        await store.completeResearch()

        let current = try XCTUnwrap(fake.snapshot?.identity)
        let mismatched = ResearchActivityIdentity(
            scopeID: current.scopeID,
            taskID: current.taskID,
            activityInstanceID: "instance.old"
        )
        await store.open(
            ResearchDeepLink(identity: mismatched, destination: .review)
        )

        XCTAssertEqual(store.phase, .routeRejected)
        XCTAssertNil(fake.endedIdentity)
    }
}

@MainActor
private final class FakeResearchActivityController: ResearchActivityControlling {
    private(set) var startedTaskID: String?
    private(set) var updatedIdentity: ResearchActivityIdentity?
    private(set) var endedIdentity: ResearchActivityIdentity?
    private(set) var snapshot: ResearchActivitySnapshot?

    func startSyntheticResearch(
        scopeID: String,
        taskID: String,
        now: Date,
        fixtureLifetime: TimeInterval
    ) async -> ResearchActivityIdentity? {
        startedTaskID = taskID
        let identity = ResearchActivityIdentity(
            scopeID: scopeID,
            taskID: taskID,
            activityInstanceID: "instance.0001"
        )
        snapshot = ResearchActivitySnapshot(
            identity: identity,
            state: ResearchActivityAttributes.ContentState(
                execution: .running,
                stage: .readingApprovedPages,
                eventRevision: 1,
                updatedAt: now
            )
        )
        return identity
    }

    func update(
        identity: ResearchActivityIdentity,
        state: ResearchActivityAttributes.ContentState,
        now: Date
    ) async -> ResearchActivityControllerResult {
        guard snapshot?.identity == identity else { return .missing }
        updatedIdentity = identity
        snapshot = ResearchActivitySnapshot(identity: identity, state: state)
        return .applied
    }

    func end(
        identity: ResearchActivityIdentity,
        dismissImmediately: Bool,
        now: Date
    ) async -> ResearchActivityControllerResult {
        guard snapshot?.identity == identity else { return .missing }
        endedIdentity = identity
        snapshot = nil
        return .applied
    }

    func restoreOrCleanExpired(now: Date) async -> ResearchActivitySnapshot? {
        snapshot
    }

    func activeSnapshot(
        identity: ResearchActivityIdentity
    ) -> ResearchActivitySnapshot? {
        snapshot?.identity == identity ? snapshot : nil
    }
}
