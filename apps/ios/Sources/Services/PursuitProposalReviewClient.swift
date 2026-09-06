import Foundation

struct PursuitProposalReviewSession: Equatable {
    let baseURL: URL
    let proposalID: String
    let accessToken: String?

    init(baseURL: URL, proposalID: String, accessToken: String? = nil) {
        self.baseURL = baseURL
        self.proposalID = proposalID
        self.accessToken = accessToken
    }

    static func configured(arguments: [String]) -> PursuitProposalReviewSession? {
#if DEBUG
        guard let backend = value(after: "--backend-url", in: arguments),
              let baseURL = URL(string: backend),
              URLFixtureLoader.isLoopback(baseURL),
              let proposalID = value(after: "--pursuit-proposal-id", in: arguments),
              UUID(uuidString: proposalID) != nil else {
            return nil
        }
        return PursuitProposalReviewSession(
            baseURL: baseURL,
            proposalID: proposalID,
            accessToken: nil
        )
#else
        return nil
#endif
    }

    private static func value(after argument: String, in arguments: [String]) -> String? {
        guard let index = arguments.firstIndex(of: argument),
              arguments.indices.contains(index + 1) else {
            return nil
        }
        return arguments[index + 1]
    }
}

enum PursuitProposalReviewChoice: String, Codable, CaseIterable, Identifiable {
    case confirm
    case edit
    case reject
    case keepUnresolved = "keep_unresolved"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .confirm: "Confirm"
        case .edit: "Edit"
        case .reject: "Reject"
        case .keepUnresolved: "Unresolved"
        }
    }
}

struct PursuitProposalReviewDecision: Equatable {
    let itemID: String
    let choice: PursuitProposalReviewChoice
    let editedValue: JSONValue?
}

protocol PursuitProposalReviewServing {
    func loadProposal(id: String) async throws -> PursuitProposalSnapshot
    func review(
        proposal: PursuitProposalSnapshot,
        operationID: UUID,
        decisions: [PursuitProposalReviewDecision]
    ) async throws -> PursuitProposalReviewResult
    func readOperation(id: UUID) async throws -> PursuitOperationReadback
}

actor URLPursuitProposalReviewClient: PursuitProposalReviewServing {
    private let baseURL: URL
    private let session: URLSession
    private var accessToken: String?

    init(
        baseURL: URL,
        accessToken: String? = nil,
        session: URLSession = TalentSignalNetworking.session
    ) {
        self.baseURL = baseURL
        self.accessToken = accessToken
        self.session = session
    }

    func loadProposal(id: String) async throws -> PursuitProposalSnapshot {
        let response: PursuitProposalEnvelope = try await request(
            path: "v1/pursuit-proposals/\(id)",
            method: "GET",
            body: Optional<EmptyReviewBody>.none
        )
        return response.proposal
    }

    func review(
        proposal: PursuitProposalSnapshot,
        operationID: UUID,
        decisions: [PursuitProposalReviewDecision]
    ) async throws -> PursuitProposalReviewResult {
        let body = PursuitProposalReviewBody(
            operationID: operationID.uuidString.lowercased(),
            idempotencyKey: "ios:proposal-review:\(operationID.uuidString.lowercased())",
            baseRevision: proposal.baseRevision,
            reason: "The recruiter reviewed source, identity, before value, proposed value, reason, and effect in iOS.",
            decisions: decisions.map {
                .init(
                    itemID: $0.itemID,
                    decision: $0.choice.rawValue,
                    editedValue: $0.editedValue
                )
            }
        )
        let response: PursuitProposalReviewEnvelope = try await request(
            path: "v1/pursuit-proposals/\(proposal.id)/reviews",
            method: "POST",
            body: body
        )
        return PursuitProposalReviewResult(
            proposal: response.proposal,
            pursuit: response.pursuit,
            receipt: response.receipt
        )
    }

    func readOperation(id: UUID) async throws -> PursuitOperationReadback {
        try await request(
            path: "v1/operations/\(id.uuidString.lowercased())",
            method: "GET",
            body: Optional<EmptyReviewBody>.none
        )
    }

    private func request<Response: Decodable, Body: Encodable>(
        path: String,
        method: String,
        body: Body?
    ) async throws -> Response {
        guard accessToken != nil || URLFixtureLoader.isLoopback(baseURL) else {
            throw PursuitProposalReviewClientError.loopbackOnly
        }
        let token = try await authenticatedToken()
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "content-type")
            request.httpBody = try JSONEncoder().encode(body)
        }
        let (data, response) = try await TalentSignalNetworking.data(for: request, using: session)
        guard let http = response as? HTTPURLResponse else {
            throw PursuitProposalReviewClientError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let envelope = try? JSONDecoder().decode(PursuitReviewErrorEnvelope.self, from: data)
            if http.statusCode == 409 {
                throw PursuitProposalReviewClientError.conflict(
                    message: envelope?.error?.message ?? "The Pursuit changed before this review could apply."
                )
            }
            throw PursuitProposalReviewClientError.backend(
                code: envelope?.error?.code ?? "HTTP_\(http.statusCode)",
                message: envelope?.error?.message ?? "The backend rejected this review."
            )
        }
        do {
            return try JSONDecoder().decode(Response.self, from: data)
        } catch {
            throw PursuitProposalReviewClientError.invalidResponse
        }
    }

    private func authenticatedToken() async throws -> String {
        if let accessToken { return accessToken }
        var request = URLRequest(url: baseURL.appending(path: "v1/auth/simulated-login"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONEncoder().encode(
            PursuitReviewLoginBody(
                accountSlug: "fixture-alpha",
                userEmail: "recruiter@alpha.local",
                clientLabel: "ios-pursuit-proposal-review"
            )
        )
        let (data, response) = try await TalentSignalNetworking.data(for: request, using: session)
        guard let http = response as? HTTPURLResponse,
              (200...299).contains(http.statusCode),
              let login = try? JSONDecoder().decode(PursuitReviewLoginResponse.self, from: data) else {
            throw PursuitProposalReviewClientError.loginFailed
        }
        accessToken = login.accessToken
        return login.accessToken
    }
}

enum PursuitProposalReviewClientError: LocalizedError, Equatable {
    case loopbackOnly
    case loginFailed
    case invalidResponse
    case conflict(message: String)
    case backend(code: String, message: String)

    var errorDescription: String? {
        switch self {
        case .loopbackOnly:
            return "Canonical review is available only against the localhost development backend."
        case .loginFailed:
            return "The local review session could not be opened."
        case .invalidResponse:
            return "The canonical review response could not be read."
        case let .conflict(message):
            return message
        case let .backend(code, message):
            return "\(message) (\(code))"
        }
    }
}

struct PursuitProposalSnapshot: Decodable, Equatable {
    let id: String
    let pursuitID: String
    let captureID: String
    let baseRevision: Int
    let summary: String
    let status: String
    let evidenceState: WorkspaceEvidenceState
    let reviewContext: ReviewContext
    let items: [Item]

    struct ReviewContext: Decodable, Equatable {
        let pursuit: Pursuit
        let capture: Capture
        let subject: Subject
        let evidence: [Evidence]

        struct Pursuit: Decodable, Equatable {
            let id: String
            let title: String
        }

        struct Capture: Decodable, Equatable {
            let id: String
            let purpose: String
        }

        struct Subject: Decodable, Equatable {
            let personID: String
            let displayLabel: String
            let contextualRoles: [ContextualRole]

            struct ContextualRole: Decodable, Equatable {
                let roleType: String
                let status: String
                let confidence: String

                enum CodingKeys: String, CodingKey {
                    case roleType = "role_type"
                    case status
                    case confidence
                }
            }

            enum CodingKeys: String, CodingKey {
                case personID = "person_id"
                case displayLabel = "display_label"
                case contextualRoles = "contextual_roles"
            }
        }

        struct Evidence: Decodable, Equatable, Identifiable {
            let fragmentID: String
            let text: String?
            let fragmentKind: String
            let fragmentStatus: String
            let observedAt: String
            let sourceTimezone: String?
            let sourceDisplayName: String
            let inputChannel: String
            let sourceProcessingState: String
            let attributedActor: String
            let attributionStatus: String
            let reviewStatus: String
            let parser: Parser

            var id: String { fragmentID }

            struct Parser: Decodable, Equatable {
                let name: String
                let version: String
            }

            enum CodingKeys: String, CodingKey {
                case fragmentID = "fragment_id"
                case text
                case fragmentKind = "fragment_kind"
                case fragmentStatus = "fragment_status"
                case observedAt = "observed_at"
                case sourceTimezone = "source_timezone"
                case sourceDisplayName = "source_display_name"
                case inputChannel = "input_channel"
                case sourceProcessingState = "source_processing_state"
                case attributedActor = "attributed_actor"
                case attributionStatus = "attribution_status"
                case reviewStatus = "review_status"
                case parser
            }
        }
    }

    struct Item: Decodable, Equatable, Identifiable {
        let id: String
        let itemKey: String
        let changeKind: String
        let beforeValue: JSONValue
        let proposedValue: JSONValue
        let basisKind: String
        let epistemicStatus: String
        let evidenceRefs: [String]
        let evidenceState: WorkspaceEvidenceState
        let reason: String
        let effectSummary: String

        enum CodingKeys: String, CodingKey {
            case id
            case itemKey = "item_key"
            case changeKind = "change_kind"
            case beforeValue = "before_value"
            case proposedValue = "proposed_value"
            case basisKind = "basis_kind"
            case epistemicStatus = "epistemic_status"
            case evidenceRefs = "evidence_refs"
            case evidenceState = "evidence_state"
            case reason
            case effectSummary = "effect_summary"
        }
    }

    enum CodingKeys: String, CodingKey {
        case id
        case pursuitID = "pursuit_id"
        case captureID = "capture_id"
        case baseRevision = "base_revision"
        case summary
        case status
        case evidenceState = "evidence_state"
        case reviewContext = "review_context"
        case items
    }
}

struct PursuitProposalReviewResult: Equatable {
    let proposal: PursuitProposalSnapshot
    let pursuit: PursuitReadback
    let receipt: PursuitReviewReceipt
}

struct PursuitReadback: Decodable, Equatable {
    let id: String
    let workspaceID: String
    let title: String
    let milestone: String
    let status: String
    let revision: Int

    enum CodingKeys: String, CodingKey {
        case id, title, milestone, status, revision
        case workspaceID = "workspace_id"
    }
}

struct PursuitReviewReceipt: Codable, Equatable {
    let id: String
    let operationID: String
    let workspaceID: String
    let operationKind: String
    let status: String
    let proposalID: String?
    let actorUserID: String
    let outcome: String
    let entityRef: EntityRef
    let changedFields: [String]
    let externalEffects: [JSONValue]
    let summary: String
    let occurredAt: String

    struct EntityRef: Codable, Equatable {
        let beforeRevision: Int
        let afterRevision: Int

        enum CodingKeys: String, CodingKey {
            case beforeRevision = "before_revision"
            case afterRevision = "after_revision"
        }
    }

    enum CodingKeys: String, CodingKey {
        case id
        case operationID = "operation_id"
        case workspaceID = "workspace_id"
        case operationKind = "operation_kind"
        case status
        case proposalID = "proposal_id"
        case actorUserID = "actor_user_id"
        case outcome
        case entityRef = "entity_ref"
        case changedFields = "changed_fields"
        case externalEffects = "external_effects"
        case summary
        case occurredAt = "occurred_at"
    }
}

struct PursuitOperationReadback: Decodable, Equatable {
    let operation: Operation
    let receipt: PursuitReviewReceipt?
    let pursuit: PursuitReadback

    struct Operation: Decodable, Equatable {
        let id: String
        let status: String
        let beforeRevision: Int
        let afterRevision: Int?

        enum CodingKeys: String, CodingKey {
            case id
            case status
            case beforeRevision = "before_revision"
            case afterRevision = "after_revision"
        }
    }
}

enum JSONValue: Codable, Equatable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { self = .null }
        else if let value = try? container.decode(String.self) { self = .string(value) }
        else if let value = try? container.decode(Bool.self) { self = .bool(value) }
        else if let value = try? container.decode(Double.self) { self = .number(value) }
        else if let value = try? container.decode([String: JSONValue].self) { self = .object(value) }
        else if let value = try? container.decode([JSONValue].self) { self = .array(value) }
        else { throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported JSON value") }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case let .string(value): try container.encode(value)
        case let .number(value): try container.encode(value)
        case let .bool(value): try container.encode(value)
        case let .object(value): try container.encode(value)
        case let .array(value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }

    var displayText: String {
        switch self {
        case let .string(value):
            return value.replacingOccurrences(of: "_", with: " ")
        case let .number(value): return String(value)
        case let .bool(value): return value ? "Yes" : "No"
        case let .object(value):
            return value.sorted { $0.key < $1.key }
                .map { "\($0.key.replacingOccurrences(of: "_", with: " ")): \($0.value.displayText)" }
                .joined(separator: " · ")
        case let .array(value): return value.map(\.displayText).joined(separator: ", ")
        case .null: return "None"
        }
    }

    var editableFields: [String: String]? {
        switch self {
        case let .string(value): return ["value": value]
        case let .number(value): return ["value": String(value)]
        case let .bool(value): return ["value": value ? "true" : "false"]
        case let .object(value):
            var fields: [String: String] = [:]
            for (key, child) in value {
                switch child {
                case let .string(text): fields[key] = text
                case let .number(number): fields[key] = String(number)
                case let .bool(flag): fields[key] = flag ? "true" : "false"
                case .null: fields[key] = ""
                case .object, .array: return nil
                }
            }
            return fields
        case .null: return ["value": ""]
        case .array: return nil
        }
    }

    func applyingEditedFields(_ fields: [String: String]) -> JSONValue? {
        func converted(_ text: String, matching shape: JSONValue) -> JSONValue? {
            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
            switch shape {
            case .string:
                return trimmed.isEmpty ? nil : .string(trimmed)
            case .number:
                guard let number = Double(trimmed) else { return nil }
                return .number(number)
            case .bool:
                if trimmed.lowercased() == "true" { return .bool(true) }
                if trimmed.lowercased() == "false" { return .bool(false) }
                return nil
            case .null:
                return trimmed.isEmpty ? .null : .string(trimmed)
            case .object, .array:
                return nil
            }
        }

        switch self {
        case .string, .number, .bool, .null:
            guard let text = fields["value"] else { return nil }
            return converted(text, matching: self)
        case let .object(original):
            var edited: [String: JSONValue] = [:]
            for (key, shape) in original {
                guard let text = fields[key],
                      let value = converted(text, matching: shape) else {
                    return nil
                }
                edited[key] = value
            }
            return .object(edited)
        case .array:
            return nil
        }
    }
}

private struct PursuitProposalEnvelope: Decodable {
    let proposal: PursuitProposalSnapshot
}

private struct PursuitProposalReviewEnvelope: Decodable {
    let proposal: PursuitProposalSnapshot
    let pursuit: PursuitReadback
    let receipt: PursuitReviewReceipt
}

private struct PursuitProposalReviewBody: Encodable {
    let operationID: String
    let idempotencyKey: String
    let baseRevision: Int
    let reason: String
    let decisions: [Decision]

    struct Decision: Encodable {
        let itemID: String
        let decision: String
        let editedValue: JSONValue?

        enum CodingKeys: String, CodingKey {
            case itemID = "item_id"
            case decision
            case editedValue = "edited_value"
        }
    }

    enum CodingKeys: String, CodingKey {
        case operationID = "operation_id"
        case idempotencyKey = "idempotency_key"
        case baseRevision = "base_revision"
        case reason
        case decisions
    }
}

private struct PursuitReviewLoginBody: Encodable {
    let accountSlug: String
    let userEmail: String
    let clientLabel: String

    enum CodingKeys: String, CodingKey {
        case accountSlug = "account_slug"
        case userEmail = "user_email"
        case clientLabel = "client_label"
    }
}

private struct PursuitReviewLoginResponse: Decodable {
    let accessToken: String

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
    }
}

private struct PursuitReviewErrorEnvelope: Decodable {
    let error: ErrorBody?

    struct ErrorBody: Decodable {
        let code: String?
        let message: String?
    }
}

private struct EmptyReviewBody: Encodable {}
