import Foundation

protocol FixtureLoading {
    func load(from url: URL) async throws -> FixtureSuite
}

struct URLFixtureLoader: FixtureLoading {
    func load(from url: URL) async throws -> FixtureSuite {
        guard Self.isLoopback(url) else {
            throw FixtureSyncError.loopbackOnly
        }

        let (data, response) = try await URLSession.shared.data(from: url)
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw FixtureSyncError.unsuccessfulResponse
        }
        guard data.count <= 2_000_000 else {
            throw FixtureSyncError.responseTooLarge
        }

        do {
            return try JSONDecoder().decode(FixtureSuite.self, from: data).validated()
        } catch let error as FixtureValidationError {
            throw error
        } catch {
            throw FixtureSyncError.invalidJSON
        }
    }

    static func isLoopback(_ url: URL) -> Bool {
        guard ["http", "https"].contains(url.scheme?.lowercased() ?? ""),
              let host = url.host?.lowercased() else {
            return false
        }
        return host == "localhost" || host == "127.0.0.1" || host == "::1"
    }
}

enum FixtureSyncError: LocalizedError, Equatable {
    case invalidAddress
    case loopbackOnly
    case unsuccessfulResponse
    case responseTooLarge
    case invalidJSON

    var errorDescription: String? {
        switch self {
        case .invalidAddress:
            return "Enter a complete localhost URL, including http:// and a port."
        case .loopbackOnly:
            return "This demo accepts fixture sync only from localhost or another loopback address."
        case .unsuccessfulResponse:
            return "The local fixture server did not return a successful response."
        case .responseTooLarge:
            return "The local fixture response is larger than the 2 MB demo limit."
        case .invalidJSON:
            return "The local response is not a valid candidate-momentum fixture suite."
        }
    }
}

protocol BackendWorkspaceLoading {
    func loadWorkspace(from baseURL: URL, fixtureCaseID: String) async throws -> BackendWorkspaceSnapshot
}

struct URLBackendWorkspaceLoader: BackendWorkspaceLoading {
    func loadWorkspace(from baseURL: URL, fixtureCaseID: String) async throws -> BackendWorkspaceSnapshot {
        guard URLFixtureLoader.isLoopback(baseURL) else {
            throw FixtureSyncError.loopbackOnly
        }

        var loginRequest = URLRequest(url: baseURL.appending(path: "v1/auth/simulated-login"))
        loginRequest.httpMethod = "POST"
        loginRequest.setValue("application/json", forHTTPHeaderField: "content-type")
        loginRequest.httpBody = try JSONEncoder().encode(
            BackendLoginRequest(
                accountSlug: "fixture-alpha",
                userEmail: "reviewer@alpha.local",
                clientLabel: "ios-simulator"
            )
        )
        let (loginData, loginResponse) = try await URLSession.shared.data(for: loginRequest)
        guard let loginHTTPResponse = loginResponse as? HTTPURLResponse,
              (200...299).contains(loginHTTPResponse.statusCode) else {
            throw FixtureSyncError.unsuccessfulResponse
        }
        let login = try JSONDecoder().decode(BackendLoginResponse.self, from: loginData)

        var components = URLComponents(
            url: baseURL.appending(path: "v1/workspace-review"),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = [URLQueryItem(name: "fixture_case_id", value: fixtureCaseID)]
        guard let workspaceURL = components?.url else {
            throw FixtureSyncError.invalidAddress
        }
        var workspaceRequest = URLRequest(url: workspaceURL)
        workspaceRequest.setValue("Bearer \(login.accessToken)", forHTTPHeaderField: "authorization")
        workspaceRequest.setValue("application/json", forHTTPHeaderField: "accept")
        let (workspaceData, workspaceResponse) = try await URLSession.shared.data(for: workspaceRequest)
        guard let workspaceHTTPResponse = workspaceResponse as? HTTPURLResponse,
              (200...299).contains(workspaceHTTPResponse.statusCode) else {
            throw FixtureSyncError.unsuccessfulResponse
        }
        guard workspaceData.count <= 2_000_000 else {
            throw FixtureSyncError.responseTooLarge
        }
        return try JSONDecoder().decode(BackendWorkspaceSnapshot.self, from: workspaceData)
    }
}

private struct BackendLoginRequest: Encodable {
    let accountSlug: String
    let userEmail: String
    let clientLabel: String

    enum CodingKeys: String, CodingKey {
        case accountSlug = "account_slug"
        case userEmail = "user_email"
        case clientLabel = "client_label"
    }
}

private struct BackendLoginResponse: Decodable {
    let accessToken: String

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
    }
}

struct BackendWorkspaceSnapshot: Decodable, Equatable {
    let contractVersion: String
    let dataClassification: String
    let accountID: String
    let accountSlug: String
    let subject: Identity
    let assignment: Identity
    let capture: Capture
    let analysis: Analysis
    let confirmedState: ConfirmedState
    let auditCursor: Int

    struct Identity: Decodable, Equatable {
        let id: String
        let displayLabel: String

        enum CodingKeys: String, CodingKey {
            case id
            case displayLabel = "display_label"
        }
    }

    struct Capture: Decodable, Equatable {
        let id: String
        let fixtureCaseID: String?
        let source: Source
        let messages: [Message]

        enum CodingKeys: String, CodingKey {
            case id
            case fixtureCaseID = "fixture_case_id"
            case source
            case messages
        }
    }

    struct Source: Decodable, Equatable {
        let kind: String
        let capturedAt: String
        let sourceTimezone: String?
        let sourceLocator: String?

        enum CodingKeys: String, CodingKey {
            case kind
            case capturedAt = "captured_at"
            case sourceTimezone = "source_timezone"
            case sourceLocator = "source_locator"
        }
    }

    struct Message: Decodable, Equatable {
        let id: String
        let sourceMessageID: String
        let speaker: String
        let text: String?

        enum CodingKeys: String, CodingKey {
            case id
            case sourceMessageID = "source_message_id"
            case speaker
            case text
        }
    }

    struct Analysis: Decodable, Equatable {
        let disposition: FixtureDisposition
        let assertions: [Assertion]
        let action: Action?
    }

    struct Assertion: Decodable, Equatable {
        let id: String
        let field: String
        let status: AssertionStatus
        let reviewStatus: String
        let value: String?
        let evidenceID: String
        let evidenceQuote: String?

        enum CodingKeys: String, CodingKey {
            case id
            case field
            case status
            case reviewStatus = "review_status"
            case value
            case evidenceID = "evidence_id"
            case evidenceQuote = "evidence_quote"
        }
    }

    struct Action: Decodable, Equatable {
        let id: String
        let type: String
        let owner: String?
        let target: String
        let reason: String
        let due: String
        let evidenceIDs: [String]

        enum CodingKeys: String, CodingKey {
            case id
            case type
            case owner
            case target
            case reason
            case due
            case evidenceIDs = "evidence_ids"
        }
    }

    struct ConfirmedState: Decodable, Equatable {
        let id: String
        let version: Int
        let assertions: [ConfirmedAssertion]
    }

    struct ConfirmedAssertion: Decodable, Equatable {
        let id: String
        let field: String
        let value: String
        let status: String
        let evidenceMessageID: String

        enum CodingKeys: String, CodingKey {
            case id
            case field
            case value
            case status
            case evidenceMessageID = "evidence_message_id"
        }
    }

    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case dataClassification = "data_classification"
        case accountID = "account_id"
        case accountSlug = "account_slug"
        case subject
        case assignment
        case capture
        case analysis
        case confirmedState = "confirmed_state"
        case auditCursor = "audit_cursor"
    }

    func fixtureCase() throws -> FixtureCase {
        let messages = capture.messages.compactMap { message -> FixtureMessage? in
            guard let text = message.text else { return nil }
            return FixtureMessage(
                id: message.sourceMessageID,
                speaker: message.speaker,
                text: text
            )
        }
        let messageIDByEvidenceID = Dictionary(
            uniqueKeysWithValues: capture.messages.map { ($0.id, $0.sourceMessageID) }
        )
        let assertions = analysis.assertions.map { assertion in
            FixtureAssertion(
                field: assertion.field,
                status: assertion.status,
                value: assertion.value ?? "",
                evidenceMessageID: messageIDByEvidenceID[assertion.evidenceID] ?? "missing",
                evidenceQuote: assertion.evidenceQuote ?? ""
            )
        }
        let action = analysis.action.map { action in
            FixtureAction(
                type: action.type,
                owner: "recruiter",
                target: action.target,
                reason: action.reason,
                due: action.due,
                evidenceMessageIDs: action.evidenceIDs.compactMap {
                    messageIDByEvidenceID[$0]
                }
            )
        }
        guard capture.fixtureCaseID == "TS-CORE-01", messages.count == 1 else {
            throw FixtureSyncError.invalidJSON
        }
        return FixtureCase(
            id: "TS-CORE-01",
            title: "Deadline, competing offer, preference, and availability",
            context: FixtureContext(
                capturedAt: capture.source.capturedAt,
                sourceTimezone: capture.source.sourceTimezone,
                candidate: subject.displayLabel,
                assignment: assignment.displayLabel,
                notes: "Account-scoped canonical state read directly from the localhost backend.",
                priorState: nil,
                candidateOptions: nil,
                requestedOutput: nil
            ),
            messages: messages,
            expected: FixtureExpected(
                disposition: analysis.disposition,
                assertions: assertions,
                action: action,
                mustNot: [
                    "predict acceptance",
                    "convert availability into meeting consent",
                    "present proposed assertions as confirmed"
                ]
            )
        )
    }
}
