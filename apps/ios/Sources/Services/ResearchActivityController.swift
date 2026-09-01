import ActivityKit
import Combine
import Foundation

enum ResearchActivityControllerResult: Equatable {
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

enum ResearchActivityControllerStatus: Equatable {
    case idle
    case unavailable
    case active(
        identity: ResearchActivityIdentity,
        state: ResearchActivityViewState
    )
    case failed(message: String)
}

struct ResearchActivitySnapshot: Equatable {
    let identity: ResearchActivityIdentity
    let state: ResearchActivityAttributes.ContentState
}

@MainActor
protocol ResearchActivityControlling: AnyObject {
    func startSyntheticResearch(
        scopeID: String,
        taskID: String,
        now: Date,
        fixtureLifetime: TimeInterval
    ) async -> ResearchActivityIdentity?

    func update(
        identity: ResearchActivityIdentity,
        state: ResearchActivityAttributes.ContentState,
        now: Date
    ) async -> ResearchActivityControllerResult

    func end(
        identity: ResearchActivityIdentity,
        dismissImmediately: Bool,
        now: Date
    ) async -> ResearchActivityControllerResult

    func restoreOrCleanExpired(now: Date) async -> ResearchActivitySnapshot?
    func activeSnapshot(
        identity: ResearchActivityIdentity
    ) -> ResearchActivitySnapshot?
}

@MainActor
final class ResearchActivityController: ObservableObject, ResearchActivityControlling {
    static let shared = ResearchActivityController()

    @Published private(set) var status: ResearchActivityControllerStatus = .idle

    private struct FixtureRecord: Codable, Equatable {
        let identity: ResearchActivityIdentity
        let expiresAt: Date
    }

    private static let recordKey = "talent-signal.synthetic-research.fixture.v1"
    private static let staleInterval: TimeInterval = 8 * 60
    private let defaults: UserDefaults
    private var latestStates: [
        ResearchActivityIdentity: ResearchActivityAttributes.ContentState
    ] = [:]

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func startSyntheticResearch(
        scopeID: String = "debug.local",
        taskID: String = "task.synthetic-research",
        now: Date = Date(),
        fixtureLifetime: TimeInterval = 30 * 60
    ) async -> ResearchActivityIdentity? {
        guard #available(iOS 16.2, *),
              ActivityAuthorizationInfo().areActivitiesEnabled else {
            status = .unavailable
            return nil
        }

        let matching = Activity<ResearchActivityAttributes>.activities.filter {
            $0.attributes.scopeID == scopeID && $0.attributes.taskID == taskID
        }

        if let record = loadRecord(),
           record.expiresAt > now,
           record.identity.scopeID == scopeID,
           record.identity.taskID == taskID,
           let reusable = matching.first(where: {
               Self.identity(for: $0.attributes) == record.identity
                   && !$0.content.state.execution.isTerminal
           }) {
            for duplicate in matching where duplicate.id != reusable.id {
                await duplicate.end(duplicate.content, dismissalPolicy: .immediate)
                latestStates.removeValue(
                    forKey: Self.identity(for: duplicate.attributes)
                )
            }
            let state = latestStates[record.identity] ?? reusable.content.state
            do {
                try ResearchActivityPayloadContract.validate(
                    attributes: reusable.attributes,
                    contentState: state
                )
                latestStates[record.identity] = state
                publish(activity: reusable, stateOverride: state)
                return record.identity
            } catch {
                await reusable.end(reusable.content, dismissalPolicy: .immediate)
                latestStates.removeValue(forKey: record.identity)
                removePersistedRecord(matching: record.identity)
            }
        }

        for prior in matching {
            await prior.end(prior.content, dismissalPolicy: .immediate)
            latestStates.removeValue(forKey: Self.identity(for: prior.attributes))
        }

        let identity = ResearchActivityIdentity(
            scopeID: scopeID,
            taskID: taskID,
            activityInstanceID: UUID().uuidString.lowercased()
        )
        let attributes = Self.attributes(for: identity)
        let state = ResearchActivityAttributes.ContentState(
            execution: .running,
            stage: .readingApprovedPages,
            eventRevision: 1,
            updatedAt: now
        )

        do {
            try ResearchActivityPayloadContract.validate(
                attributes: attributes,
                contentState: state
            )
            let activity = try Activity.request(
                attributes: attributes,
                content: Self.content(state: state, now: now),
                pushType: nil
            )
            latestStates[identity] = state
            persist(
                identity: identity,
                expiresAt: now.addingTimeInterval(fixtureLifetime)
            )
            publish(activity: activity)
            return identity
        } catch {
            status = .failed(
                message: "The research Live Activity could not start. The Debug showcase remains available in the App."
            )
            return nil
        }
    }

    func update(
        identity: ResearchActivityIdentity,
        state: ResearchActivityAttributes.ContentState,
        now: Date = Date()
    ) async -> ResearchActivityControllerResult {
        guard #available(iOS 16.2, *) else {
            status = .unavailable
            return .unavailable
        }
        guard let activity = exactActivity(identity: identity) else {
            return .missing
        }
        let attributes = Self.attributes(for: identity)
        do {
            try ResearchActivityPayloadContract.validate(
                attributes: attributes,
                contentState: state
            )
        } catch {
            status = .failed(
                message: "The research update was rejected because its state was not safe to display."
            )
            return .invalidPayload
        }

        let currentState = latestStates[identity] ?? activity.content.state
        switch ResearchActivityTransitionPolicy.decision(
            currentAttributes: activity.attributes,
            currentState: currentState,
            proposedAttributes: attributes,
            proposedState: state
        ) {
        case .apply:
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
            status = .failed(message: "A conflicting research update was stopped.")
            return .sameRevisionConflict
        case .terminalRegression:
            status = .failed(
                message: "A late update could not replace the completed research result."
            )
            return .terminalRegression
        }
    }

    func end(
        identity: ResearchActivityIdentity,
        dismissImmediately: Bool = true,
        now: Date = Date()
    ) async -> ResearchActivityControllerResult {
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
    ) async -> ResearchActivitySnapshot? {
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
        let authoritativeState: ResearchActivityAttributes.ContentState
        if let localState = latestStates[record.identity],
           localState.eventRevision >= systemState.eventRevision {
            authoritativeState = localState
        } else {
            authoritativeState = systemState
        }
        latestStates[record.identity] = authoritativeState
        publish(activity: activity, stateOverride: authoritativeState)
        return ResearchActivitySnapshot(
            identity: record.identity,
            state: authoritativeState
        )
    }

    func activeSnapshot(
        identity: ResearchActivityIdentity
    ) -> ResearchActivitySnapshot? {
        guard #available(iOS 16.2, *),
              let activity = exactActivity(identity: identity) else {
            return nil
        }
        return ResearchActivitySnapshot(
            identity: identity,
            state: latestStates[identity] ?? activity.content.state
        )
    }

    func endAllActivities(now: Date = Date()) async {
        guard #available(iOS 16.2, *) else { return }
        for activity in Activity<ResearchActivityAttributes>.activities {
            await activity.end(
                ActivityContent(state: activity.content.state, staleDate: now),
                dismissalPolicy: .immediate
            )
        }
        latestStates.removeAll()
        defaults.removeObject(forKey: Self.recordKey)
        status = .idle
    }

    @available(iOS 16.2, *)
    private func exactActivity(
        identity: ResearchActivityIdentity
    ) -> Activity<ResearchActivityAttributes>? {
        Activity<ResearchActivityAttributes>.activities.first {
            $0.attributes.scopeID == identity.scopeID
                && $0.attributes.taskID == identity.taskID
                && $0.attributes.activityInstanceID == identity.activityInstanceID
        }
    }

    @available(iOS 16.2, *)
    private func publish(
        activity: Activity<ResearchActivityAttributes>,
        stateOverride: ResearchActivityAttributes.ContentState? = nil
    ) {
        let state = stateOverride ?? activity.content.state
        do {
            status = .active(
                identity: Self.identity(for: activity.attributes),
                state: try ResearchActivityProjector.project(state)
            )
        } catch {
            status = .failed(message: "The research state could not be shown safely.")
        }
    }

    private func persist(identity: ResearchActivityIdentity, expiresAt: Date) {
        guard let data = try? JSONEncoder().encode(
            FixtureRecord(identity: identity, expiresAt: expiresAt)
        ) else { return }
        defaults.set(data, forKey: Self.recordKey)
    }

    private func loadRecord() -> FixtureRecord? {
        guard let data = defaults.data(forKey: Self.recordKey) else { return nil }
        return try? JSONDecoder().decode(FixtureRecord.self, from: data)
    }

    private func removePersistedRecord(
        matching identity: ResearchActivityIdentity
    ) {
        guard loadRecord()?.identity == identity else { return }
        defaults.removeObject(forKey: Self.recordKey)
    }

    private static func attributes(
        for identity: ResearchActivityIdentity
    ) -> ResearchActivityAttributes {
        ResearchActivityAttributes(
            schemaVersion: ResearchActivityAttributes.currentSchemaVersion,
            scopeID: identity.scopeID,
            taskID: identity.taskID,
            activityInstanceID: identity.activityInstanceID
        )
    }

    private static func identity(
        for attributes: ResearchActivityAttributes
    ) -> ResearchActivityIdentity {
        ResearchActivityIdentity(
            scopeID: attributes.scopeID,
            taskID: attributes.taskID,
            activityInstanceID: attributes.activityInstanceID
        )
    }

    @available(iOS 16.2, *)
    private static func content(
        state: ResearchActivityAttributes.ContentState,
        now: Date
    ) -> ActivityContent<ResearchActivityAttributes.ContentState> {
        ActivityContent(
            state: state,
            staleDate: now.addingTimeInterval(staleInterval)
        )
    }
}
