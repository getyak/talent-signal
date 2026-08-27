import ActivityKit
import Foundation

@MainActor
final class StandaloneRecordingActivityCoordinator {
    private static let activeFreshness: TimeInterval = 10 * 60
    private var activity: Any?
    private var startedAt: Date?
    private var draftID: UUID?

    func start(draftID: UUID, now: Date = Date()) async {
        guard #available(iOS 16.2, *), ActivityAuthorizationInfo().areActivitiesEnabled else {
            return
        }
        await end(dismissImmediately: true)
        let state = SignalRecordingActivityAttributes.ContentState(
            phase: .recording,
            startedAt: now,
            draftID: draftID
        )
        do {
            activity = try Activity.request(
                attributes: SignalRecordingActivityAttributes(sessionID: UUID()),
                content: ActivityContent(
                    state: state,
                    staleDate: Self.activeStaleDate(from: now)
                ),
                pushType: nil
            )
            startedAt = now
            self.draftID = draftID
        } catch {
            activity = nil
            startedAt = nil
            self.draftID = nil
        }
    }

    func markOrganizing() async {
        await update(phase: .organizing)
    }

    func markReadyToReview() async {
        guard #available(iOS 16.2, *),
              let activity = activity as? Activity<SignalRecordingActivityAttributes>,
              let state = contentState(phase: .readyToReview) else {
            return
        }
        await activity.end(
            ActivityContent(state: state, staleDate: Date().addingTimeInterval(15 * 60)),
            dismissalPolicy: .after(Date().addingTimeInterval(15 * 60))
        )
        self.activity = nil
    }

    func end(dismissImmediately: Bool) async {
        guard #available(iOS 16.2, *),
              let activity = activity as? Activity<SignalRecordingActivityAttributes> else { return }
        let state = contentState(phase: .readyToReview)
            ?? SignalRecordingActivityAttributes.ContentState(
                phase: .readyToReview,
                startedAt: Date(),
                draftID: UUID()
            )
        await activity.end(
            ActivityContent(state: state, staleDate: nil),
            dismissalPolicy: dismissImmediately ? .immediate : .default
        )
        self.activity = nil
        startedAt = nil
        draftID = nil
    }

    func reconcileOrphans(now: Date = Date()) async {
        guard #available(iOS 16.2, *) else { return }
        let currentActivityID = (activity as? Activity<SignalRecordingActivityAttributes>)?.id
        for existing in Activity<SignalRecordingActivityAttributes>.activities
        where existing.id != currentActivityID {
            let previous = existing.content.state
            let resolved = SignalRecordingActivityAttributes.ContentState(
                phase: .readyToReview,
                startedAt: previous.startedAt,
                draftID: previous.draftID
            )
            await existing.end(
                ActivityContent(state: resolved, staleDate: now),
                dismissalPolicy: .immediate
            )
        }
    }

    private func update(phase: SignalRecordingActivityAttributes.ContentState.Phase) async {
        guard #available(iOS 16.2, *),
              let activity = activity as? Activity<SignalRecordingActivityAttributes>,
              let state = contentState(phase: phase) else {
            return
        }
        await activity.update(
            ActivityContent(
                state: state,
                staleDate: Self.activeStaleDate(from: Date())
            )
        )
    }

    private func contentState(
        phase: SignalRecordingActivityAttributes.ContentState.Phase
    ) -> SignalRecordingActivityAttributes.ContentState? {
        guard let startedAt, let draftID else { return nil }
        return .init(phase: phase, startedAt: startedAt, draftID: draftID)
    }

    static func activeStaleDate(from date: Date) -> Date {
        date.addingTimeInterval(activeFreshness)
    }
}
