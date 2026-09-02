import XCTest
@testable import TalentSignal

final class ResearchActivityTests: XCTestCase {
    private let attributes = ResearchActivityAttributes(
        schemaVersion: ResearchActivityAttributes.currentSchemaVersion,
        scopeID: "debug.local",
        taskID: "task.synthetic-research.showcase",
        activityInstanceID: "instance.0001"
    )

    func testRunningAndReviewCopyMatchesResearchContract() throws {
        let running = try ResearchActivityProjector.project(
            makeState(
                execution: .running,
                stage: .readingApprovedPages,
                revision: 1
            )
        )
        XCTAssertEqual(running.title, "Reading approved pages")
        XCTAssertEqual(running.supportingText, "You can leave")
        XCTAssertEqual(running.boundaryText, "Public sources only")
        XCTAssertEqual(running.action, .openStatus)
        XCTAssertFalse(running.isTerminal)

        let review = try ResearchActivityProjector.project(
            makeState(
                execution: .completed,
                stage: .pagesReadyForReview,
                revision: 2
            )
        )
        XCTAssertEqual(review.title, "Pages ready for review")
        XCTAssertEqual(review.supportingText, "Review required before use")
        XCTAssertEqual(review.action, .openReview)
        XCTAssertTrue(review.isTerminal)
    }

    func testUnsupportedStateFailsClosed() {
        XCTAssertThrowsError(
            try ResearchActivityProjector.project(
                makeState(
                    execution: .completed,
                    stage: .readingApprovedPages,
                    revision: 2
                )
            )
        )
    }

    func testPayloadIsOpaqueAndBelowActivityKitLimit() throws {
        let state = makeState(
            execution: .completed,
            stage: .pagesReadyForReview,
            revision: 2
        )
        try ResearchActivityPayloadContract.validate(
            attributes: attributes,
            contentState: state
        )
        XCTAssertLessThanOrEqual(
            try ResearchActivityPayloadContract.encodedByteCount(
                attributes: attributes,
                contentState: state
            ),
            ResearchActivityPayloadContract.maximumEncodedBytes
        )

        let readable = ResearchActivityAttributes(
            schemaVersion: ResearchActivityAttributes.currentSchemaVersion,
            scopeID: attributes.scopeID,
            taskID: "candidate@example.test",
            activityInstanceID: attributes.activityInstanceID
        )
        XCTAssertThrowsError(
            try ResearchActivityPayloadContract.validate(
                attributes: readable,
                contentState: state
            )
        )
    }

    func testOrderingRejectsOldInstanceConflictAndTerminalRegression() {
        let running = makeState(
            execution: .running,
            stage: .readingApprovedPages,
            revision: 1
        )
        let review = makeState(
            execution: .completed,
            stage: .pagesReadyForReview,
            revision: 2
        )
        let oldInstance = ResearchActivityAttributes(
            schemaVersion: ResearchActivityAttributes.currentSchemaVersion,
            scopeID: attributes.scopeID,
            taskID: attributes.taskID,
            activityInstanceID: "instance.old"
        )

        XCTAssertEqual(
            ResearchActivityTransitionPolicy.decision(
                currentAttributes: attributes,
                currentState: running,
                proposedAttributes: oldInstance,
                proposedState: running
            ),
            .identityMismatch
        )
        XCTAssertEqual(decision(from: running, to: running), .noOp)
        XCTAssertEqual(decision(from: review, to: running), .ignoreOlder)
        let lateRunning = makeState(
            execution: .running,
            stage: .readingApprovedPages,
            revision: 3
        )
        XCTAssertEqual(decision(from: review, to: lateRunning), .terminalRegression)
    }

    func testDeepLinkRoundTripsOnlyExactOpaqueIdentity() throws {
        let identity = ResearchActivityIdentity(
            scopeID: attributes.scopeID,
            taskID: attributes.taskID,
            activityInstanceID: attributes.activityInstanceID
        )
        let url = try XCTUnwrap(
            ResearchDeepLink.url(identity: identity, destination: .review)
        )
        XCTAssertEqual(
            ResearchDeepLink.parse(url),
            ResearchDeepLink(identity: identity, destination: .review)
        )
        XCTAssertNil(
            ResearchDeepLink.parse(
                URL(string: "talentsignal://synthetic-research/review?scope=debug.local&task=Alex%20Chen&instance=instance.0001")!
            )
        )
        XCTAssertNil(
            ResearchDeepLink.parse(
                URL(string: "talentsignal://synthetic-research/review?scope=debug.local&task=task.synthetic-research.showcase&task=other&instance=instance.0001")!
            )
        )
    }

    private func decision(
        from current: ResearchActivityAttributes.ContentState,
        to proposed: ResearchActivityAttributes.ContentState
    ) -> ResearchActivityTransitionDecision {
        ResearchActivityTransitionPolicy.decision(
            currentAttributes: attributes,
            currentState: current,
            proposedAttributes: attributes,
            proposedState: proposed
        )
    }

    private func makeState(
        execution: ResearchActivityExecution,
        stage: ResearchActivityStage,
        revision: Int64
    ) -> ResearchActivityAttributes.ContentState {
        ResearchActivityAttributes.ContentState(
            execution: execution,
            stage: stage,
            eventRevision: revision,
            updatedAt: Date(timeIntervalSince1970: 1_788_000_000)
        )
    }
}
