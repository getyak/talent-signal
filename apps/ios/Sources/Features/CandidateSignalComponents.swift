import SwiftUI

struct BrandHeader: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 9) {
                SignalMark()
                Text("TALENT SIGNAL")
                    .font(.caption.weight(.bold))
                    .tracking(1.4)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Review what changed.")
                    .font(.system(.largeTitle, design: .rounded).weight(.bold))
                    .foregroundStyle(Color.tsInk)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Evidence first. One human decision at a time.")
                    .font(.body)
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("brand-header")
    }
}

struct SourceNotice: View {
    let text: String

    var body: some View {
        Label(text, systemImage: "testtube.2")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Color.tsMutedInk)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.vertical, 10)
            .padding(.horizontal, 12)
            .background(Color.tsSurfaceMuted, in: RoundedRectangle(cornerRadius: 12))
            .accessibilityIdentifier("source-notice")
    }
}

struct FixtureReviewView: View {
    let session: ReviewSession
    let sourceNotice: String
    let dynamicTypeSize: DynamicTypeSize
    let onConfirm: (String) -> Void
    let onEdit: (String, String) -> Void
    let onDismiss: (String) -> Void
    let onPreviewAction: () -> Void
    let onFinishWithoutAction: () -> Void
    let onCancelReview: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            fixtureIdentity
            observedEvidence

            if let requestedOutput = session.fixture.context.requestedOutput {
                BoundaryRefusal(requestedOutput: requestedOutput)
            }

            if session.hasUnresolvedIdentity {
                IdentityAmbiguity(context: session.fixture.context)
            }

            if !session.facts.isEmpty {
                proposedFacts
            } else if session.fixture.expected.disposition != .block {
                NoProposedFacts(disposition: session.fixture.expected.disposition)
            }

            reviewDecision

            Button("Cancel this local review", action: onCancelReview)
                .buttonStyle(TSTextButtonStyle())
                .accessibilityIdentifier("cancel-review")
        }
    }

    private var fixtureIdentity: some View {
        VStack(alignment: .leading, spacing: 14) {
            SourceNotice(
                text: "\(sourceNotice) · \(session.fixture.id)"
            )
            .accessibilityIdentifier("fixture-banner")

            SectionLabel(text: session.fixture.expected.disposition.title)

            Text(session.fixture.context.candidate ?? "Identity not bound")
                .font(.system(.title, design: .rounded).weight(.bold))
                .foregroundStyle(Color.tsInk)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("candidate-name")

            Text(session.fixture.context.assignment ?? "Assignment not bound")
                .font(.body)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)

            HStack(alignment: .top, spacing: 8) {
                Image(systemName: "clock")
                Text("Captured \(session.fixture.context.capturedAt) · \(session.fixture.context.sourceTimezone ?? "timezone unknown")")
                    .fixedSize(horizontal: false, vertical: true)
            }
            .font(.caption)
            .foregroundStyle(Color.tsMutedInk)
            .accessibilityElement(children: .combine)
        }
        .tsCard()
    }

    private var observedEvidence: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionLabel(text: "Observed evidence")

            ForEach(session.fixture.messages) { message in
                VStack(alignment: .leading, spacing: 7) {
                    Text("\(message.speaker.capitalized) · \(message.id)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.tsMutedInk)
                    Text("“\(message.text)”")
                        .font(.body)
                        .foregroundStyle(Color.tsInk)
                        .fixedSize(horizontal: false, vertical: true)
                        .textSelection(.enabled)
                }
                .padding(.vertical, 4)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Observed message \(message.id) by \(message.speaker): \(message.text)")
                .accessibilityIdentifier("message-\(message.id)")
            }
        }
        .tsCard()
    }

    private var proposedFacts: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionLabel(text: "Proposed facts")

            Text("Each item starts as a proposal. Review its exact evidence before confirming, editing, or dismissing it.")
                .font(.subheadline)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)

            ForEach(Array(session.facts.enumerated()), id: \.element.id) { index, fact in
                FactReviewCard(
                    fact: fact,
                    priorValue: session.fixture.context.priorState?[fact.assertion.field],
                    dynamicTypeSize: dynamicTypeSize,
                    onConfirm: { onConfirm(fact.id) },
                    onEdit: { onEdit(fact.id, $0) },
                    onDismiss: { onDismiss(fact.id) }
                )

                if index < session.facts.count - 1 {
                    Divider()
                }
            }
        }
        .tsCard()
    }

    @ViewBuilder
    private var reviewDecision: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionLabel(text: "Review decision")

            if !session.allFactsReviewed {
                Text("Review every proposed fact before choosing what happens next.")
                    .font(.body)
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("review-incomplete")
            } else if session.canPreviewAction {
                Text("Fact review is complete. The proposed action still needs its own decision.")
                    .font(.body)
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)

                Button("Review separate action", action: onPreviewAction)
                    .buttonStyle(TSPrimaryButtonStyle())
                    .accessibilityIdentifier("review-action")
            } else {
                outcomeExplanation

                Button("Finish without an action", action: onFinishWithoutAction)
                    .buttonStyle(TSPrimaryButtonStyle())
                    .accessibilityIdentifier("finish-without-action")
            }
        }
        .tsCard()
    }

    @ViewBuilder
    private var outcomeExplanation: some View {
        switch session.fixture.expected.disposition {
        case .noAction:
            Text("The fixture contains no justified next action. Friendly language and thanks are not engagement signals.")
        case .clarify:
            Text("Identity, date, or timezone remains ambiguous. No candidate state or deadline-dependent action can be created.")
        case .block:
            Text("The requested fit score is outside the product boundary. No candidate assessment will be produced.")
        case .proposeAction:
            Text("No proposed fact remains accepted, so the action proposal is no longer supported.")
        }
    }
}

struct FactReviewCard: View {
    let fact: ReviewedFact
    let priorValue: String?
    let dynamicTypeSize: DynamicTypeSize
    let onConfirm: () -> Void
    let onEdit: (String) -> Void
    let onDismiss: () -> Void

    @State private var editing = false
    @State private var draft = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(fact.assertion.label)
                    .font(.headline)
                    .foregroundStyle(Color.tsInk)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("fact-card-\(fact.id)")
                Spacer(minLength: 8)
                Text(fact.assertion.status.title)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(stateColor)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let priorValue {
                StateDiffRow(label: "Before", value: priorValue)
                StateDiffRow(label: "Proposed after", value: fact.assertion.value)
            } else {
                Text(fact.assertion.value)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(Color.tsInk)
                    .fixedSize(horizontal: false, vertical: true)
            }

            VStack(alignment: .leading, spacing: 5) {
                Text("Exact evidence · \(fact.assertion.evidenceMessageID)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.tsMutedInk)
                Text("“\(fact.assertion.evidenceQuote)”")
                    .font(.body)
                    .foregroundStyle(Color.tsInk)
                    .fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
            }
            .padding(12)
            .background(Color.tsEvidence, in: RoundedRectangle(cornerRadius: 12))
            .accessibilityElement(children: .combine)

            if fact.assertion.status == .ambiguous {
                Label(
                    "Confirmation is unavailable until the date and timezone are clarified through Edit.",
                    systemImage: "questionmark.diamond"
                )
                .font(.subheadline)
                .foregroundStyle(Color.tsWarning)
                .fixedSize(horizontal: false, vertical: true)
            }

            if editing {
                VStack(alignment: .leading, spacing: 10) {
                    TextField("Corrected value", text: $draft, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                        .accessibilityLabel("Edited value for \(fact.assertion.label)")
                        .accessibilityIdentifier("fact-edit-field-\(fact.id)")

                    responsiveActions(
                        primary: Button("Save edit") {
                            onEdit(draft)
                            editing = false
                        }
                        .buttonStyle(TSPrimaryButtonStyle())
                        .accessibilityIdentifier("fact-save-\(fact.id)"),
                        secondary: Button("Cancel edit") {
                            editing = false
                        }
                        .buttonStyle(TSSecondaryButtonStyle())
                    )
                }
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    Button("Confirm") {
                        onConfirm()
                    }
                    .buttonStyle(TSPrimaryButtonStyle())
                    .disabled(fact.assertion.status == .ambiguous)
                    .accessibilityIdentifier("fact-confirm-\(fact.id)")

                    if dynamicTypeSize.isAccessibilitySize {
                        VStack(alignment: .leading, spacing: 10) {
                            editButton
                            dismissButton
                        }
                    } else {
                        HStack(spacing: 10) {
                            editButton
                            dismissButton
                        }
                    }
                }
            }

            Label(fact.decision.title, systemImage: decisionIcon)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(decisionColor)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("fact-decision-\(fact.id)")
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private func responsiveActions<Primary: View, Secondary: View>(
        primary: Primary,
        secondary: Secondary
    ) -> some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 10) {
                primary
                secondary
            }
        } else {
            HStack(spacing: 10) {
                primary
                secondary
            }
        }
    }

    private var stateColor: Color {
        fact.assertion.status == .proposed ? .tsMutedInk : .tsWarning
    }

    private var decisionColor: Color {
        switch fact.decision {
        case .pending:
            return .tsMutedInk
        case .confirmed, .edited:
            return .tsConfirmed
        case .dismissed:
            return .tsMutedInk
        }
    }

    private var decisionIcon: String {
        switch fact.decision {
        case .pending:
            return "circle.dashed"
        case .confirmed:
            return "checkmark.circle"
        case .edited:
            return "pencil.circle"
        case .dismissed:
            return "minus.circle"
        }
    }

    private var editButton: some View {
        Button("Edit") {
            draft = fact.acceptedValue ?? fact.assertion.value
            editing = true
        }
        .buttonStyle(TSSecondaryButtonStyle())
        .accessibilityIdentifier("fact-edit-\(fact.id)")
    }

    private var dismissButton: some View {
        Button("Dismiss", role: .destructive, action: onDismiss)
            .buttonStyle(TSSecondaryButtonStyle())
            .accessibilityIdentifier("fact-dismiss-\(fact.id)")
    }
}

struct ActionPreviewView: View {
    let session: ReviewSession
    let sourceNotice: String
    let dynamicTypeSize: DynamicTypeSize
    let onReturnToReview: () -> Void
    let onCompleteHandoff: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            SourceNotice(
                text: "\(sourceNotice) · \(session.fixture.id) · action preview"
            )

            if let preview = session.preview, session.isPreviewCurrent {
                VStack(alignment: .leading, spacing: 18) {
                    SectionLabel(text: "Separate action decision")
                    Text("Prepare one question—locally")
                        .font(.system(.title, design: .rounded).weight(.bold))
                        .foregroundStyle(Color.tsInk)
                        .fixedSize(horizontal: false, vertical: true)

                    PreviewField(label: "Target", value: preview.action.target)
                    PreviewField(label: "Owner", value: preview.action.owner)
                    PreviewField(label: "Due", value: preview.action.due)
                    PreviewField(label: "Reason", value: preview.action.reason)
                    PreviewField(label: "Exact effect", value: preview.exactEffect)

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Supporting evidence")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Color.tsMutedInk)
                        ForEach(preview.action.evidenceMessageIDs, id: \.self) { messageID in
                            if let message = session.fixture.messages.first(where: { $0.id == messageID }) {
                                Text("“\(message.text)”")
                                    .font(.body)
                                    .foregroundStyle(Color.tsInk)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                    .padding(12)
                    .background(Color.tsEvidence, in: RoundedRectangle(cornerRadius: 12))
                }
                .tsCard()

                if dynamicTypeSize.isAccessibilitySize {
                    VStack(alignment: .leading, spacing: 10) {
                        completeButton
                        backButton
                    }
                } else {
                    VStack(alignment: .leading, spacing: 10) {
                        completeButton
                        backButton
                    }
                }
            } else {
                StateMessage(
                    eyebrow: "Stale action",
                    icon: "clock.badge.exclamationmark",
                    title: "This preview is no longer current",
                    detail: "The reviewed facts changed after this preview was created. Return to fact review and generate a fresh, exact-effect preview."
                ) {
                    Button("Return to fact review", action: onReturnToReview)
                        .buttonStyle(TSPrimaryButtonStyle())
                        .accessibilityIdentifier("refresh-stale-preview")
                }
            }
        }
    }

    private var completeButton: some View {
        Button("Keep as local handoff", action: onCompleteHandoff)
            .buttonStyle(TSPrimaryButtonStyle())
            .accessibilityIdentifier("complete-handoff")
            .accessibilityHint("Records only a local demo outcome. It does not perform an external action.")
    }

    private var backButton: some View {
        Button("Back to fact review", action: onReturnToReview)
            .buttonStyle(TSSecondaryButtonStyle())
            .accessibilityIdentifier("back-to-review")
    }
}

struct StateDiffRow: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.tsMutedInk)
            Text(value)
                .font(.body)
                .foregroundStyle(Color.tsInk)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }
}

struct PreviewField: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label.uppercased())
                .font(.caption.weight(.bold))
                .tracking(0.8)
                .foregroundStyle(Color.tsMutedInk)
            Text(value)
                .font(.body)
                .foregroundStyle(Color.tsInk)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }
}

struct IdentityAmbiguity: View {
    let context: FixtureContext

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionLabel(text: "Identity unresolved")
            Text("The screenshot cannot be safely bound to either candidate.")
                .font(.headline)
                .foregroundStyle(Color.tsInk)
                .fixedSize(horizontal: false, vertical: true)

            ForEach(context.candidateOptions ?? [], id: \.self) { option in
                Label(option, systemImage: "person.crop.circle.badge.questionmark")
                    .font(.body)
                    .foregroundStyle(Color.tsMutedInk)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Text("The review stays unbound. No candidate fact or deadline-dependent action can be created from this evidence.")
                .font(.subheadline)
                .foregroundStyle(Color.tsWarning)
                .fixedSize(horizontal: false, vertical: true)
        }
        .tsCard()
        .accessibilityIdentifier("identity-ambiguity")
    }
}

struct BoundaryRefusal: View {
    let requestedOutput: String

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionLabel(text: "Requested output")
            Text("“\(requestedOutput)”")
                .font(.body)
                .foregroundStyle(Color.tsInk)
                .fixedSize(horizontal: false, vertical: true)
            Label(
                "Refused: conversation tone, response speed, and shared interests must not become culture-fit, quality, personality, or acceptance scores.",
                systemImage: "hand.raised"
            )
            .font(.headline)
            .foregroundStyle(Color.tsWarning)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("fit-refusal-message")
        }
        .tsCard()
    }
}

struct NoProposedFacts: View {
    let disposition: FixtureDisposition

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionLabel(text: "Proposed facts")
            Text(disposition == .noAction ? "No decision-relevant change is supported by the evidence." : "No fact can be proposed while the required context remains unresolved.")
                .font(.body)
                .foregroundStyle(Color.tsInk)
                .fixedSize(horizontal: false, vertical: true)
        }
        .tsCard()
        .accessibilityIdentifier("no-proposed-facts")
    }
}

struct StateMessage<Actions: View>: View {
    let eyebrow: String
    let icon: String
    let title: String
    let detail: String
    @ViewBuilder let actions: Actions

    init(
        eyebrow: String,
        icon: String,
        title: String,
        detail: String,
        @ViewBuilder actions: () -> Actions
    ) {
        self.eyebrow = eyebrow
        self.icon = icon
        self.title = title
        self.detail = detail
        self.actions = actions()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label(eyebrow.uppercased(), systemImage: icon)
                .font(.caption.weight(.bold))
                .tracking(1)
                .foregroundStyle(Color.tsVermilion)
            Text(title)
                .font(.system(.title2, design: .rounded).weight(.bold))
                .foregroundStyle(Color.tsInk)
                .fixedSize(horizontal: false, vertical: true)
            Text(detail)
                .font(.body)
                .foregroundStyle(Color.tsMutedInk)
                .fixedSize(horizontal: false, vertical: true)
            actions
        }
        .tsCard()
    }
}

struct PrivacyBoundaryNote: View {
    var body: some View {
        Label {
            Text("Evidence, confirmed local state, interpretation, action preview, and outcome remain separate. Fixture review never authorizes an external write.")
                .fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: "lock.shield")
        }
        .font(.caption)
        .foregroundStyle(Color.tsMutedInk)
        .padding(.horizontal, 4)
        .accessibilityIdentifier("privacy-boundary")
    }
}

struct SectionLabel: View {
    let text: String

    var body: some View {
        Text(text.uppercased())
            .font(.caption.weight(.bold))
            .tracking(1.1)
            .foregroundStyle(Color.tsMutedInk)
            .fixedSize(horizontal: false, vertical: true)
    }
}

private struct SignalMark: View {
    var body: some View {
        HStack(alignment: .bottom, spacing: 3) {
            Capsule().fill(Color.tsInk).frame(width: 4, height: 9)
            Capsule().fill(Color.tsInk).frame(width: 4, height: 18)
            Capsule().fill(Color.tsVermilion).frame(width: 4, height: 13)
        }
        .frame(width: 22, height: 20)
        .accessibilityHidden(true)
    }
}

struct TSPrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(Color.white)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity, minHeight: 44)
            .padding(.horizontal, 16)
            .background(
                Color.tsPrimaryFill.opacity(
                    isEnabled ? (configuration.isPressed ? 0.78 : 1) : 0.38
                ),
                in: RoundedRectangle(cornerRadius: 14, style: .continuous)
            )
            .opacity(configuration.isPressed ? 0.86 : 1)
    }
}

struct TSSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(Color.tsInk)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity, minHeight: 44)
            .padding(.horizontal, 16)
            .background(
                Color.tsSurfaceMuted.opacity(configuration.isPressed ? 0.7 : 1),
                in: RoundedRectangle(cornerRadius: 14, style: .continuous)
            )
    }
}

struct TSTextButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .foregroundStyle(Color.tsMutedInk)
            .frame(minHeight: 44)
            .opacity(configuration.isPressed ? 0.65 : 1)
    }
}

extension View {
    func tsCard() -> some View {
        padding(20)
            .background(Color.tsSurface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(Color.tsLine, lineWidth: 1)
            }
    }
}

extension Color {
    static let tsCanvas = Color(
        uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0.075, green: 0.073, blue: 0.067, alpha: 1)
                : UIColor(red: 0.949, green: 0.945, blue: 0.929, alpha: 1)
        }
    )
    static let tsSurface = Color(
        uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0.12, green: 0.116, blue: 0.106, alpha: 1)
                : UIColor(red: 0.98, green: 0.976, blue: 0.961, alpha: 1)
        }
    )
    static let tsSurfaceMuted = Color(
        uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0.17, green: 0.163, blue: 0.148, alpha: 1)
                : UIColor(red: 0.922, green: 0.914, blue: 0.89, alpha: 1)
        }
    )
    static let tsEvidence = Color(
        uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0.055, green: 0.053, blue: 0.048, alpha: 1)
                : UIColor(red: 0.99, green: 0.988, blue: 0.98, alpha: 1)
        }
    )
    static let tsInk = Color(
        uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0.95, green: 0.945, blue: 0.92, alpha: 1)
                : UIColor(red: 0.094, green: 0.094, blue: 0.086, alpha: 1)
        }
    )
    static let tsMutedInk = Color(
        uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0.72, green: 0.70, blue: 0.65, alpha: 1)
                : UIColor(red: 0.36, green: 0.35, blue: 0.32, alpha: 1)
        }
    )
    static let tsVermilion = Color(
        uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0.98, green: 0.43, blue: 0.31, alpha: 1)
                : UIColor(red: 0.78, green: 0.22, blue: 0.15, alpha: 1)
        }
    )
    static let tsPrimaryFill = Color(
        uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0.66, green: 0.17, blue: 0.12, alpha: 1)
                : UIColor(red: 0.72, green: 0.16, blue: 0.11, alpha: 1)
        }
    )
    static let tsWarning = Color(
        uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0.96, green: 0.66, blue: 0.32, alpha: 1)
                : UIColor(red: 0.55, green: 0.31, blue: 0.06, alpha: 1)
        }
    )
    static let tsConfirmed = Color(
        uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0.50, green: 0.82, blue: 0.61, alpha: 1)
                : UIColor(red: 0.13, green: 0.42, blue: 0.24, alpha: 1)
        }
    )
    static let tsLine = Color.tsInk.opacity(0.14)
}
