import ActivityKit
import SwiftUI
import WidgetKit

struct AgentAskLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AgentAskActivityAttributes.self) { context in
            let view = AgentAskActivityProjector.presentation(
                context.state,
                isSystemStale: context.isStale
            )
            AskActivityCard(view: view, url: destinationURL(context, view: view))
                .activityBackgroundTint(Color.signalActivityBackground)
                .activitySystemActionForegroundColor(.white)
                .widgetURL(destinationURL(context, view: view))
        } dynamicIsland: { context in
            let view = AgentAskActivityProjector.presentation(
                context.state,
                isSystemStale: context.isStale
            )
            let url = destinationURL(context, view: view)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    AskActivityMark(phase: view.phase, size: 25)
                        .padding(.leading, 2)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    AskActivityBody(view: view, url: url)
                }
            } compactLeading: {
                AskActivityMark(phase: view.phase, size: 22)
                    .accessibilityLabel(view.accessibilityLabel)
            } compactTrailing: {
                if let compactTitle = view.compactTitle {
                    Text(compactTitle)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.white)
                        .fixedSize()
                } else if view.phase == .thinking {
                    AskThinkingTrace()
                }
            } minimal: {
                AskActivityMark(phase: view.phase, size: 20)
                    .accessibilityLabel(view.accessibilityLabel)
            }
            .widgetURL(url)
            .keylineTint(view.phase == .thinking ? .white.opacity(0.55) : .signalActivityAccent)
        }
    }

    private func destinationURL(
        _ context: ActivityViewContext<AgentAskActivityAttributes>,
        view: AgentAskActivityViewState
    ) -> URL? {
        let destination: AgentAskDeepLinkDestination = view.action == .retry
            ? .retry
            : view.phase == .review ? .review : .status
        return AgentAskDeepLink.url(
            identity: .init(
                workspaceID: context.attributes.workspaceID,
                sessionID: context.attributes.sessionID,
                activityInstanceID: context.attributes.activityInstanceID
            ),
            destination: destination
        )
    }
}

private struct AskActivityMark: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let phase: AgentAskActivityPhase
    let size: CGFloat

    var body: some View {
        LivingConnectionMark(
            phase: markPhase,
            size: size,
            ink: .white.opacity(0.92),
            signal: .signalActivityAccent,
            reduceMotion: reduceMotion
        )
    }

    private var markPhase: LivingConnectionPhase {
        switch phase {
        case .thinking: return .thinking
        case .review: return .review
        case .failed: return .failed
        case .timedOut: return .timedOut
        }
    }
}

private struct AskThinkingTrace: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 12.0, paused: reduceMotion)) { context in
            let value = reduceMotion
                ? 0.4
                : (sin(context.date.timeIntervalSinceReferenceDate * 2.8) + 1) / 2
            Capsule()
                .fill(.white.opacity(0.34 + value * 0.38))
                .frame(width: 18 + value * 8, height: 2)
        }
        .frame(width: 28, height: 20)
        .accessibilityHidden(true)
    }
}

private struct AskActivityCard: View {
    let view: AgentAskActivityViewState
    let url: URL?

    var body: some View {
        HStack(spacing: 12) {
            AskActivityMark(phase: view.phase, size: 30)
                .accessibilityHidden(true)
            AskActivityBody(view: view, url: url)
        }
        .padding(16)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(view.accessibilityLabel)
    }
}

private struct AskActivityBody: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let view: AgentAskActivityViewState
    let url: URL?

    var body: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 8) { content; action }
            } else {
                HStack(spacing: 12) { content; Spacer(minLength: 8); action }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var content: some View {
            if view.phase == .thinking {
                HStack(spacing: 8) {
                Text(view.title)
                    .font(.headline)
                    .foregroundStyle(.white.opacity(0.88))
                AskThinkingTrace()
            }
        } else {
            Text(view.title)
                .font(.headline)
                .foregroundStyle(.white)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder
    private var action: some View {
        if let title = view.actionTitle, let url {
            Link(destination: url) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 14)
                    .frame(minWidth: 44, minHeight: 44)
                    .foregroundStyle(.black)
                    .background(.white, in: Capsule())
            }
            .buttonStyle(.plain)
            .fixedSize(horizontal: !dynamicTypeSize.isAccessibilitySize, vertical: false)
        }
    }
}
