import ActivityKit
import SwiftUI
import WidgetKit

@main
struct TalentSignalLiveActivityBundle: WidgetBundle {
    var body: some Widget {
        SignalRecordingLiveActivity()
        AgentWorkLiveActivity()
    }
}

struct SignalRecordingLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: SignalRecordingActivityAttributes.self) { context in
            HStack(spacing: 14) {
                Image(systemName: icon(for: context.state.phase))
                    .font(.title2)
                    .foregroundStyle(.red)
                VStack(alignment: .leading, spacing: 3) {
                    Text(title(for: context.state.phase)).font(.headline)
                    if context.state.phase == .recording {
                        Text(timerInterval: context.state.startedAt ... Date.distantFuture, countsDown: false)
                            .font(.body.monospacedDigit())
                    } else {
                        Text(subtitle(for: context.state.phase)).font(.caption).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                if context.state.phase == .recording {
                    Button(intent: StopStandaloneSignalRecordingIntent(draftID: context.state.draftID)) {
                        Label("Stop", systemImage: "stop.fill").labelStyle(.iconOnly)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.red)
                    .accessibilityLabel("Stop and save Signal recording")
                }
            }
            .padding()
            .activityBackgroundTint(Color.black.opacity(0.88))
            .activitySystemActionForegroundColor(.white)
            .widgetURL(reviewURL(draftID: context.state.draftID))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: icon(for: context.state.phase)).foregroundStyle(.red)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(title(for: context.state.phase)).font(.headline)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if context.state.phase == .recording {
                        Text(timerInterval: context.state.startedAt ... Date.distantFuture, countsDown: false)
                            .font(.caption.monospacedDigit())
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if context.state.phase == .recording {
                        Button(intent: StopStandaloneSignalRecordingIntent(draftID: context.state.draftID)) {
                            Label("Stop and save", systemImage: "stop.fill")
                        }
                        .tint(.red)
                    } else {
                        Text(subtitle(for: context.state.phase)).font(.caption)
                    }
                }
            } compactLeading: {
                Image(systemName: icon(for: context.state.phase)).foregroundStyle(.red)
            } compactTrailing: {
                if context.state.phase == .recording {
                    Text(timerInterval: context.state.startedAt ... Date.distantFuture, countsDown: false)
                        .monospacedDigit()
                        .frame(width: 42)
                } else {
                    Image(systemName: context.state.phase == .readyToReview ? "checkmark" : "sparkles")
                }
            } minimal: {
                Image(systemName: icon(for: context.state.phase)).foregroundStyle(.red)
            }
            .widgetURL(reviewURL(draftID: context.state.draftID))
            .keylineTint(.red)
        }
    }

    private func title(
        for phase: SignalRecordingActivityAttributes.ContentState.Phase
    ) -> String {
        switch phase {
        case .recording: return "Recording Signal"
        case .organizing: return "Saved · Organizing"
        case .readyToReview: return "Ready to Review"
        }
    }

    private func subtitle(
        for phase: SignalRecordingActivityAttributes.ContentState.Phase
    ) -> String {
        switch phase {
        case .recording: return "Foreground, local capture"
        case .organizing: return "The local recording is saved"
        case .readyToReview: return "Open Talent Signal to review"
        }
    }

    private func icon(
        for phase: SignalRecordingActivityAttributes.ContentState.Phase
    ) -> String {
        switch phase {
        case .recording: return "waveform.circle.fill"
        case .organizing: return "sparkles"
        case .readyToReview: return "checkmark.circle.fill"
        }
    }

    private func reviewURL(draftID: UUID) -> URL? {
        URL(string: "talentsignal://standalone/proposal?draft=\(draftID.uuidString)")
    }
}
