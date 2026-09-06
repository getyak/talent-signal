import Foundation

protocol LabWorkspaceServing {
    func list(using session: TalentSignalSession) async throws -> [LabWorkspace]
    func create(id: UUID, durationHours: Int, using session: TalentSignalSession) async throws -> LabWorkspace
    func read(id: UUID, using session: TalentSignalSession) async throws -> LabWorkspace
    func enter(workspaceID: UUID, entryID: UUID, accessToken: String,
               using session: TalentSignalSession) async throws -> LabWorkspaceEntry
    func leave(workspaceID: UUID, entryID: UUID,
               using session: TalentSignalSession) async throws -> LabWorkspaceEntry
    func stop(workspaceID: UUID, stopID: UUID,
              using session: TalentSignalSession) async throws -> LabWorkspace
}

actor URLLabWorkspaceClient: LabWorkspaceServing {
    private let baseURL: URL
    private let network: URLSession

    init(baseURL: URL, network: URLSession = TalentSignalNetworking.session) {
        self.baseURL = baseURL
        self.network = network
    }

    func list(using session: TalentSignalSession) async throws -> [LabWorkspace] {
        let value: ListEnvelope = try await request(path: "v1/lab/workspaces", method: "GET",
            token: session, body: Optional<EmptyBody>.none)
        try validate(value.contractVersion)
        guard value.enabled else { throw LabWorkspaceError.unavailable }
        return value.workspaces
    }

    func create(id: UUID, durationHours: Int, using session: TalentSignalSession) async throws -> LabWorkspace {
        guard [1, 4, 24].contains(durationHours) else { throw LabWorkspaceError.invalidResponse }
        let value: WorkspaceEnvelope = try await request(path: "v1/lab/workspaces", method: "POST",
            token: session, body: CreateBody(id: id, durationHours: durationHours))
        try validate(value.contractVersion)
        guard value.workspace.id == id else { throw LabWorkspaceError.invalidResponse }
        return value.workspace
    }

    func read(id: UUID, using session: TalentSignalSession) async throws -> LabWorkspace {
        let value: WorkspaceEnvelope = try await request(path: "v1/lab/workspaces/\(id.uuidString.lowercased())",
            method: "GET", token: session, body: Optional<EmptyBody>.none)
        try validate(value.contractVersion)
        guard value.workspace.id == id else { throw LabWorkspaceError.invalidResponse }
        return value.workspace
    }

    func enter(workspaceID: UUID, entryID: UUID, accessToken: String,
               using session: TalentSignalSession) async throws -> LabWorkspaceEntry {
        let value: EntryEnvelope = try await request(
            path: "v1/lab/workspaces/\(workspaceID.uuidString.lowercased())/entries", method: "POST",
            token: session, body: EntryBody(id: entryID, accessToken: accessToken))
        try validate(value.contractVersion)
        guard value.entry.id == entryID, value.entry.workspaceID == workspaceID else {
            throw LabWorkspaceError.invalidResponse
        }
        return value.entry
    }

    func leave(workspaceID: UUID, entryID: UUID,
               using session: TalentSignalSession) async throws -> LabWorkspaceEntry {
        let value: EntryEnvelope = try await request(
            path: "v1/lab/workspaces/\(workspaceID.uuidString.lowercased())/entries/\(entryID.uuidString.lowercased())/leave",
            method: "POST", token: session, body: Optional<EmptyBody>.none)
        try validate(value.contractVersion)
        guard value.entry.id == entryID, value.entry.workspaceID == workspaceID,
              value.entry.state != .active else { throw LabWorkspaceError.invalidResponse }
        return value.entry
    }

    func stop(workspaceID: UUID, stopID: UUID,
              using session: TalentSignalSession) async throws -> LabWorkspace {
        let value: WorkspaceEnvelope = try await request(
            path: "v1/lab/workspaces/\(workspaceID.uuidString.lowercased())/stop", method: "POST",
            token: session, body: StopBody(id: stopID))
        try validate(value.contractVersion)
        guard value.workspace.id == workspaceID, value.workspace.stopID == stopID,
              value.workspace.state != .active else { throw LabWorkspaceError.invalidResponse }
        return value.workspace
    }

    private func request<Response: Decodable, Body: Encodable>(
        path: String, method: String, token session: TalentSignalSession, body: Body?
    ) async throws -> Response {
        guard RuntimeEndpoint.same(session.baseURL, baseURL), !session.accessToken.isEmpty else {
            throw LabWorkspaceError.authenticationRequired
        }
        var request = URLRequest(url: baseURL.appending(path: path))
        request.timeoutInterval = 20
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "accept")
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "authorization")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "content-type")
            request.httpBody = try JSONEncoder().encode(body)
        }
        let (data, response) = try await TalentSignalNetworking.data(for: request, using: network)
        guard let http = response as? HTTPURLResponse else { throw LabWorkspaceError.invalidResponse }
        guard (200...299).contains(http.statusCode) else {
            let envelope = try? JSONDecoder().decode(ErrorEnvelope.self, from: data)
            let code = envelope?.error.code ?? "HTTP_\(http.statusCode)"
            if http.statusCode == 401 { throw LabWorkspaceError.authenticationRequired }
            if http.statusCode == 410 || code == "LAB_TEST_WORKSPACE_CLOSED" { throw LabWorkspaceError.closed }
            throw LabWorkspaceError.backend(status: http.statusCode, code: code,
                message: envelope?.error.message ?? "The test-workspace request was rejected.")
        }
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        do { return try decoder.decode(Response.self, from: data) }
        catch { throw LabWorkspaceError.invalidResponse }
    }

    private func validate(_ contract: String) throws {
        guard contract == TalentSignalAPIContract.version else { throw LabWorkspaceError.contractMismatch }
    }
}

private struct EmptyBody: Encodable {}
private struct CreateBody: Encodable {
    let id: UUID
    let durationHours: Int
    enum CodingKeys: String, CodingKey { case id; case durationHours = "duration_hours" }
}
private struct EntryBody: Encodable {
    let id: UUID
    let accessToken: String
    enum CodingKeys: String, CodingKey { case id; case accessToken = "access_token" }
}
private struct StopBody: Encodable { let id: UUID }
private struct WorkspaceEnvelope: Decodable {
    let contractVersion: String
    let workspace: LabWorkspace
    enum CodingKeys: String, CodingKey { case contractVersion = "contract_version"; case workspace }
}
private struct ListEnvelope: Decodable {
    let contractVersion: String
    let enabled: Bool
    let workspaces: [LabWorkspace]
    enum CodingKeys: String, CodingKey { case contractVersion = "contract_version"; case enabled, workspaces }
}
private struct EntryEnvelope: Decodable {
    let contractVersion: String
    let entry: LabWorkspaceEntry
    enum CodingKeys: String, CodingKey { case contractVersion = "contract_version"; case entry }
}
private struct ErrorEnvelope: Decodable {
    struct Body: Decodable { let code: String; let message: String }
    let error: Body
}
