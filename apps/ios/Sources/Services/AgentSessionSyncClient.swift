import Foundation

struct AgentSessionRemoteRecord: Decodable {
    let sessionID: UUID
    let revision: Int
    let updatedAt: Date
    let expiresAt: Date
    let deletedAt: Date?
    let payload: PersistedAgentSession?
    enum CodingKeys: String, CodingKey {
        case sessionID = "session_id", revision, updatedAt = "updated_at"
        case expiresAt = "expires_at", deletedAt = "deleted_at", payload
    }
}

struct AgentSessionRemotePage: Decodable {
    let contractVersion: String
    let sessions: [AgentSessionRemoteRecord]
    let complete: Bool
    let nextCursor: String?
    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version", sessions, complete, nextCursor = "next_cursor"
    }
}

protocol AgentSessionSyncServing {
    func list(after: String?) async throws -> AgentSessionRemotePage
    func put(_ payload: PersistedAgentSession, expectedRevision: Int, idempotencyKey: UUID) async throws -> AgentSessionRemoteRecord
    func delete(id: UUID, expectedRevision: Int, idempotencyKey: UUID) async throws -> AgentSessionRemoteRecord
}

enum AgentSessionSyncError: LocalizedError {
    case conflict
    case invalidResponse
    case unavailable(Int)
    case transcriptConflict
    var errorDescription: String? {
        switch self {
        case .conflict: return "This session changed on another device. Sync again to keep both updates."
        case .invalidResponse: return "Session sync returned an unreadable response. Your local history is preserved."
        case .unavailable: return "Session sync is unavailable. Your changes remain on this device."
        case .transcriptConflict: return "Two devices have incompatible versions of this message. Both saved histories need review."
        }
    }
}

struct AgentSessionSyncClient: AgentSessionSyncServing {
    let baseURL: URL
    let bearerToken: String
    var session: URLSession = TalentSignalNetworking.session

    func list(after: String? = nil) async throws -> AgentSessionRemotePage {
        var components = URLComponents(url: baseURL.appending(path: "v1/agent-sessions"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "limit", value: "50")]
        if let after { components.queryItems?.append(URLQueryItem(name: "after", value: after)) }
        let page: AgentSessionRemotePage = try await request(url: components.url!, method: "GET", body: Optional<DeleteBody>.none)
        guard page.contractVersion == TalentSignalAPIContract.version,
              page.complete || page.nextCursor != nil else { throw AgentSessionSyncError.invalidResponse }
        return page
    }

    func put(_ payload: PersistedAgentSession, expectedRevision: Int, idempotencyKey: UUID) async throws -> AgentSessionRemoteRecord {
        let response: Envelope = try await request(
            url: baseURL.appending(path: "v1/agent-sessions/\(payload.id.uuidString.lowercased())"), method: "PUT",
            body: PutBody(expectedRevision: expectedRevision, idempotencyKey: idempotencyKey, payload: payload)
        )
        guard response.contractVersion == TalentSignalAPIContract.version, response.session.sessionID == payload.id else {
            throw AgentSessionSyncError.invalidResponse
        }
        return response.session
    }

    func delete(id: UUID, expectedRevision: Int, idempotencyKey: UUID) async throws -> AgentSessionRemoteRecord {
        let response: Envelope = try await request(
            url: baseURL.appending(path: "v1/agent-sessions/\(id.uuidString.lowercased())"), method: "DELETE",
            body: DeleteBody(expectedRevision: expectedRevision, idempotencyKey: idempotencyKey)
        )
        guard response.contractVersion == TalentSignalAPIContract.version, response.session.sessionID == id,
              response.session.payload == nil else { throw AgentSessionSyncError.invalidResponse }
        return response.session
    }

    private struct Envelope: Decodable {
        let contractVersion: String
        let session: AgentSessionRemoteRecord
        enum CodingKeys: String, CodingKey { case contractVersion = "contract_version", session }
    }
    private struct PutBody: Encodable {
        let expectedRevision: Int
        let idempotencyKey: UUID
        let payload: PersistedAgentSession
        enum CodingKeys: String, CodingKey { case expectedRevision = "expected_revision", idempotencyKey = "idempotency_key", payload }
    }
    private struct DeleteBody: Encodable {
        let expectedRevision: Int
        let idempotencyKey: UUID
        enum CodingKeys: String, CodingKey { case expectedRevision = "expected_revision", idempotencyKey = "idempotency_key" }
    }
    private func request<Response: Decodable, Body: Encodable>(url: URL, method: String, body: Body?) async throws -> Response {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.cachePolicy = .reloadIgnoringLocalCacheData
        if let body {
            request.httpBody = try JSONEncoder.agentSession.encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await TalentSignalNetworking.data(for: request, using: session)
        guard let http = response as? HTTPURLResponse else { throw AgentSessionSyncError.invalidResponse }
        if http.statusCode == 409 { throw AgentSessionSyncError.conflict }
        guard (200...299).contains(http.statusCode) else { throw AgentSessionSyncError.unavailable(http.statusCode) }
        return try JSONDecoder.agentSession.decode(Response.self, from: data)
    }
}
