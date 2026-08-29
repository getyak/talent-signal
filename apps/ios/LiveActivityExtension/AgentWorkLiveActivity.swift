import ActivityKit
import SwiftUI
import WidgetKit

struct AgentWorkLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AgentWorkActivityAttributes.self) { context in
            lockScreenView(context)
                .activityBackgroundTint(Color.agentActivityBackground)
                .activitySystemActionForegroundColor(.white)
                .widgetURL(destinationURL(context))
        } dynamicIsland: { context in
            let view = projected(context.state)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    AgentWorkHandoffMark(glyph: view.glyph, size: 28)
                        .padding(.leading, 2)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(view.eyebrow)
                            .font(.caption2.weight(.bold))
                            .tracking(0.8)
                            .foregroundStyle(Color.agentVermilion)
                            .lineLimit(1)
                        Text(view.title)
                            .font(.headline)
                            .foregroundStyle(.white)
                            .lineLimit(1)
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
                AgentWorkHandoffMark(glyph: view.glyph, size: 22)
                    .accessibilityHidden(true)
            } compactTrailing: {
                compactAttention(view)
            } minimal: {
                AgentWorkHandoffMark(glyph: view.glyph, size: 20)
                    .accessibilityLabel(view.accessibilityLabel)
            }
            .widgetURL(destinationURL(context))
            .keylineTint(Color.agentVermilion)
        }
    }

    private func lockScreenView(
        _ context: ActivityViewContext<AgentWorkActivityAttributes>
    ) -> some View {
        let view = projected(context.state)
        return VStack(alignment: .leading, spacing: 13) {
            HStack(alignment: .center, spacing: 10) {
                AgentWorkHandoffMark(glyph: view.glyph, size: 32)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text("TALENT SIGNAL AGENT")
                        .font(.caption2.weight(.bold))
                        .tracking(1.05)
                        .foregroundStyle(.white.opacity(0.68))
                    Text(view.eyebrow)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Color.agentVermilion)
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

            HStack(alignment: .center, spacing: 10) {
                Label(
                    view.isStale ? "Update delayed" : view.boundaryText,
                    systemImage: view.isStale
                        ? "clock.badge.exclamationmark"
                        : "lock.shield"
                )
                .font(.caption)
                .foregroundStyle(.white.opacity(0.7))
                .lineLimit(2)

                Spacer(minLength: 8)

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
        }
        .padding(17)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(view.accessibilityLabel)
    }

    private func expandedBottom(
        _ context: ActivityViewContext<AgentWorkActivityAttributes>,
        view: AgentWorkActivityViewState
    ) -> some View {
        HStack(alignment: .center, spacing: 12) {
            Label(
                view.isStale ? "Update delayed" : view.boundaryText,
                systemImage: view.isStale
                    ? "clock.badge.exclamationmark"
                    : "lock.shield"
            )
            .font(.caption)
            .foregroundStyle(.white.opacity(0.7))
            .lineLimit(2)

            Spacer(minLength: 8)

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
        .padding(.horizontal, 4)
        .padding(.top, 5)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(view.accessibilityLabel)
    }

    private func attentionBadge(
        _ view: AgentWorkActivityViewState
    ) -> some View {
        let label: String
        let symbol: String
        if view.isStale {
            label = "Delayed"
            symbol = "clock"
        } else if view.action == .openActions || view.action == .resolve {
            label = "Needs you"
            symbol = "person.fill"
        } else if view.action == nil {
            label = "Done"
            symbol = "checkmark"
        } else {
            label = "You can leave"
            symbol = "arrow.down.right.and.arrow.up.left"
        }
        return Label(label, systemImage: symbol)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(.white.opacity(0.82))
            .labelStyle(.titleAndIcon)
            .lineLimit(1)
    }

    @ViewBuilder
    private func compactAttention(
        _ view: AgentWorkActivityViewState
    ) -> some View {
        if view.isStale {
            Image(systemName: "clock.badge.exclamationmark")
                .foregroundStyle(.white.opacity(0.8))
                .accessibilityLabel("Update delayed")
        } else if view.action == .openActions || view.action == .resolve {
            Text("REVIEW")
                .font(.caption2.weight(.bold))
                .foregroundStyle(.white)
                .accessibilityLabel(view.supportingText)
        } else if view.action == nil {
            Image(systemName: "checkmark")
                .foregroundStyle(.white)
                .accessibilityLabel(view.title)
        } else {
            Text("AWAY")
                .font(.caption2.weight(.bold))
                .foregroundStyle(.white.opacity(0.86))
                .accessibilityLabel("You can leave")
        }
    }

    private func projected(
        _ state: AgentWorkActivityAttributes.ContentState
    ) -> AgentWorkActivityViewState {
        if let projected = try? AgentWorkActivityProjector.project(state) {
            return projected
        }
        return AgentWorkActivityViewState(
            eyebrow: "CHECK STATUS",
            title: "Open Talent Signal",
            supportingText: "This update needs review",
            boundaryText: "No outcome assumed",
            glyph: .unknown,
            action: .resolve,
            accessibilityLabel: "Talent Signal Agent. This update needs review. No outcome assumed.",
            isTerminal: false,
            isStale: true
        )
    }

    private func destinationURL(
        _ context: ActivityViewContext<AgentWorkActivityAttributes>
    ) -> URL? {
        let view = projected(context.state)
        guard let action = view.action else { return nil }
        let destination: AgentWorkDeepLinkDestination
        switch action {
        case .openStatus: destination = .status
        case .openActions: destination = .actions
        case .resolve: destination = .resolve
        }
        return AgentWorkDeepLink.url(
            identity: AgentWorkActivityIdentity(
                scopeID: context.attributes.scopeID,
                taskID: context.attributes.taskID,
                activityInstanceID: context.attributes.activityInstanceID
            ),
            destination: destination
        )
    }
}

private struct AgentWorkHandoffMark: View {
    let glyph: AgentWorkGlyph
    let size: CGFloat

    var body: some View {
        ZStack {
            Circle()
                .fill(Color.white.opacity(0.08))
            Rectangle()
                .fill(Color.agentVermilion)
                .frame(width: max(2, size * 0.09), height: size * 0.58)
                .offset(x: -size * 0.28)
            Image(systemName: glyph.systemImageName)
                .font(.system(size: size * 0.44, weight: .semibold))
                .foregroundStyle(.white)
        }
        .frame(width: size, height: size)
    }
}

private extension Color {
    static let agentVermilion = Color(
        red: 0.79,
        green: 0.19,
        blue: 0.13
    )
    static let agentActivityBackground = Color(
        red: 0.055,
        green: 0.052,
        blue: 0.048
    )
}
