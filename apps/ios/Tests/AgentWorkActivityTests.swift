import XCTest
@testable import TalentSignal

final class AgentWorkActivityTests: XCTestCase {
    private let attributes = AgentWorkActivityAttributes(
        schemaVersion: AgentWorkActivityAttributes.currentSchemaVersion,
        scopeID: "debug.local",
        taskID: "task.agent-showcase",
        activityInstanceID: "instance.0001"
    )

    func testRunningPhasesExposeTrustworthyStageWithoutProgress() throws {
        let stages: [(AgentWorkStage, String, AgentWorkGlyph)] = [
            (.readingEvidence, "Reading selected evidence", .evidence),
            (.resolvingIdentity, "Checking the right person", .identity),
            (.preparingActions, "Preparing review actions", .actions),
        ]

        for (index, expected) in stages.enumerated() {
            let state = makeState(
                execution: .running,
                attention: .observe,
                stage: expected.0,
                revision: Int64(index + 1)
            )
            let view = try AgentWorkActivityProjector.project(state)

            XCTAssertEqual(view.title, expected.1)
            XCTAssertEqual(view.glyph, expected.2)
            XCTAssertEqual(view.supportingText, "You can leave")
            XCTAssertEqual(view.boundaryText.contains("No contact changed"), expected.0 == .resolvingIdentity)
            XCTAssertFalse(view.title.localizedCaseInsensitiveContains("percent"))
            XCTAssertFalse(view.title.contains("%"))
        }
    }

    func testCompletedReviewShowsActionCountAndNoExecutionClaim() throws {
        let state = makeState(
            execution: .completed,
            attention: .review,
            stage: .readyForReview,
            actionCount: 3,
            revision: 4
        )

        let view = try AgentWorkActivityProjector.project(state)

        XCTAssertEqual(view.title, "Actions ready to review")
        XCTAssertEqual(view.supportingText, "3 suggested actions")
        XCTAssertEqual(view.boundaryText, "Nothing applied yet")
        XCTAssertEqual(view.action, .openActions)
        XCTAssertTrue(view.isTerminal)
    }

    func testNoActionIsAValidCompletedOutcome() throws {
        let view = try AgentWorkActivityProjector.project(
            makeState(
                execution: .completed,
                attention: .none,
                stage: .readyForReview,
                actionCount: 0,
                revision: 4
            )
        )

        XCTAssertEqual(view.title, "No action needed")
        XCTAssertNil(view.action)
        XCTAssertEqual(view.boundaryText, "Nothing was changed")
    }

    func testIllegalStateAndActionCountFailClosed() {
        XCTAssertThrowsError(
            try AgentWorkActivityProjector.project(
                makeState(
                    execution: .running,
                    attention: .review,
                    stage: .readyForReview,
                    actionCount: 2,
                    revision: 2
                )
            )
        )
        XCTAssertThrowsError(
            try AgentWorkActivityProjector.project(
                makeState(
                    execution: .completed,
                    attention: .review,
                    stage: .readyForReview,
                    actionCount: 0,
                    revision: 4
                )
            )
        )
    }

    func testStaleChangesFreshnessLanguageNotBusinessOutcome() throws {
        let fresh = makeState(
            execution: .running,
            attention: .observe,
            freshness: .fresh,
            stage: .preparingActions,
            revision: 3
        )
        let stale = makeState(
            execution: .running,
            attention: .observe,
            freshness: .stale,
            stage: .preparingActions,
            revision: 3
        )

        let freshView = try AgentWorkActivityProjector.project(fresh)
        let staleView = try AgentWorkActivityProjector.project(stale)

        XCTAssertEqual(freshView.title, staleView.title)
        XCTAssertEqual(freshView.action, staleView.action)
        XCTAssertFalse(freshView.isStale)
        XCTAssertTrue(staleView.isStale)
        XCTAssertTrue(staleView.accessibilityLabel.contains("Last update delayed"))
    }

    func testOrderingIgnoresOlderAndRejectsConflictsAndRegression() {
        let running = makeState(
            execution: .running,
            attention: .observe,
            stage: .preparingActions,
            revision: 3
        )
        let older = makeState(
            execution: .running,
            attention: .observe,
            stage: .readingEvidence,
            revision: 2
        )
        let conflict = makeState(
            execution: .running,
            attention: .observe,
            stage: .resolvingIdentity,
            revision: 3
        )
        let terminal = makeState(
            execution: .completed,
            attention: .review,
            stage: .readyForReview,
            actionCount: 2,
            revision: 4
        )
        let regression = makeState(
            execution: .running,
            attention: .observe,
            stage: .preparingActions,
            revision: 5
        )

        XCTAssertEqual(decision(from: running, to: older), .ignoreOlder)
        XCTAssertEqual(decision(from: running, to: running), .noOp)
        XCTAssertEqual(decision(from: running, to: conflict), .sameRevisionConflict)
        XCTAssertEqual(decision(from: terminal, to: regression), .terminalRegression)
    }

    func testOldInstanceCannotUpdateNewActivity() {
        let current = makeState(
            execution: .running,
            attention: .observe,
            stage: .readingEvidence,
            revision: 1
        )
        let proposedAttributes = AgentWorkActivityAttributes(
            schemaVersion: AgentWorkActivityAttributes.currentSchemaVersion,
            scopeID: attributes.scopeID,
            taskID: attributes.taskID,
            activityInstanceID: "instance.old"
        )

        XCTAssertEqual(
            AgentWorkActivityTransitionPolicy.decision(
                currentAttributes: attributes,
                currentState: current,
                proposedAttributes: proposedAttributes,
                proposedState: current
            ),
            .identityMismatch
        )
    }

    func testPayloadRejectsReadableIdentityAndStaysBelowFourKilobytes() throws {
        let state = makeState(
            execution: .completed,
            attention: .review,
            stage: .readyForReview,
            actionCount: 3,
            revision: 4
        )
        try AgentWorkActivityPayloadContract.validate(
            attributes: attributes,
            contentState: state
        )
        XCTAssertLessThanOrEqual(
            try AgentWorkActivityPayloadContract.encodedByteCount(
                attributes: attributes,
                contentState: state
            ),
            AgentWorkActivityPayloadContract.maximumEncodedBytes
        )

        let readableIdentity = AgentWorkActivityAttributes(
            schemaVersion: AgentWorkActivityAttributes.currentSchemaVersion,
            scopeID: attributes.scopeID,
            taskID: "Alex Chen alex@example.test",
            activityInstanceID: attributes.activityInstanceID
        )
        XCTAssertThrowsError(
            try AgentWorkActivityPayloadContract.validate(
                attributes: readableIdentity,
                contentState: state
            )
        )
    }

    func testDeepLinkRoundTripsOnlyOpaqueExactIdentity() throws {
        let identity = AgentWorkActivityIdentity(
            scopeID: attributes.scopeID,
            taskID: attributes.taskID,
            activityInstanceID: attributes.activityInstanceID
        )
        let url = try XCTUnwrap(
            AgentWorkDeepLink.url(identity: identity, destination: .actions)
        )

        XCTAssertEqual(
            AgentWorkDeepLink.parse(url),
            AgentWorkDeepLink(identity: identity, destination: .actions)
        )
        XCTAssertNil(
            AgentWorkDeepLink.parse(
                URL(string: "talentsignal://agent-work/actions?scope=debug.local&task=Alex%20Chen&instance=instance.0001")!
            )
        )
        XCTAssertNil(
            AgentWorkDeepLink.parse(
                URL(string: "talentsignal://agent-work/actions?scope=debug.local&task=task.agent-showcase&task=other&instance=instance.0001")!
            )
        )
    }

    private func decision(
        from current: AgentWorkActivityAttributes.ContentState,
        to proposed: AgentWorkActivityAttributes.ContentState
    ) -> AgentWorkActivityTransitionDecision {
        AgentWorkActivityTransitionPolicy.decision(
            currentAttributes: attributes,
            currentState: current,
            proposedAttributes: attributes,
            proposedState: proposed
        )
    }

    private func makeState(
        execution: AgentWorkExecution,
        attention: AgentWorkAttention,
        freshness: AgentWorkFreshness = .fresh,
        stage: AgentWorkStage,
        actionCount: Int = 0,
        revision: Int64
    ) -> AgentWorkActivityAttributes.ContentState {
        AgentWorkActivityAttributes.ContentState(
            execution: execution,
            attention: attention,
            freshness: freshness,
            stage: stage,
            reviewActionCount: actionCount,
            eventRevision: revision,
            updatedAt: Date(timeIntervalSince1970: 1_788_000_000)
        )
    }
}
