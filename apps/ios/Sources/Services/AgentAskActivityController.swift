import ActivityKit
import Foundation

@MainActor
final class AgentAskActivityController {
    static let shared = AgentAskActivityController()

    private static let thinkingStaleInterval: TimeInterval = 75
    private static let terminalLifetime: TimeInterval = 15 * 60
    private var latestStates: [
        AgentAskActivityIdentity: AgentAskActivityAttributes.ContentState
    ] = [:]

    func start(
        workspaceID: String,
        sessionID: UUID,
        now: Date = Date()
    ) async -> AgentAskActivityIdentity? {
        guard #available(iOS 16.2, *),
              ActivityAuthorizationInfo().areActivitiesEnabled else { return nil }
        await endActivities(sessionID: sessionID.uuidString.lowercased(), now: now)

        let identity = AgentAskActivityIdentity(
            workspaceID: workspaceID,
            sessionID: sessionID.uuidString.lowercased(),
            activityInstanceID: UUID().uuidString.lowercased()
        )
        let attributes = Self.attributes(for: identity)
        let state = AgentAskActivityAttributes.ContentState(
            phase: .thinking,
            eventRevision: 1,
            updatedAt: now
        )
        do {
            try AgentAskActivityPayloadContract.validate(attributes: attributes, state: state)
            let activity = try Activity.request(
                attributes: attributes,
                content: Self.content(state: state, now: now),
                pushType: nil
            )
            latestStates[identity] = state
            for duplicate in Activity<AgentAskActivityAttributes>.activities
                where duplicate.id != activity.id
                    && duplicate.attributes.sessionID == identity.sessionID {
                await duplicate.end(duplicate.content, dismissalPolicy: .immediate)
            }
            return identity
        } catch {
            return nil
        }
    }

    @discardableResult
    func update(
        identity: AgentAskActivityIdentity,
        phase: AgentAskActivityPhase,
        now: Date = Date()
    ) async -> Bool {
        guard #available(iOS 16.2, *),
              let activity = exactActivity(identity) else { return false }
        let current = latestStates[identity] ?? activity.content.state
        let proposed = AgentAskActivityAttributes.ContentState(
            phase: phase,
            eventRevision: current.eventRevision + 1,
            updatedAt: now
        )
        guard AgentAskActivityTransitionPolicy.decision(from: current, to: proposed) == .apply,
              (try? AgentAskActivityPayloadContract.validate(
                attributes: activity.attributes,
                state: proposed
              )) != nil else { return false }
        latestStates[identity] = proposed
        await activity.update(Self.content(state: proposed, now: now))
        return true
    }

    func endActivities(sessionID: String, now: Date = Date()) async {
        guard #available(iOS 16.2, *) else { return }
        for activity in Activity<AgentAskActivityAttributes>.activities
            where activity.attributes.sessionID == sessionID.lowercased() {
            await activity.end(
                ActivityContent(state: activity.content.state, staleDate: now),
                dismissalPolicy: .immediate
            )
            latestStates.removeValue(forKey: Self.identity(for: activity.attributes))
        }
    }

    func endAllActivities(now: Date = Date()) async {
        guard #available(iOS 16.2, *) else { return }
        for activity in Activity<AgentAskActivityAttributes>.activities {
            await activity.end(
                ActivityContent(state: activity.content.state, staleDate: now),
                dismissalPolicy: .immediate
            )
        }
        latestStates.removeAll()
    }

    func cleanExpired(now: Date = Date()) async {
        guard #available(iOS 16.2, *) else { return }
        for activity in Activity<AgentAskActivityAttributes>.activities {
            let state = latestStates[Self.identity(for: activity.attributes)]
                ?? activity.content.state
            guard state.phase.isTerminal,
                  now.timeIntervalSince(state.updatedAt) >= Self.terminalLifetime else { continue }
            await activity.end(
                ActivityContent(state: state, staleDate: now),
                dismissalPolicy: .immediate
            )
            latestStates.removeValue(forKey: Self.identity(for: activity.attributes))
        }
    }

#if DEBUG
    func configureDeterministicLaunch(arguments: [String]) async {
        guard arguments.contains("--fixture-agent-ask-activity") else { return }
        await endAllActivities()
        let fixtureSessionID = UUID(
            uuidString: "11111111-1111-4111-8111-111111111111"
        )!
        guard let identity = await start(
            workspaceID: "debug.local",
            sessionID: fixtureSessionID
        ) else { return }
        guard let phaseIndex = arguments.firstIndex(of: "--fixture-agent-ask-phase"),
              arguments.indices.contains(phaseIndex + 1),
              let phase = AgentAskActivityPhase(rawValue: arguments[phaseIndex + 1]),
              phase != .thinking else { return }
        await update(identity: identity, phase: phase)
    }
#endif

    @available(iOS 16.2, *)
    private func exactActivity(
        _ identity: AgentAskActivityIdentity
    ) -> Activity<AgentAskActivityAttributes>? {
        Activity<AgentAskActivityAttributes>.activities.first {
            Self.identity(for: $0.attributes) == identity
        }
    }

    private static func attributes(
        for identity: AgentAskActivityIdentity
    ) -> AgentAskActivityAttributes {
        .init(
            schemaVersion: AgentAskActivityAttributes.currentSchemaVersion,
            workspaceID: identity.workspaceID,
            sessionID: identity.sessionID,
            activityInstanceID: identity.activityInstanceID
        )
    }

    private static func identity(
        for attributes: AgentAskActivityAttributes
    ) -> AgentAskActivityIdentity {
        .init(
            workspaceID: attributes.workspaceID,
            sessionID: attributes.sessionID,
            activityInstanceID: attributes.activityInstanceID
        )
    }

    @available(iOS 16.2, *)
    private static func content(
        state: AgentAskActivityAttributes.ContentState,
        now: Date
    ) -> ActivityContent<AgentAskActivityAttributes.ContentState> {
        ActivityContent(
            state: state,
            staleDate: state.phase == .thinking
                ? now.addingTimeInterval(thinkingStaleInterval)
                : now.addingTimeInterval(terminalLifetime)
        )
    }
}
