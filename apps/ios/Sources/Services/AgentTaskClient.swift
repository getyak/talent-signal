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
    private let transport: TalentSignalHTTPTransport

    init(session: TalentSignalSession, urlSession: URLSession = TalentSignalNetworking.session) {
        self.session = session
        transport = TalentSignalHTTPTransport(session: urlSession)
    }

    func list(pursuitID: String, includeHistory: Bool) async throws -> [AgentTaskProjection] {
        let state = includeHistory ? "all" : "active"
        let envelope: AgentTaskListEnvelope = try await request(
            path: "v1/pursuits/\(pursuitID)/agent-tasks",
            queryItems: [URLQueryItem(name: "state", value: state)]
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
            path: "v1/agent-tasks/\(taskID)/events",
            queryItems: [URLQueryItem(name: "after", value: String(max(0, afterSequence)))]
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

    private func request<Response: Decodable>(
        path: String,
        queryItems: [URLQueryItem] = []
    ) async throws -> Response {
        let response: TalentSignalHTTPResponse
        do {
            response = try await transport.send(
                baseURL: session.baseURL,
                path: path,
                queryItems: queryItems,
                method: "GET",
                bearerToken: session.accessToken,
                body: Optional<AgentTaskEmptyBody>.none
            )
        } catch TalentSignalHTTPTransportError.invalidResponse {
            throw AgentTaskClientError.invalidResponse
        }
        guard response.isSuccessful else {
            let error = try? JSONDecoder().decode(AgentTaskErrorEnvelope.self, from: response.data)
            throw AgentTaskClientError.backend(
                code: error?.error.code ?? "HTTP_\(response.statusCode)",
                message: error?.error.message ?? "The Agent Task readback was rejected."
            )
        }
        do {
            return try JSONDecoder().decode(Response.self, from: response.data)
        } catch {
            throw AgentTaskClientError.invalidResponse
        }
    }
}

private struct AgentTaskEmptyBody: Encodable {}

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
