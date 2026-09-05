import Foundation

protocol AgentTaskServing {
    func list(pursuitID: String, includeHistory: Bool) async throws -> [AgentTaskProjection]
    func get(taskID: String) async throws -> AgentTaskProjection
    func events(taskID: String, afterSequence: Int) async throws -> [AgentTaskEvent]
}

enum AgentTaskClientError: Error, Equatable {
    case invalidResponse
    case contractMismatch
    case scopeMismatch
    case externalEffectBoundaryViolated
    case backend(code: String, message: String)
}

actor URLAgentTaskClient: AgentTaskServing {
    private let session: TalentSignalSession
    private let urlSession: URLSession

    init(session: TalentSignalSession, urlSession: URLSession = TalentSignalNetworking.session) {
        self.session = session
        self.urlSession = urlSession
    }

    func list(pursuitID: String, includeHistory: Bool) async throws -> [AgentTaskProjection] {
        let state = includeHistory ? "all" : "active"
        let envelope: AgentTaskListEnvelope = try await request(
            path: "v1/pursuits/\(pursuitID)/agent-tasks?state=\(state)"
        )
        guard envelope.contractVersion == TalentSignalAPIContract.version,
              envelope.workspaceID == session.account.id,
              envelope.tasks.allSatisfy({
                  $0.workspaceID == session.account.id &&
                  $0.pursuitID == pursuitID &&
                  $0.externalEffects.isEmpty
              }) else {
            throw envelope.tasks.contains(where: { !$0.externalEffects.isEmpty })
                ? AgentTaskClientError.externalEffectBoundaryViolated
                : AgentTaskClientError.scopeMismatch
        }
        return envelope.tasks
    }

    func get(taskID: String) async throws -> AgentTaskProjection {
        let envelope: AgentTaskEnvelope = try await request(
            path: "v1/agent-tasks/\(taskID)"
        )
        guard envelope.contractVersion == TalentSignalAPIContract.version else {
            throw AgentTaskClientError.contractMismatch
        }
        guard envelope.task.id == taskID,
              envelope.task.workspaceID == session.account.id else {
            throw AgentTaskClientError.scopeMismatch
        }
        guard envelope.task.externalEffects.isEmpty else {
            throw AgentTaskClientError.externalEffectBoundaryViolated
        }
        return envelope.task
    }

    func events(taskID: String, afterSequence: Int) async throws -> [AgentTaskEvent] {
        let envelope: AgentTaskEventsEnvelope = try await request(
            path: "v1/agent-tasks/\(taskID)/events?after=\(max(0, afterSequence))"
        )
        guard envelope.contractVersion == TalentSignalAPIContract.version,
              envelope.taskID == taskID,
              envelope.events.allSatisfy({
                  $0.workspaceID == session.account.id && $0.taskID == taskID
              }) else {
            throw AgentTaskClientError.scopeMismatch
        }
        return envelope.events
    }

    private func request<Response: Decodable>(path: String) async throws -> Response {
        var request = URLRequest(url: session.baseURL.appending(path: path))
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "accept")
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "authorization")
        let (data, response) = try await urlSession.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw AgentTaskClientError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let error = try? JSONDecoder().decode(AgentTaskErrorEnvelope.self, from: data)
            throw AgentTaskClientError.backend(
                code: error?.error.code ?? "HTTP_\(http.statusCode)",
                message: error?.error.message ?? "The Agent Task readback was rejected."
            )
        }
        do {
            return try JSONDecoder().decode(Response.self, from: data)
        } catch {
            throw AgentTaskClientError.invalidResponse
        }
    }
}

private struct AgentTaskEnvelope: Decodable {
    let contractVersion: String
    let task: AgentTaskProjection

    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case task
    }
}

private struct AgentTaskListEnvelope: Decodable {
    let contractVersion: String
    let workspaceID: String
    let tasks: [AgentTaskProjection]

    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case workspaceID = "workspace_id"
        case tasks
    }
}

private struct AgentTaskEventsEnvelope: Decodable {
    let contractVersion: String
    let taskID: String
    let events: [AgentTaskEvent]

    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case taskID = "task_id"
        case events
    }
}

private struct AgentTaskErrorEnvelope: Decodable {
    struct Detail: Decodable {
        let code: String
        let message: String
    }

    let error: Detail
}
