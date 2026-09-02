import ActivityKit
import SwiftUI
import WidgetKit

struct ResearchLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ResearchActivityAttributes.self) { context in
            lockScreenView(context)
                .activityBackgroundTint(Color.researchActivityBackground)
                .activitySystemActionForegroundColor(.white)
                .widgetURL(destinationURL(context))
        } dynamicIsland: { context in
            let view = projected(context.state)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    ResearchActivityMark(size: 28)
                        .padding(.leading, 2)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(view.eyebrow)
                            .font(.caption2.weight(.bold))
                            .tracking(0.8)
                            .foregroundStyle(Color.researchVermilion)
                            .lineLimit(1)
                        Text(view.title)
                            .font(.headline)
                            .foregroundStyle(.white)
                            .lineLimit(2)
                            .minimumScaleFactor(0.8)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    attentionBadge(view)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    expandedBottom(context, view: view)
                }
            } compactLeading: {
                ResearchActivityMark(size: 22)
                    .accessibilityHidden(true)
            } compactTrailing: {
                if view.action == .openReview {
                    Text(researchLocalized("REVIEW"))
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.white)
                        .accessibilityLabel(view.supportingText)
                } else {
                    Text(researchLocalized("AWAY"))
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.white.opacity(0.86))
                        .accessibilityLabel(researchLocalized("You can leave"))
                }
            } minimal: {
                ResearchActivityMark(size: 20)
                    .accessibilityLabel(view.accessibilityLabel)
            }
            .widgetURL(destinationURL(context))
            .keylineTint(Color.researchVermilion)
        }
    }

    private func lockScreenView(
        _ context: ActivityViewContext<ResearchActivityAttributes>
    ) -> some View {
        let view = projected(context.state)
        return VStack(alignment: .leading, spacing: 13) {
            HStack(alignment: .center, spacing: 10) {
                ResearchActivityMark(size: 32)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(researchLocalized("Talent Signal Research"))
                        .font(.caption2.weight(.bold))
                        .tracking(1.05)
                        .textCase(.uppercase)
                        .foregroundStyle(.white.opacity(0.68))
                    Text(view.eyebrow)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Color.researchVermilion)
                }
                Spacer(minLength: 12)
                attentionBadge(view)
            }

            VStack(alignment: .leading, spacing: 5) {
                Text(view.title)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
                Text(view.supportingText)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.white.opacity(0.86))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(view.accessibilityLabel)

            HStack(alignment: .center, spacing: 10) {
                Label(view.boundaryText, systemImage: "lock.shield")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.7))
                    .lineLimit(2)
                Spacer(minLength: 8)
                actionLink(context, view: view)
            }
        }
        .padding(17)
        .accessibilityElement(children: .contain)
    }

    private func expandedBottom(
        _ context: ActivityViewContext<ResearchActivityAttributes>,
        view: ResearchActivityViewState
    ) -> some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(view.supportingText)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.9))
                    .lineLimit(1)
                Label(view.boundaryText, systemImage: "lock.shield")
                    .font(.caption2)
                    .foregroundStyle(.white.opacity(0.7))
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            actionLink(context, view: view)
        }
        .padding(.horizontal, 4)
        .padding(.top, 5)
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private func actionLink(
        _ context: ActivityViewContext<ResearchActivityAttributes>,
        view: ResearchActivityViewState
    ) -> some View {
        if let action = view.action,
           let url = destinationURL(context) {
            Link(destination: url) {
                Label(action.title, systemImage: "arrow.up.right")
                    .font(.caption.weight(.semibold))
                    .frame(minHeight: 32)
            }
            .buttonStyle(.borderedProminent)
            .tint(.white)
            .foregroundStyle(.black)
        }
    }

    private func attentionBadge(
        _ view: ResearchActivityViewState
    ) -> some View {
        let label = view.action == .openReview
            ? researchLocalized("Needs you")
            : researchLocalized("You can leave")
        let symbol = view.action == .openReview
            ? "person.fill"
            : "arrow.down.right.and.arrow.up.left"
        return Label(label, systemImage: symbol)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(.white.opacity(0.82))
            .labelStyle(.titleAndIcon)
            .lineLimit(1)
    }

    private func projected(
        _ state: ResearchActivityAttributes.ContentState
    ) -> ResearchActivityViewState {
        if let projected = try? ResearchActivityProjector.project(state) {
            return projected
        }
        return ResearchActivityViewState(
            eyebrow: researchLocalized("CHECK STATUS"),
            title: researchLocalized("Open Talent Signal"),
            supportingText: researchLocalized("This update needs review"),
            boundaryText: researchLocalized("Nothing used automatically"),
            action: .openStatus,
            accessibilityLabel: researchLocalized(
                "Talent Signal Research. This update needs review. Nothing used automatically."
            ),
            isTerminal: false
        )
    }

    private func destinationURL(
        _ context: ActivityViewContext<ResearchActivityAttributes>
    ) -> URL? {
        let view = projected(context.state)
        guard let action = view.action else { return nil }
        return ResearchDeepLink.url(
            identity: ResearchActivityIdentity(
                scopeID: context.attributes.scopeID,
                taskID: context.attributes.taskID,
                activityInstanceID: context.attributes.activityInstanceID
            ),
            destination: action == .openReview ? .review : .status
        )
    }
}

private struct ResearchActivityMark: View {
    let size: CGFloat

    var body: some View {
        ZStack {
            Circle().fill(Color.white.opacity(0.08))
            Rectangle()
                .fill(Color.researchVermilion)
                .frame(width: max(2, size * 0.09), height: size * 0.58)
                .offset(x: -size * 0.28)
            Image(systemName: "doc.text.magnifyingglass")
                .font(.system(size: size * 0.4, weight: .semibold))
                .foregroundStyle(.white)
        }
        .frame(width: size, height: size)
    }
}

private extension Color {
    static let researchVermilion = Color(red: 0.79, green: 0.19, blue: 0.13)
    static let researchActivityBackground = Color(
        red: 0.055,
        green: 0.052,
        blue: 0.048
    )
}
