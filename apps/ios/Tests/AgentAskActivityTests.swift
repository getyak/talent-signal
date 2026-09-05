import XCTest
@testable import TalentSignal

final class AgentAskActivityTests: XCTestCase {
    private let identity = AgentAskActivityIdentity(
        workspaceID: "workspace-123",
        sessionID: "11111111-1111-4111-8111-111111111111",
        activityInstanceID: "22222222-2222-4222-8222-222222222222"
    )

    func testThinkingBecomesConciseTimeoutOnlyWhenSystemStateIsStale() {
        let state = content(.thinking, revision: 1)
        let locale = Locale(identifier: "zh-Hans")
        let fresh = AgentAskActivityProjector.presentation(
            state,
            isSystemStale: false,
            locale: locale
        )
        let stale = AgentAskActivityProjector.presentation(
            state,
            isSystemStale: true,
            locale: locale
        )

        XCTAssertEqual(fresh.phase, .thinking)
        XCTAssertNil(fresh.compactTitle)
        XCTAssertEqual(stale.phase, .timedOut)
        XCTAssertEqual(stale.title, "还没回来")
        XCTAssertEqual(stale.action, .retry)
    }

    func testReviewUsesOneShortActionAndNoMessageContent() throws {
        let view = AgentAskActivityProjector.presentation(
            content(.review, revision: 2),
            isSystemStale: false,
            locale: Locale(identifier: "zh-Hans")
        )

        XCTAssertEqual(view.title, "Review")
        XCTAssertEqual(view.actionTitle, "查看")
        XCTAssertEqual(view.action, .open)
        XCTAssertFalse(view.accessibilityLabel.contains("candidate"))
    }

    func testFailureCopyIsBriefAndLocalized() {
        let state = content(.failed, revision: 2)
        let english = AgentAskActivityProjector.presentation(
            state,
            isSystemStale: false,
            locale: Locale(identifier: "en")
        )
        let chinese = AgentAskActivityProjector.presentation(
            state,
            isSystemStale: false,
            locale: Locale(identifier: "zh-Hans")
        )

        XCTAssertEqual(english.title, "Couldn't connect")
        XCTAssertEqual(english.actionTitle, "Retry")
        XCTAssertEqual(chinese.title, "没连上")
        XCTAssertEqual(chinese.actionTitle, "重试")
    }

    func testPayloadAcceptsOnlyOpaqueIdentifiers() throws {
        try AgentAskActivityPayloadContract.validate(
            attributes: attributes(identity),
            state: content(.thinking, revision: 1)
        )

        let readable = AgentAskActivityAttributes(
            schemaVersion: AgentAskActivityAttributes.currentSchemaVersion,
            workspaceID: "workspace-123",
            sessionID: "Leila needs a reply",
            activityInstanceID: identity.activityInstanceID
        )
        XCTAssertThrowsError(
            try AgentAskActivityPayloadContract.validate(
                attributes: readable,
                state: content(.thinking, revision: 1)
            )
        )
    }

    func testDeepLinkReturnsToExactSessionAndRejectsExtraIdentityText() throws {
        let url = try XCTUnwrap(
            AgentAskDeepLink.url(identity: identity, destination: .review)
        )
        XCTAssertEqual(
            AgentAskDeepLink.parse(url),
            AgentAskDeepLink(identity: identity, destination: .review)
        )
        XCTAssertNil(
            AgentAskDeepLink.parse(
                URL(string: "talentsignal://ask/review?workspace=workspace-123&session=Leila%20Chen&instance=x")!
            )
        )
    }

    func testTerminalActivityCannotRegressToThinking() {
        XCTAssertEqual(
            AgentAskActivityTransitionPolicy.decision(
                from: content(.review, revision: 2),
                to: content(.thinking, revision: 3)
            ),
            .terminalRegression
        )
        XCTAssertEqual(
            AgentAskActivityTransitionPolicy.decision(
                from: content(.thinking, revision: 2),
                to: content(.failed, revision: 3)
            ),
            .apply
        )
    }

    private func content(
        _ phase: AgentAskActivityPhase,
        revision: Int64
    ) -> AgentAskActivityAttributes.ContentState {
        .init(
            phase: phase,
            eventRevision: revision,
            updatedAt: Date(timeIntervalSince1970: TimeInterval(revision))
        )
    }

    private func attributes(
        _ identity: AgentAskActivityIdentity
    ) -> AgentAskActivityAttributes {
        .init(
            schemaVersion: AgentAskActivityAttributes.currentSchemaVersion,
            workspaceID: identity.workspaceID,
            sessionID: identity.sessionID,
            activityInstanceID: identity.activityInstanceID
        )
    }
}
