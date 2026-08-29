import Foundation

enum LoopActionType: String, Equatable {
    case createContact = "create_contact"
    case updateContact = "update_contact"
    case createMeeting = "create_meeting"

    var title: String {
        switch self {
        case .createContact:
            return "Create contact"
        case .updateContact:
            return "Update contact"
        case .createMeeting:
            return "Create meeting"
        }
    }

    var systemImage: String {
        switch self {
        case .createContact:
            return "person.crop.circle.badge.plus"
        case .updateContact:
            return "person.crop.circle.badge.checkmark"
        case .createMeeting:
            return "calendar.badge.plus"
        }
    }
}

struct LoopActionField: Identifiable, Equatable {
    let key: String
    let label: String
    let before: String?
    let after: String

    var id: String { key }
}

struct LoopActionCard: Identifiable, Equatable {
    let id: String
    let type: LoopActionType
    let target: String
    let reason: String
    let fields: [LoopActionField]
    let evidenceQuotes: [String]
    let exactEffect: String
}

enum LoopActionDecision: String, Equatable {
    case pending
    case approved
    case dismissed

    var title: String {
        switch self {
        case .pending:
            return "Awaiting decision"
        case .approved:
            return "Approved locally"
        case .dismissed:
            return "Dismissed"
        }
    }
}

struct ReviewedLoopAction: Identifiable, Equatable {
    let card: LoopActionCard
    var decision: LoopActionDecision = .pending

    var id: String { card.id }
}

enum MomentumVerdict: String, Equatable {
    case advance
    case resolveBlocker = "resolve_blocker"
    case atRisk = "at_risk"
    case wait

    var title: String {
        switch self {
        case .advance:
            return "Advance"
        case .resolveBlocker:
            return "Resolve blocker"
        case .atRisk:
            return "At risk"
        case .wait:
            return "Wait"
        }
    }
}

struct MomentumInsight: Equatable {
    let verdict: MomentumVerdict
    let whyNow: String
    let relationshipContext: String
    let nextStep: String
    let timeframe: String
    let evidenceQuotes: [String]
}

enum HeroLoopCatalog {
    static let id = "TS-HERO-01"
    static let defaultRecruiterContext =
        "Client confirmed this role can be remote within APAC. Alex last spoke with the hiring team 21 days ago."

    static func alexDecision(recruiterContext: String) -> FixtureCase {
        let trimmedContext = recruiterContext.trimmingCharacters(
            in: .whitespacesAndNewlines
        )

        return FixtureCase(
            id: id,
            title: "Offer deadline, remote requirement, and explicit meeting",
            context: FixtureContext(
                capturedAt: "2026-08-05T10:00:00+08:00",
                sourceTimezone: "Asia/Singapore",
                candidate: "Alex Chen",
                assignment: "Staff Product Designer",
                notes: trimmedContext.isEmpty ? defaultRecruiterContext : trimmedContext,
                priorState: [
                    "competing_process": "None recorded",
                    "decision_deadline": "Not recorded",
                    "work_mode_preference": "Hybrid preferred",
                    "next_meeting": "No meeting scheduled",
                    "last_contact": "2026-07-15"
                ],
                candidateOptions: nil,
                requestedOutput: nil
            ),
            messages: [
                FixtureMessage(
                    id: "hero-m1",
                    speaker: "candidate",
                    text: "I have another offer and need to decide Friday. Remote is important to me. Thursday at 3:00 PM Singapore time works—please send a 30-minute video invite."
                )
            ],
            expected: FixtureExpected(
                disposition: .proposeAction,
                assertions: [
                    FixtureAssertion(
                        field: "competing_process",
                        status: .proposed,
                        value: "another offer",
                        evidenceMessageID: "hero-m1",
                        evidenceQuote: "I have another offer"
                    ),
                    FixtureAssertion(
                        field: "decision_deadline",
                        status: .proposed,
                        value: "2026-08-07",
                        evidenceMessageID: "hero-m1",
                        evidenceQuote: "need to decide Friday"
                    ),
                    FixtureAssertion(
                        field: "work_mode_preference",
                        status: .proposed,
                        value: "remote is important",
                        evidenceMessageID: "hero-m1",
                        evidenceQuote: "Remote is important to me"
                    ),
                    FixtureAssertion(
                        field: "next_meeting",
                        status: .proposed,
                        value: "2026-08-06 15:00 Asia/Singapore · 30-minute video call",
                        evidenceMessageID: "hero-m1",
                        evidenceQuote: "Thursday at 3:00 PM Singapore time works—please send a 30-minute video invite"
                    )
                ],
                action: FixtureAction(
                    type: "review_action_cards",
                    owner: "recruiter",
                    target: "Alex Chen contact and calendar",
                    reason: "Carry the confirmed deadline and meeting into the recruiter's next move.",
                    due: "today",
                    evidenceMessageIDs: ["hero-m1"]
                ),
                mustNot: [
                    "predict acceptance",
                    "treat the recruiter note as a candidate statement",
                    "execute a contact or calendar write without exact approval"
                ]
            )
        )
    }

    static func newContact() -> FixtureCase {
        FixtureCase(
            id: "TS-HERO-NEW-CONTACT",
            title: "Explicit identity and contact channel",
            context: FixtureContext(
                capturedAt: "2026-08-29T09:41:00+08:00",
                sourceTimezone: "Asia/Shanghai",
                candidate: nil,
                assignment: "Product leadership search",
                notes: "Synthetic Agent lifecycle fixture. No matching contact was found.",
                priorState: nil,
                candidateOptions: nil,
                requestedOutput: nil
            ),
            messages: [
                FixtureMessage(
                    id: "new-contact-m1",
                    speaker: "candidate",
                    text: "I am Maya Ortiz. You can reach me at maya@example.test."
                ),
            ],
            expected: FixtureExpected(
                disposition: .proposeAction,
                assertions: [
                    FixtureAssertion(
                        field: "contact_name",
                        status: .proposed,
                        value: "Maya Ortiz",
                        evidenceMessageID: "new-contact-m1",
                        evidenceQuote: "I am Maya Ortiz"
                    ),
                    FixtureAssertion(
                        field: "email",
                        status: .proposed,
                        value: "maya@example.test",
                        evidenceMessageID: "new-contact-m1",
                        evidenceQuote: "maya@example.test"
                    ),
                ],
                action: FixtureAction(
                    type: "review_action_cards",
                    owner: "recruiter",
                    target: "Maya Ortiz contact",
                    reason: "Review the explicitly shared identity and contact channel.",
                    due: "when useful",
                    evidenceMessageIDs: ["new-contact-m1"]
                ),
                mustNot: [
                    "create a contact without fact review",
                    "send a message",
                    "bind identity from name alone",
                ]
            )
        )
    }
}

enum CandidateMomentumLoopEngine {
    static func actionCards(
        fixture: FixtureCase,
        acceptedFacts: [ReviewedFact]
    ) -> [ReviewedLoopAction] {
        guard fixture.id.hasPrefix("TS-HERO-") else {
            return []
        }

        let accepted = acceptedFacts.compactMap { fact -> (ReviewedFact, String)? in
            guard let value = fact.acceptedValue else { return nil }
            return (fact, value)
        }
        var cards: [ReviewedLoopAction] = []

        let contactFields = accepted.filter {
            !["next_meeting", "availability"].contains($0.0.assertion.field)
        }
        let contactName = accepted.first {
            $0.0.assertion.field == "contact_name"
        }?.1
        let hasContactChannel = accepted.contains {
            ["email", "phone"].contains($0.0.assertion.field)
        }

        if fixture.context.candidate == nil,
           let contactName,
           hasContactChannel {
            cards.append(
                ReviewedLoopAction(
                    card: LoopActionCard(
                        id: "create-contact",
                        type: .createContact,
                        target: contactName,
                        reason: "No existing contact is bound, and explicit contact details are available for review.",
                        fields: contactFields.map {
                            LoopActionField(
                                key: $0.0.assertion.field,
                                label: $0.0.assertion.label,
                                before: nil,
                                after: $0.1
                            )
                        },
                        evidenceQuotes: uniqueQuotes(from: contactFields),
                        exactEffect: "Prepare a new contact record for local review. This demo does not write to Contacts."
                    )
                )
            )
        } else if let candidate = fixture.context.candidate,
                  !contactFields.isEmpty {
            cards.append(
                ReviewedLoopAction(
                    card: LoopActionCard(
                        id: "update-contact",
                        type: .updateContact,
                        target: candidate,
                        reason: "Carry only recruiter-confirmed changes into the existing relationship record.",
                        fields: contactFields.map {
                            LoopActionField(
                                key: $0.0.assertion.field,
                                label: $0.0.assertion.label,
                                before: fixture.context.priorState?[$0.0.assertion.field],
                                after: $0.1
                            )
                        },
                        evidenceQuotes: uniqueQuotes(from: contactFields),
                        exactEffect: "Prepare this before-and-after patch for local review. This demo does not write to Contacts."
                    )
                )
            )
        }

        if let meeting = accepted.first(where: {
            $0.0.assertion.field == "next_meeting"
        }) {
            cards.append(
                ReviewedLoopAction(
                    card: LoopActionCard(
                        id: "create-meeting",
                        type: .createMeeting,
                        target: fixture.context.candidate ?? "Unbound candidate",
                        reason: "The candidate explicitly requested a specific invite.",
                        fields: [
                            LoopActionField(
                                key: "next_meeting",
                                label: "Meeting",
                                before: fixture.context.priorState?["next_meeting"],
                                after: meeting.1
                            )
                        ],
                        evidenceQuotes: [meeting.0.assertion.evidenceQuote],
                        exactEffect: "Prepare one 30-minute video meeting for local review. This demo does not write to Calendar."
                    )
                )
            )
        }

        return cards
    }

    static func insight(
        fixture: FixtureCase,
        acceptedFacts: [ReviewedFact],
        approvedActions: [ReviewedLoopAction]
    ) -> MomentumInsight {
        let values = Dictionary(
            uniqueKeysWithValues: acceptedFacts.compactMap { fact in
                fact.acceptedValue.map { (fact.assertion.field, $0) }
            }
        )
        let approvedTypes = Set(approvedActions.map(\.card.type))
        let evidence = acceptedFacts.compactMap { fact in
            fact.acceptedValue == nil ? nil : fact.assertion.evidenceQuote
        }

        if values["decision_deadline"] != nil,
           values["competing_process"] != nil {
            let meetingReady = approvedTypes.contains(.createMeeting)
            return MomentumInsight(
                verdict: .atRisk,
                whyNow: "Alex has another offer and a confirmed Friday decision deadline.",
                relationshipContext: fixture.context.notes
                    ?? "No additional recruiter context was supplied.",
                nextStep: meetingReady
                    ? "Send the approved Thursday invite today and use that conversation to close only the remaining decision questions."
                    : "Agree the next live conversation today; the deadline is too close for a generic follow-up.",
                timeframe: "Today, before the decision window narrows",
                evidenceQuotes: Array(Set(evidence)).sorted()
            )
        }

        if values["next_meeting"] != nil {
            return MomentumInsight(
                verdict: .advance,
                whyNow: "A concrete next meeting is confirmed.",
                relationshipContext: fixture.context.notes
                    ?? "No additional recruiter context was supplied.",
                nextStep: approvedTypes.contains(.createMeeting)
                    ? "Carry the approved meeting into the recruiter's calendar workflow."
                    : "Keep the meeting manual and verify that both sides have the same time and timezone.",
                timeframe: "Before the proposed meeting",
                evidenceQuotes: Array(Set(evidence)).sorted()
            )
        }

        return MomentumInsight(
            verdict: acceptedFacts.isEmpty ? .wait : .resolveBlocker,
            whyNow: acceptedFacts.isEmpty
                ? "No confirmed change requires action."
                : "Confirmed context exists, but no complete next move is approved.",
            relationshipContext: fixture.context.notes
                ?? "No additional recruiter context was supplied.",
            nextStep: acceptedFacts.isEmpty
                ? "Keep the source as context and avoid manufacturing work."
                : "Resolve the smallest missing dependency before creating another task.",
            timeframe: acceptedFacts.isEmpty ? "No deadline" : "Within one business day",
            evidenceQuotes: Array(Set(evidence)).sorted()
        )
    }

    private static func uniqueQuotes(
        from facts: [(ReviewedFact, String)]
    ) -> [String] {
        Array(Set(facts.map { $0.0.assertion.evidenceQuote })).sorted()
    }
}
