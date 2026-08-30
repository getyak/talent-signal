import Combine
import Foundation

@MainActor
final class AgentTaskProjectionStore: ObservableObject {
    enum Phase: Equatable {
        case idle
        case loading
        case ready
        case reconciling
        case cursorGap(expected: Int, received: Int)
        case failed(String)
    }

    @Published private(set) var phase: Phase = .idle
    @Published private(set) var task: AgentTaskProjection?

    let workspaceID: String
    let pursuitID: String
    private let service: AgentTaskServing

    init(workspaceID: String, pursuitID: String, service: AgentTaskServing) {
        self.workspaceID = workspaceID
        self.pursuitID = pursuitID
        self.service = service
    }

    func discover(includeHistory: Bool = true) async {
        phase = .loading
        do {
            let tasks = try await service.list(
                pursuitID: pursuitID,
                includeHistory: includeHistory
            )
            guard tasks.allSatisfy({
                $0.workspaceID == workspaceID && $0.pursuitID == pursuitID
            }) else {
                throw AgentTaskClientError.scopeMismatch
            }
            task = tasks.first
            phase = .ready
        } catch {
            phase = .failed(Self.message(for: error))
        }
    }

    func refresh() async {
        guard let task else {
            await discover()
            return
        }
        phase = .reconciling
        do {
            let snapshot = try await service.get(taskID: task.id)
            try accept(snapshot)
            phase = .ready
        } catch {
            phase = .failed(Self.message(for: error))
        }
    }

    func consume(_ events: [AgentTaskEvent]) async {
        guard let task else {
            await discover()
            return
        }
        var expected = task.latestSequence + 1
        for event in events {
            guard event.workspaceID == workspaceID,
                  event.taskID == task.id else {
                phase = .failed("Agent Task event scope did not match this workspace.")
                return
            }
            guard event.taskSequence == expected else {
                phase = .cursorGap(expected: expected, received: event.taskSequence)
                await refresh()
                return
            }
            expected += 1
        }
        if !events.isEmpty {
            phase = .reconciling
            await refresh()
        }
    }

    func accept(_ snapshot: AgentTaskProjection) throws {
        guard snapshot.workspaceID == workspaceID,
              snapshot.pursuitID == pursuitID,
              snapshot.externalEffects.isEmpty else {
            throw AgentTaskClientError.scopeMismatch
        }
        if let current = task, snapshot.id == current.id {
            guard snapshot.taskRevision >= current.taskRevision,
                  snapshot.latestSequence >= current.latestSequence else {
                return
            }
        }
        task = snapshot
    }

    private static func message(for error: Error) -> String {
        if case let AgentTaskClientError.backend(_, message) = error {
            return message
        }
        return "Agent Task could not be verified from the canonical workspace."
    }
}
