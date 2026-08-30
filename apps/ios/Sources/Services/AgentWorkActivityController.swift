import ActivityKit
import Combine
import Foundation

enum AgentWorkActivityControllerResult: Equatable {
    case applied
    case noOp
    case ignoredOlder
    case unavailable
    case missing
    case identityMismatch
    case sameRevisionConflict
    case terminalRegression
    case invalidPayload
    case systemFailure
}

enum AgentWorkActivityControllerStatus: Equatable {
    case idle
    case unavailable
    case active(
        identity: AgentWorkActivityIdentity,
        state: AgentWorkActivityViewState
    )
    case failed(message: String)
}

struct AgentWorkActivitySnapshot: Equatable {
    let identity: AgentWorkActivityIdentity
    let state: AgentWorkActivityAttributes.ContentState
}

@MainActor
protocol AgentWorkActivityControlling: AnyObject {
    func startSyntheticTask(
        scopeID: String,
        taskID: String,
        now: Date,
        fixtureLifetime: TimeInterval
    ) async -> AgentWorkActivityIdentity?

    func update(
        identity: AgentWorkActivityIdentity,
        state: AgentWorkActivityAttributes.ContentState,
        now: Date
    ) async -> AgentWorkActivityControllerResult

    func end(
        identity: AgentWorkActivityIdentity,
        dismissImmediately: Bool,
        now: Date
    ) async -> AgentWorkActivityControllerResult

    func restoreOrCleanExpired(now: Date) async -> AgentWorkActivitySnapshot?
    func activeSnapshot(
        identity: AgentWorkActivityIdentity
    ) -> AgentWorkActivitySnapshot?
}

@MainActor
final class AgentWorkActivityController: ObservableObject, AgentWorkActivityControlling {
    static let shared = AgentWorkActivityController()

    @Published private(set) var status: AgentWorkActivityControllerStatus = .idle

    private struct FixtureRecord: Codable, Equatable {
        let identity: AgentWorkActivityIdentity
        let expiresAt: Date
    }

    private static let recordKey = "talent-signal.agent-work.fixture.v1"
    private static let staleInterval: TimeInterval = 8 * 60
    private let defaults: UserDefaults
    private var latestStates: [
        AgentWorkActivityIdentity: AgentWorkActivityAttributes.ContentState
    ] = [:]

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func startSyntheticTask(
        scopeID: String = "debug.local",
        taskID: String = "task.agent-showcase",
        now: Date = Date(),
        fixtureLifetime: TimeInterval = 30 * 60
    ) async -> AgentWorkActivityIdentity? {
        guard #available(iOS 16.2, *),
              ActivityAuthorizationInfo().areActivitiesEnabled else {
            status = .unavailable
            return nil
        }

        let matching = Activity<AgentWorkActivityAttributes>.activities.filter {
            $0.attributes.scopeID == scopeID && $0.attributes.taskID == taskID
        }

        // A repeated start with the still-valid persisted identity is a
        // transport/UI retry, not a new business task. Reuse that exact
        // instance and reconcile any accidental duplicates around it.
        if let record = loadRecord(),
           record.expiresAt > now,
           record.identity.scopeID == scopeID,
           record.identity.taskID == taskID,
           let reusable = matching.first(where: {
               Self.identity(for: $0.attributes) == record.identity
                   && !$0.content.state.execution.isTerminal
           }) {
            for duplicate in matching where duplicate.id != reusable.id {
                await duplicate.end(
                    duplicate.content,
                    dismissalPolicy: .immediate
                )
                latestStates.removeValue(
                    forKey: Self.identity(for: duplicate.attributes)
                )
            }
            let state = latestStates[record.identity] ?? reusable.content.state
            do {
                try AgentWorkActivityPayloadContract.validate(
                    attributes: reusable.attributes,
                    contentState: state
                )
                latestStates[record.identity] = state
                publish(activity: reusable, stateOverride: state)
                return record.identity
            } catch {
                await reusable.end(
                    reusable.content,
                    dismissalPolicy: .immediate
                )
                latestStates.removeValue(forKey: record.identity)
                removePersistedRecord(matching: record.identity)
            }
        }

        // A terminal, expired, untracked, or mismatched card belongs to an
        // older run. Close it before creating the new explicit fixture run.
        for prior in matching {
            await prior.end(prior.content, dismissalPolicy: .immediate)
            latestStates.removeValue(forKey: Self.identity(for: prior.attributes))
        }

        let identity = AgentWorkActivityIdentity(
            scopeID: scopeID,
            taskID: taskID,
            activityInstanceID: UUID().uuidString.lowercased()
        )
        let attributes = Self.attributes(for: identity)
        let state = AgentWorkActivityAttributes.ContentState(
            execution: .preparing,
            attention: .observe,
            freshness: .fresh,
            stage: .received,
            reviewActionCount: 0,
            eventRevision: 1,
            updatedAt: now
        )

        do {
            try AgentWorkActivityPayloadContract.validate(
                attributes: attributes,
                contentState: state
            )
            let activity = try Activity.request(
                attributes: attributes,
                content: Self.content(state: state, now: now),
                pushType: nil
            )
            latestStates[identity] = state
            persist(identity: identity, expiresAt: now.addingTimeInterval(fixtureLifetime))
            publish(activity: activity)
            return identity
        } catch {
            status = .failed(message: "Live Activity could not start. The Agent task is still safe in the App.")
            return nil
        }
    }

    func update(
        identity: AgentWorkActivityIdentity,
        state: AgentWorkActivityAttributes.ContentState,
        now: Date = Date()
    ) async -> AgentWorkActivityControllerResult {
        guard #available(iOS 16.2, *) else {
            status = .unavailable
            return .unavailable
        }
        guard let activity = exactActivity(identity: identity) else {
            return .missing
        }
        let attributes = Self.attributes(for: identity)
        do {
            try AgentWorkActivityPayloadContract.validate(
                attributes: attributes,
                contentState: state
            )
        } catch {
            status = .failed(message: "This update was rejected because its state was not safe to display.")
            return .invalidPayload
        }

        let currentState = latestStates[identity] ?? activity.content.state
        switch AgentWorkActivityTransitionPolicy.decision(
            currentAttributes: activity.attributes,
            currentState: currentState,
            proposedAttributes: attributes,
            proposedState: state
        ) {
        case .apply:
            // ActivityKit's public content snapshot may lag a submitted update.
            // Keep the last accepted revision locally as the ordering authority
            // for this foreground controller instance.
            latestStates[identity] = state
            await activity.update(Self.content(state: state, now: now))
            publish(activity: activity, stateOverride: state)
            return .applied
        case .noOp:
            return .noOp
        case .ignoreOlder:
            return .ignoredOlder
        case .identityMismatch:
            return .identityMismatch
        case .sameRevisionConflict:
            status = .failed(message: "A conflicting Agent update was stopped for review.")
            return .sameRevisionConflict
        case .terminalRegression:
            status = .failed(message: "A late update could not replace the completed Agent result.")
            return .terminalRegression
        }
    }

    func end(
        identity: AgentWorkActivityIdentity,
        dismissImmediately: Bool = true,
        now: Date = Date()
    ) async -> AgentWorkActivityControllerResult {
        guard #available(iOS 16.2, *) else {
            status = .unavailable
            return .unavailable
        }
        guard let activity = exactActivity(identity: identity) else {
            latestStates.removeValue(forKey: identity)
            removePersistedRecord(matching: identity)
            status = .idle
            return .missing
        }
        await activity.end(
            ActivityContent(state: activity.content.state, staleDate: now),
            dismissalPolicy: dismissImmediately ? .immediate : .default
        )
        latestStates.removeValue(forKey: identity)
        removePersistedRecord(matching: identity)
        status = .idle
        return .applied
    }

    @discardableResult
    func restoreOrCleanExpired(
        now: Date = Date()
    ) async -> AgentWorkActivitySnapshot? {
        guard let record = loadRecord() else {
            status = .idle
            return nil
        }
        guard record.expiresAt > now else {
            _ = await end(identity: record.identity, now: now)
            return nil
        }
        guard #available(iOS 16.2, *),
              let activity = exactActivity(identity: record.identity) else {
            latestStates.removeValue(forKey: record.identity)
            removePersistedRecord(matching: record.identity)
            status = .idle
            return nil
        }
        let systemState = activity.content.state
        let authoritativeState: AgentWorkActivityAttributes.ContentState
        if let localState = latestStates[record.identity],
           localState.eventRevision >= systemState.eventRevision {
            // Foreground restoration can race a just-submitted update. Prefer
            // the already accepted local revision when ActivityKit's public
            // snapshot is older or has not converged yet.
            authoritativeState = localState
        } else {
            authoritativeState = systemState
        }
        latestStates[record.identity] = authoritativeState
        publish(activity: activity, stateOverride: authoritativeState)
        return AgentWorkActivitySnapshot(
            identity: record.identity,
            state: authoritativeState
        )
    }

    func endActivities(scopeID: String, now: Date = Date()) async {
        guard #available(iOS 16.2, *) else { return }
        let scoped = Activity<AgentWorkActivityAttributes>.activities.filter {
            $0.attributes.scopeID == scopeID
        }
        for activity in scoped {
            await activity.end(
                ActivityContent(state: activity.content.state, staleDate: now),
                dismissalPolicy: .immediate
            )
        }
        latestStates = latestStates.filter { $0.key.scopeID != scopeID }
        if loadRecord()?.identity.scopeID == scopeID {
            defaults.removeObject(forKey: Self.recordKey)
        }
        status = .idle
    }

    func endAllActivities(now: Date = Date()) async {
        guard #available(iOS 16.2, *) else { return }
        for activity in Activity<AgentWorkActivityAttributes>.activities {
            await activity.end(
                ActivityContent(state: activity.content.state, staleDate: now),
                dismissalPolicy: .immediate
            )
        }
        latestStates.removeAll()
        defaults.removeObject(forKey: Self.recordKey)
        status = .idle
    }

    func validatesActiveIdentity(_ identity: AgentWorkActivityIdentity) -> Bool {
        activeSnapshot(identity: identity) != nil
    }

    func activeSnapshot(
        identity: AgentWorkActivityIdentity
    ) -> AgentWorkActivitySnapshot? {
        guard #available(iOS 16.2, *),
              let activity = exactActivity(identity: identity) else {
            return nil
        }
        return AgentWorkActivitySnapshot(
            identity: identity,
            state: latestStates[identity] ?? activity.content.state
        )
    }

    @available(iOS 16.2, *)
    private func exactActivity(
        identity: AgentWorkActivityIdentity
    ) -> Activity<AgentWorkActivityAttributes>? {
        Activity<AgentWorkActivityAttributes>.activities.first {
            $0.attributes.scopeID == identity.scopeID
                && $0.attributes.taskID == identity.taskID
                && $0.attributes.activityInstanceID == identity.activityInstanceID
        }
    }

    @available(iOS 16.2, *)
    private func publish(
        activity: Activity<AgentWorkActivityAttributes>,
        stateOverride: AgentWorkActivityAttributes.ContentState? = nil
    ) {
        let state = stateOverride ?? activity.content.state
        do {
            status = .active(
                identity: Self.identity(for: activity.attributes),
                state: try AgentWorkActivityProjector.project(state)
            )
        } catch {
            status = .failed(message: "The Agent state could not be shown safely.")
        }
    }

    private func persist(identity: AgentWorkActivityIdentity, expiresAt: Date) {
        guard let data = try? JSONEncoder().encode(
            FixtureRecord(identity: identity, expiresAt: expiresAt)
        ) else { return }
        defaults.set(data, forKey: Self.recordKey)
    }

    private func loadRecord() -> FixtureRecord? {
        guard let data = defaults.data(forKey: Self.recordKey) else { return nil }
        return try? JSONDecoder().decode(FixtureRecord.self, from: data)
    }

    private func removePersistedRecord(matching identity: AgentWorkActivityIdentity) {
        guard loadRecord()?.identity == identity else { return }
        defaults.removeObject(forKey: Self.recordKey)
    }

    private static func attributes(
        for identity: AgentWorkActivityIdentity
    ) -> AgentWorkActivityAttributes {
        AgentWorkActivityAttributes(
            schemaVersion: AgentWorkActivityAttributes.currentSchemaVersion,
            scopeID: identity.scopeID,
            taskID: identity.taskID,
            activityInstanceID: identity.activityInstanceID
        )
    }

    private static func identity(
        for attributes: AgentWorkActivityAttributes
    ) -> AgentWorkActivityIdentity {
        AgentWorkActivityIdentity(
            scopeID: attributes.scopeID,
            taskID: attributes.taskID,
            activityInstanceID: attributes.activityInstanceID
        )
    }

    @available(iOS 16.2, *)
    private static func content(
        state: AgentWorkActivityAttributes.ContentState,
        now: Date
    ) -> ActivityContent<AgentWorkActivityAttributes.ContentState> {
        ActivityContent(
            state: state,
            staleDate: now.addingTimeInterval(staleInterval)
        )
    }
}
