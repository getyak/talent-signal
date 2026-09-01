import XCTest
@testable import TalentSignalMac

final class TodayAttentionProjectionTests: XCTestCase {
    func testCanonicalProjectionRanksWorkAttentionAndCountsNoActionWithoutRankingPeople() {
        let now = ISO8601DateFormatter().date(from: "2026-09-01T12:00:00Z")!
        let people = [
            "person-review": person("person-review", "Alex Chen"),
            "person-overdue": person("person-overdue", "Mia Rivera"),
            "person-future": person("person-future", "Daniel Kim"),
            "person-gap": person("person-gap", "Sam Taylor"),
            "person-quiet": person("person-quiet", "Jordan Lee"),
        ]
        let pursuits = [
            pursuit(id: "review", personID: "person-review"),
            pursuit(
                id: "overdue",
                personID: "person-overdue",
                actions: [action("overdue-action", dueAt: "2026-09-01T10:00:00Z")]
            ),
            pursuit(
                id: "future",
                personID: "person-future",
                actions: [action("future-action", dueAt: "2026-09-02T10:00:00Z")]
            ),
            pursuit(id: "gap", personID: "person-gap", gaps: [gap("open-gap")]),
            pursuit(id: "quiet", personID: "person-quiet"),
        ]
        let proposal = PursuitProposalSummaryDTO(
            id: "proposal-review",
            pursuitID: "review",
            summary: "Review the remote-policy change",
            status: "needs_review",
            evidenceState: .init(availability: "available"),
            reviewContext: .init(
                subject: .init(personID: "person-review", displayLabel: "Alex Chen"),
                evidence: [
                    .init(
                        fragmentID: "fragment-1",
                        text: "I need remote-policy clarity before Friday.",
                        observedAt: "2026-09-01T10:00:00Z",
                        sourceDisplayName: "Reviewed conversation",
                        attributedActor: "candidate",
                        attributionStatus: "confirmed",
                        reviewStatus: "reviewed"
                    ),
                    .init(
                        fragmentID: "fragment-not-cited",
                        text: "This fragment is not cited by the proposal.",
                        observedAt: "2026-09-01T10:01:00Z",
                        sourceDisplayName: "Reviewed conversation",
                        attributedActor: "candidate",
                        attributionStatus: "confirmed",
                        reviewStatus: "reviewed"
                    ),
                    .init(
                        fragmentID: "fragment-unconfirmed",
                        text: "This attribution is not confirmed.",
                        observedAt: "2026-09-01T10:02:00Z",
                        sourceDisplayName: "Reviewed conversation",
                        attributedActor: "unknown",
                        attributionStatus: "proposed",
                        reviewStatus: "reviewed"
                    )
                ]
            ),
            items: [.init(evidenceRefs: ["fragment-1"])],
            updatedAt: "2026-09-01T11:00:00Z"
        )

        let projection = URLMacRelationshipService.todayAttentionProjection(
            pursuits: pursuits,
            proposals: [proposal],
            peopleByID: people,
            now: now
        )

        XCTAssertEqual(projection.items.map(\.kind), [
            .proposalReview, .ownedAction, .ownedAction, .openGap,
        ])
        XCTAssertEqual(projection.items.map(\.personLabel), [
            "Alex Chen", "Mia Rivera", "Daniel Kim", "Sam Taylor",
        ])
        XCTAssertEqual(projection.items.first?.whyNow, "Review the remote-policy change")
        XCTAssertEqual(projection.items.first?.evidence.map(\.id), ["fragment-1"])
        XCTAssertEqual(projection.items.first?.evidence.first?.text, "I need remote-policy clarity before Friday.")
        XCTAssertEqual(projection.items.first?.evidence.first?.source, "Reviewed conversation")
        XCTAssertEqual(projection.items.first?.proposalID, "proposal-review")
        XCTAssertTrue(projection.items.dropFirst().allSatisfy { $0.proposalID == nil })
        XCTAssertEqual(projection.noActionCount, 1)
        XCTAssertEqual(projection.totalPursuitCount, 5)
        XCTAssertTrue(projection.items.allSatisfy { !$0.whyNow.lowercased().contains("score") })
    }

    func testProposalConflictAndUnavailableGapStayExplicitAndDateOnlyTargetIsNotInventedAsTime() {
        let conflict = PursuitProposalSummaryDTO(
            id: "proposal-conflict",
            pursuitID: "conflict",
            summary: "Candidate expectation conflicts with current Pursuit",
            status: "conflict",
            evidenceState: .init(availability: "unavailable"),
            reviewContext: .init(subject: .init(personID: "person-conflict", displayLabel: "Alex Chen")),
            items: [.init(evidenceRefs: [])],
            updatedAt: "2026-09-01T11:00:00Z"
        )
        let projection = URLMacRelationshipService.todayAttentionProjection(
            pursuits: [
                pursuit(id: "conflict", personID: "person-conflict"),
                pursuit(
                    id: "gap",
                    personID: "person-gap",
                    gaps: [gap("unavailable-gap", evidence: "unavailable")]
                ),
            ],
            proposals: [conflict],
            peopleByID: [
                "person-conflict": person("person-conflict", "Alex Chen"),
                "person-gap": person("person-gap", "Mia Rivera"),
            ],
            now: ISO8601DateFormatter().date(from: "2026-09-01T12:00:00Z")!
        )

        XCTAssertTrue(projection.items[0].unresolved.contains("conflicts"))
        XCTAssertEqual(projection.items[0].evidenceAvailability, "unavailable")
        XCTAssertNil(projection.items[1].dueAt, "A date-only Pursuit target must not invent an exact time.")
        XCTAssertEqual(projection.items[1].dueFallback, "Pursuit target 2026-09-10")
        XCTAssertEqual(projection.items[1].owner, "Recruiter to assign")
    }

    func testConsequencePreflightCarriesOnlyOpenCanonicalWorkWithoutInventingAuthority() {
        let source = pursuit(
            id: "preflight",
            personID: "person-preflight",
            gaps: [gap("policy-gap", evidence: "partial")],
            actions: [
                action("open-action", dueAt: "2026-09-02T09:00:00Z"),
                action("completed-action", dueAt: "2026-09-01T09:00:00Z", status: "completed"),
            ]
        )

        let preflight = URLMacRelationshipService.consequencePreflight(for: source)

        XCTAssertEqual(preflight.milestone, "Decision")
        XCTAssertEqual(preflight.targetDate, "2026-09-10")
        XCTAssertEqual(preflight.evidenceAvailability, "available")
        XCTAssertEqual(preflight.openActions.map(\.id), ["open-action"])
        XCTAssertEqual(preflight.openActions.first?.owner, "Recruiter Owner")
        XCTAssertEqual(preflight.openGaps.map(\.id), ["policy-gap"])
        XCTAssertEqual(preflight.openGaps.first?.evidenceAvailability, "partial")
    }

    private func person(_ id: String, _ label: String) -> PersonDTO {
        PersonDTO(
            id: id,
            displayLabel: label,
            contexts: [.init(id: "context-\(id)", displayLabel: "Candidate relationship")]
        )
    }

    private func pursuit(
        id: String,
        personID: String,
        gaps: [PursuitGapDTO] = [],
        actions: [PursuitActionDTO] = []
    ) -> PursuitDTO {
        PursuitDTO(
            id: id,
            workspaceID: "workspace",
            title: "Pursuit \(id)",
            targetOutcome: "Reach a reviewed decision",
            targetDate: "2026-09-10",
            status: "active",
            milestone: "Decision",
            milestoneAuthority: .init(evidenceState: .init(availability: "available")),
            revision: 1,
            roles: [.init(
                subjectRef: .init(type: "person", id: personID),
                roleType: "candidate",
                status: "active",
                confidence: "confirmed"
            )],
            gaps: gaps,
            actions: actions
        )
    }

    private func action(
        _ id: String,
        dueAt: String,
        status: String = "in_progress"
    ) -> PursuitActionDTO {
        PursuitActionDTO(
            id: id,
            gapID: nil,
            title: "Complete \(id)",
            ownerDisplayName: "Recruiter Owner",
            status: status,
            dueAt: dueAt
        )
    }

    private func gap(_ id: String, evidence: String = "available") -> PursuitGapDTO {
        PursuitGapDTO(
            id: id,
            title: "Resolve \(id)",
            status: "open",
            basis: .init(evidenceState: .init(availability: evidence)),
            closeCondition: "Confirm the exact dependency"
        )
    }
}
