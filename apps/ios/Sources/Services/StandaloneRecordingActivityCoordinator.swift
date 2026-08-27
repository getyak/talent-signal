import ActivityKit
import Foundation

@MainActor
final class StandaloneRecordingActivityCoordinator {
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
                content: ActivityContent(state: state, staleDate: nil),
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

    private func update(phase: SignalRecordingActivityAttributes.ContentState.Phase) async {
        guard #available(iOS 16.2, *),
              let activity = activity as? Activity<SignalRecordingActivityAttributes>,
              let state = contentState(phase: phase) else {
            return
        }
        await activity.update(ActivityContent(state: state, staleDate: nil))
    }

    private func contentState(
        phase: SignalRecordingActivityAttributes.ContentState.Phase
    ) -> SignalRecordingActivityAttributes.ContentState? {
        guard let startedAt, let draftID else { return nil }
        return .init(phase: phase, startedAt: startedAt, draftID: draftID)
    }
}
