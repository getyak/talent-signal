import SwiftUI

struct TodayView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 26) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 6) {
                        SectionLabel(text: "Today")
                        Text("Keep the next follow-up moving")
                            .font(.system(size: 28, weight: .semibold))
                            .foregroundStyle(TSBrand.ink)
                        Text("Start with one conversation. Save or execute only after the consequence is clear.")
                            .foregroundStyle(TSBrand.secondaryInk)
                    }
                    Spacer()
                    Button("Review a conversation", systemImage: "text.quote") {
                        openWindow(id: "quick-panel")
                    }
                    .buttonStyle(TSPrimaryButtonStyle())
                    .accessibilityIdentifier("today.openQuickPanel")
                }

                if model.provisionalInsight != nil {
                    companionCard
                }

                if !model.todayAttention.items.isEmpty {
                    canonicalAttentionSection
                }

                if model.provisionalInsight == nil, model.todayAttention.items.isEmpty {
                    companionCard
                }

                if model.hasActionCenterWork {
                    attentionCard
                }

                if case .saved(let receipt) = model.reminderOperationState {
                    verifiedReminderCard(receipt)
                }
            }
            .frame(maxWidth: 1_060, alignment: .leading)
            .padding(.horizontal, 48)
            .padding(.vertical, 38)
            .frame(maxWidth: .infinity, alignment: .top)
        }
        .navigationTitle("Today")
        .background(TSBrand.canvas)
        .accessibilityIdentifier("today.home")
    }

    private var canonicalAttentionSection: some View {
        let lead = model.provisionalInsight == nil ? model.todayAttention.items.first : nil
        let continuations = lead == nil
            ? model.todayAttention.items
            : Array(model.todayAttention.items.dropFirst())

        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 3) {
                    SectionLabel(text: "Relationship follow-ups")
                    Text(model.provisionalInsight == nil ? "What needs work now" : "What else needs work now")
                        .font(.title3.weight(.semibold))
                }
                Spacer()
                if model.todayAttention.noActionCount > 0 {
                    Text("\(model.todayAttention.noActionCount) active search\(model.todayAttention.noActionCount == 1 ? "" : "es") need no action")
                        .font(.caption)
                        .foregroundStyle(TSBrand.secondaryInk)
                }
            }

            if let lead {
                canonicalAttentionLead(lead)
            }

            if !continuations.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(continuations.enumerated()), id: \.element.id) { index, item in
                        canonicalAttentionContinuation(item)
                        if index < continuations.count - 1 {
                            Divider()
                                .padding(.horizontal, 16)
                        }
                    }
                }
                .tsSurface()
            }
        }
        .accessibilityIdentifier("today.canonicalAttention")
    }

    private func canonicalAttentionLead(_ item: TodayAttentionItem) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    SectionLabel(text: item.personLabel ?? item.pursuitTitle)
                    Text(item.whyNow)
                        .font(.headline)
                        .foregroundStyle(TSBrand.ink)
                }
                Spacer()
                TSStatusBadge(
                    title: canonicalKindTitle(item.kind),
                    systemImage: canonicalKindIcon(item.kind),
                    isAttention: true
                )
            }

            Grid(alignment: .leading, horizontalSpacing: 24, verticalSpacing: 8) {
                GridRow {
                    todayLabel("Unresolved")
                    Text(item.unresolved)
                }
                GridRow {
                    todayLabel("Owner")
                    Text(item.owner)
                }
                GridRow {
                    todayLabel("Due")
                    Text(item.dueAt?.formatted(date: .abbreviated, time: .shortened) ?? item.dueFallback)
                }
                GridRow {
                    todayLabel("Next move")
                    Text(item.nextMove).fontWeight(.semibold)
                }
            }
            .font(.callout)

            HStack {
                Label(
                    "Evidence \(item.evidenceAvailability.replacingOccurrences(of: "_", with: " "))",
                    systemImage: item.evidenceAvailability == "available" ? "checkmark.shield" : "exclamationmark.shield"
                )
                .font(.caption)
                .foregroundStyle(item.evidenceAvailability == "available" ? TSBrand.evidence : TSBrand.seam)
                Spacer()
                Button("Open relationship", systemImage: "arrow.right") {
                    model.openTodayAttention(id: item.id)
                }
                .buttonStyle(.bordered)
                .accessibilityIdentifier("today.open.\(item.id)")
                .accessibilityHint(item.scopeOptionID == nil
                    ? "Opens relationship review without selecting a Person or Pursuit"
                    : "Opens the available relationship for explicit scope review; it does not bind it automatically")
            }
        }
        .padding(16)
        .tsSurface(raised: true, accent: TSBrand.seam)
        .accessibilityIdentifier("today.attention.\(item.id)")
    }

    private func canonicalAttentionContinuation(_ item: TodayAttentionItem) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 14) {
                VStack(alignment: .leading, spacing: 3) {
                    SectionLabel(text: item.personLabel ?? item.pursuitTitle)
                    Text(item.whyNow)
                        .font(.headline)
                        .foregroundStyle(TSBrand.ink)
                }
                Spacer(minLength: 12)
                TSStatusBadge(
                    title: canonicalKindTitle(item.kind),
                    systemImage: canonicalKindIcon(item.kind)
                )
            }

            Grid(alignment: .leading, horizontalSpacing: 24, verticalSpacing: 6) {
                GridRow {
                    todayLabel("Unresolved")
                    Text(item.unresolved)
                }
                GridRow {
                    todayLabel("Owner")
                    Text(item.owner)
                }
                GridRow {
                    todayLabel("Due")
                    Text(item.dueAt?.formatted(date: .abbreviated, time: .shortened) ?? item.dueFallback)
                }
                GridRow {
                    todayLabel("Next move")
                    Text(item.nextMove).fontWeight(.semibold)
                }
            }
            .font(.callout)

            HStack {
                Label(
                    "Evidence \(item.evidenceAvailability.replacingOccurrences(of: "_", with: " "))",
                    systemImage: item.evidenceAvailability == "available" ? "checkmark.shield" : "exclamationmark.shield"
                )
                .font(.caption)
                .foregroundStyle(item.evidenceAvailability == "available" ? TSBrand.evidence : TSBrand.seam)
                Spacer()
                Button("Open", systemImage: "arrow.right") {
                    model.openTodayAttention(id: item.id)
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("Open relationship")
                .accessibilityIdentifier("today.open.\(item.id)")
                .accessibilityHint(item.scopeOptionID == nil
                    ? "Opens relationship review without selecting a Person or Pursuit"
                    : "Opens the available relationship for explicit scope review; it does not bind it automatically")
            }
        }
        .padding(16)
        .accessibilityIdentifier("today.attention.\(item.id)")
    }

    private func canonicalKindTitle(_ kind: TodayAttentionItem.Kind) -> String {
        switch kind {
        case .proposalReview: "Review"
        case .ownedAction: "Owned action"
        case .openGap: "Open dependency"
        }
    }

    private func canonicalKindIcon(_ kind: TodayAttentionItem.Kind) -> String {
        switch kind {
        case .proposalReview: "checklist"
        case .ownedAction: "arrow.forward.circle"
        case .openGap: "circle.dashed"
        }
    }

    private var companionCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    SectionLabel(text: model.provisionalInsight == nil ? "Relationship follow-up" : "Current conversation")
                    Text(currentConversationTitle)
                        .font(.title3.weight(.semibold))
                }
                Spacer()
                TSStatusBadge(
                    title: currentConversationStatusTitle,
                    systemImage: currentConversationStatusIcon,
                    isAttention: model.provisionalInsight != nil && !hasCompletedRelationshipReview
                )
            }

            if let insight = model.provisionalInsight {
                VStack(alignment: .leading, spacing: 5) {
                    SectionLabel(text: model.scopeReviewStatus == .confirmed ? "Relationship" : "Selected candidate conversation")
                    Text(model.scopeReviewStatus == .confirmed ? model.presentation.candidateName : "Relationship not chosen yet")
                        .font(.title3.weight(.semibold))
                    Label("Exact evidence remains inside the review", systemImage: "lock")
                        .font(.caption)
                        .foregroundStyle(TSBrand.secondaryInk)
                }

                Divider()

                Grid(alignment: .leading, horizontalSpacing: 24, verticalSpacing: 10) {
                    GridRow {
                        todayLabel("Why now")
                        Text(insight.change)
                    }
                    GridRow {
                        todayLabel("Unresolved")
                        Text(todayUnresolved(insight))
                    }
                    GridRow {
                        todayLabel("Owner")
                        Text("You")
                    }
                    GridRow {
                        todayLabel("Due")
                        Text(todayDue)
                    }
                    if let nextStep = insight.smallestNextStep {
                        GridRow {
                            todayLabel("Next move")
                            Text(nextStep)
                                .fontWeight(.semibold)
                        }
                    }
                }
                .font(.callout)
                .foregroundStyle(TSBrand.ink)

                if hasSavedRelationshipReview, model.canPrepareCurrentConversationNextStep {
                    Button(currentConversationNextStepTitle, systemImage: currentConversationNextStepIcon) {
                        model.prepareCurrentConversationNextStep()
                        if model.errorMessage == nil {
                            openWindow(id: "quick-panel")
                        }
                    }
                    .buttonStyle(TSPrimaryButtonStyle())
                    .accessibilityHint("Prepares the evidence-bound next step locally. A reminder still requires exact preview and approval; no message is sent.")
                    .accessibilityIdentifier("today.currentConversation.nextStep")
                } else {
                    Button(hasCompletedRelationshipReview ? "View review result" : "Continue review", systemImage: "arrow.right") {
                        openWindow(id: "quick-panel")
                    }
                    .buttonStyle(TSPrimaryButtonStyle())
                    .accessibilityIdentifier(hasCompletedRelationshipReview
                        ? "today.currentConversation.result"
                        : "today.currentConversation.continue")
                }
            } else {
                Text("Nothing is waiting here yet. Today only shows a follow-up backed by a reviewed conversation or a real pending, recovery, or reversible action.")
                    .font(.body)
                    .foregroundStyle(TSBrand.secondaryInk)
                    .fixedSize(horizontal: false, vertical: true)
                Button("Choose one conversation", systemImage: "text.badge.plus") {
                    openWindow(id: "quick-panel")
                }
                .buttonStyle(.bordered)
            }
        }
        .padding(18)
        .tsSurface(
            raised: true,
            accent: model.provisionalInsight == nil
                ? nil
                : (hasCompletedRelationshipReview ? TSBrand.evidence : TSBrand.seam)
        )
        .accessibilityIdentifier("today.currentConversation")
    }

    private var hasSavedRelationshipReview: Bool {
        model.mode == .receipt && model.canonicalReceipt != nil
    }

    private var hasCompletedRelationshipReview: Bool {
        hasSavedRelationshipReview || model.mode == .noAction
    }

    private var currentConversationTitle: String {
        guard model.provisionalInsight != nil else { return "Nothing waiting" }
        if hasSavedRelationshipReview { return "Next move ready" }
        if model.mode == .noAction { return "No new work needed" }
        return "Continue this follow-up"
    }

    private var currentConversationStatusTitle: String {
        guard model.provisionalInsight != nil else { return "No current work" }
        if hasSavedRelationshipReview { return "Relationship saved" }
        if model.mode == .noAction { return "Review complete" }
        return "Review in progress"
    }

    private var currentConversationStatusIcon: String {
        guard model.provisionalInsight != nil else { return "circle" }
        if hasSavedRelationshipReview { return "checkmark.seal" }
        if model.mode == .noAction { return "checkmark.circle" }
        return "arrow.forward.circle"
    }

    private var currentConversationNextStepTitle: String {
        if model.localDraftStatus != .awaitingDecision { return "Open prepared draft" }
        switch model.provisionalInsight?.suggestedAction {
        case .prepareClientQuestion: return "Prepare client question"
        case .prepareCandidateFollowUp: return "Prepare follow-up"
        case .createReminder: return "Prepare reminder"
        case nil: return "Continue"
        }
    }

    private var currentConversationNextStepIcon: String {
        model.provisionalInsight?.suggestedAction == .createReminder
            ? "calendar.badge.plus"
            : "square.and.pencil"
    }

    private func todayLabel(_ text: String) -> some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .foregroundStyle(TSBrand.secondaryInk)
            .frame(width: 76, alignment: .leading)
    }

    private func todayUnresolved(_ insight: ProvisionalFollowUpInsight) -> String {
        insight.primaryUnresolved
    }

    private var todayDue: String {
        if case .saved(let receipt) = model.reminderOperationState {
            return receipt.dueAt.formatted(date: .abbreviated, time: .shortened)
        }
        return "Not yet confirmed"
    }

    private var attentionCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    SectionLabel(text: "Needs your attention")
                    Text("\(model.actionCenterCount) item\(model.actionCenterCount == 1 ? "" : "s") waiting")
                        .font(.headline)
                }
                Spacer()
                Button("Open Action Center") {
                    model.selectedNavigation = .actionCenter
                }
            }
            if model.reminderNeedsActionCenter {
                HStack(spacing: 10) {
                    Image(systemName: "calendar.badge.clock")
                        .foregroundStyle(TSBrand.seam)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Follow-up reminder")
                            .font(.callout.weight(.semibold))
                        Text("Open the exact preview, receipt, or recovery state")
                            .font(.caption)
                            .foregroundStyle(TSBrand.secondaryInk)
                    }
                }
            }
            ForEach(model.actionCenterProjections.prefix(model.reminderNeedsActionCenter ? 2 : 3)) { projection in
                HStack(spacing: 10) {
                    Image(systemName: projection.status.icon)
                        .foregroundStyle(TSBrand.seam)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(projection.objectName)
                            .font(.callout.weight(.semibold))
                        Text(projection.status.title)
                            .font(.caption)
                            .foregroundStyle(TSBrand.secondaryInk)
                    }
                }
            }
        }
        .padding(18)
        .tsSurface()
    }

    private func verifiedReminderCard(_ receipt: FollowUpReminderReceipt) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            SectionLabel(text: "Recently verified")
            Label("Reminder saved to \(receipt.destinationTitle)", systemImage: "checkmark.seal.fill")
                .font(.headline)
                .foregroundStyle(TSBrand.evidence)
            Text(receipt.title)
                .font(.callout)
            Text(receipt.dueAt, format: .dateTime.weekday().month().day().hour().minute())
                .font(.caption)
                .foregroundStyle(TSBrand.secondaryInk)
        }
        .padding(18)
        .tsSurface()
    }
}
