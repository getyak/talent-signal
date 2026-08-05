import XCTest
@testable import TalentSignal

final class HeroLoopTests: XCTestCase {
    func testHeroLoopProducesContactUpdateAndMeetingCardsAfterFactReview() throws {
        let fixture = HeroLoopCatalog.alexDecision(
            recruiterContext: HeroLoopCatalog.defaultRecruiterContext
        )
        var review = ReviewSession(fixture: fixture)

        XCTAssertEqual(fixture.id, "TS-HERO-01")
        XCTAssertFalse(review.canPreviewAction)

        for fact in review.facts {
            XCTAssertTrue(review.confirm(factID: fact.id))
        }

        let preview = try XCTUnwrap(review.makeActionPreview())
        XCTAssertEqual(
            preview.cards.map(\.card.type),
            [.updateContact, .createMeeting]
        )
        XCTAssertEqual(
            preview.cards.first?.card.fields.map(\.key),
            [
                "competing_process",
                "decision_deadline",
                "work_mode_preference"
            ]
        )
        XCTAssertEqual(
            preview.cards.last?.card.fields.first?.after,
            "2026-08-06 15:00 Asia/Singapore · 30-minute video call"
        )
        XCTAssertNil(review.momentumInsight)
    }

    func testInsightUnlocksOnlyAfterEveryActionCardHasDecision() throws {
        let fixture = HeroLoopCatalog.alexDecision(
            recruiterContext: HeroLoopCatalog.defaultRecruiterContext
        )
        var review = ReviewSession(fixture: fixture)
        for fact in review.facts {
            XCTAssertTrue(review.confirm(factID: fact.id))
        }
        let preview = try XCTUnwrap(review.makeActionPreview())

        XCTAssertFalse(review.allActionCardsReviewed)
        XCTAssertNil(review.momentumInsight)
        XCTAssertTrue(review.approveAction(cardID: preview.cards[0].id))
        XCTAssertNil(review.momentumInsight)
        XCTAssertTrue(review.approveAction(cardID: preview.cards[1].id))

        let insight = try XCTUnwrap(review.momentumInsight)
        XCTAssertEqual(insight.verdict, .atRisk)
        XCTAssertTrue(insight.whyNow.contains("Friday decision deadline"))
        XCTAssertTrue(insight.relationshipContext.contains("remote within APAC"))
        XCTAssertTrue(insight.nextStep.contains("Thursday invite"))
        XCTAssertTrue(insight.evidenceQuotes.contains("need to decide Friday"))
    }

    func testDismissingMeetingChangesInsightWithoutInventingExecution() throws {
        let fixture = HeroLoopCatalog.alexDecision(
            recruiterContext: HeroLoopCatalog.defaultRecruiterContext
        )
        var review = ReviewSession(fixture: fixture)
        for fact in review.facts {
            XCTAssertTrue(review.confirm(factID: fact.id))
        }
        let preview = try XCTUnwrap(review.makeActionPreview())

        XCTAssertTrue(review.approveAction(cardID: preview.cards[0].id))
        XCTAssertTrue(review.dismissAction(cardID: preview.cards[1].id))

        let insight = try XCTUnwrap(review.momentumInsight)
        XCTAssertEqual(insight.verdict, .atRisk)
        XCTAssertTrue(insight.nextStep.contains("Agree the next live conversation"))
        XCTAssertEqual(review.approvedActionCards.map(\.card.type), [.updateContact])
        XCTAssertTrue(
            preview.cards.allSatisfy {
                $0.card.exactEffect.contains("does not write")
            }
        )
    }

    func testExplicitUnmatchedContactCanProduceCreateContactCard() throws {
        let fixture = FixtureCase(
            id: "TS-HERO-CONTACT",
            title: "New contact with explicit channel",
            context: FixtureContext(
                capturedAt: "2026-08-05T12:00:00+08:00",
                sourceTimezone: "Asia/Singapore",
                candidate: nil,
                assignment: "VP Product",
                notes: "No matching contact was found.",
                priorState: nil,
                candidateOptions: nil,
                requestedOutput: nil
            ),
            messages: [
                FixtureMessage(
                    id: "contact-m1",
                    speaker: "candidate",
                    text: "I am Maya Ortiz. You can reach me at maya@example.test."
                )
            ],
            expected: FixtureExpected(
                disposition: .proposeAction,
                assertions: [
                    FixtureAssertion(
                        field: "contact_name",
                        status: .proposed,
                        value: "Maya Ortiz",
                        evidenceMessageID: "contact-m1",
                        evidenceQuote: "I am Maya Ortiz"
                    ),
                    FixtureAssertion(
                        field: "email",
                        status: .proposed,
                        value: "maya@example.test",
                        evidenceMessageID: "contact-m1",
                        evidenceQuote: "maya@example.test"
                    )
                ],
                action: FixtureAction(
                    type: "review_action_cards",
                    owner: "recruiter",
                    target: "Maya Ortiz",
                    reason: "Review the explicit contact details.",
                    due: "when useful",
                    evidenceMessageIDs: ["contact-m1"]
                ),
                mustNot: ["create a contact without confirmation"]
            )
        )
        var review = ReviewSession(fixture: fixture)
        for fact in review.facts {
            XCTAssertTrue(review.confirm(factID: fact.id))
        }

        let preview = try XCTUnwrap(review.makeActionPreview())
        XCTAssertEqual(preview.cards.count, 1)
        XCTAssertEqual(preview.cards.first?.card.type, .createContact)
        XCTAssertEqual(preview.cards.first?.card.target, "Maya Ortiz")
        XCTAssertEqual(
            preview.cards.first?.card.fields.map(\.key),
            ["contact_name", "email"]
        )
    }

    func testAvailabilityWithoutExplicitMeetingNeverCreatesMeetingCard() throws {
        let fixture = FixtureCase(
            id: "TS-HERO-AVAILABILITY",
            title: "Availability is not meeting consent",
            context: FixtureContext(
                capturedAt: "2026-08-05T15:00:00+08:00",
                sourceTimezone: "Europe/London",
                candidate: "Amir Okafor",
                assignment: "Director of Engineering",
                notes: nil,
                priorState: nil,
                candidateOptions: nil,
                requestedOutput: nil
            ),
            messages: [
                FixtureMessage(
                    id: "availability-m1",
                    speaker: "candidate",
                    text: "Tuesday afternoon is open on my side."
                )
            ],
            expected: FixtureExpected(
                disposition: .proposeAction,
                assertions: [
                    FixtureAssertion(
                        field: "availability",
                        status: .proposed,
                        value: "Tuesday afternoon",
                        evidenceMessageID: "availability-m1",
                        evidenceQuote: "Tuesday afternoon is open"
                    )
                ],
                action: FixtureAction(
                    type: "review_action_cards",
                    owner: "recruiter",
                    target: "candidate meeting clarification",
                    reason: "Clarify the exact date and timezone.",
                    due: "before scheduling",
                    evidenceMessageIDs: ["availability-m1"]
                ),
                mustNot: ["create a calendar event"]
            )
        )
        var review = ReviewSession(fixture: fixture)
        XCTAssertTrue(review.confirm(factID: "availability-availability-m1"))

        let preview = try XCTUnwrap(review.makeActionPreview())
        XCTAssertFalse(preview.cards.contains { $0.card.type == .createMeeting })
    }
}
