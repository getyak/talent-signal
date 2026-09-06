import Foundation

protocol RelationshipCaptureServing {
    var runtimeScope: String? { get }
    func loadCapture(id: String) async throws -> ResourceCaptureResult
    func prepareChanges(captureID: String) async throws -> CaptureChangeReview
    func decideClaim(_ decision: CaptureClaimDecision) async throws -> String
    func confirmSpeaker(_ decision: CaptureSpeakerDecision) async throws -> String
    func createCapture(
        seed: PendingCaptureSeed,
        draft: RecognizedCaptureDraft
    ) async throws -> ResourceCaptureResult

    func createProposedCapture(
        seed: PendingCaptureSeed,
        draft: RecognizedCaptureDraft
    ) async throws -> ResourceCaptureResult

    func loadIdentityCase(id: String) async throws -> IdentityResolutionCase

    func decideIdentity(
        identityCase: IdentityResolutionCase,
        decision: IdentityDecision,
        seed: PendingCaptureSeed,
        draft: RecognizedCaptureDraft
    ) async throws -> IdentityDecisionResult

    func compileWiki(
        personID: String,
        relationshipContextID: String,
        seedID: UUID,
        reviewFingerprint: String
    ) async throws -> WikiCompilationReceipt
}

extension RelationshipCaptureServing {
    var runtimeScope: String? { nil }

    func createProposedCapture(
        seed: PendingCaptureSeed,
        draft: RecognizedCaptureDraft
    ) async throws -> ResourceCaptureResult {
        try await createCapture(seed: seed, draft: draft)
    }
}

actor URLRelationshipCaptureClient: RelationshipCaptureServing {
    nonisolated let runtimeScope: String?
    private let baseURL: URL
    private let session: URLSession
    private let usesAuthenticatedSession: Bool
    private var accessToken: String?

    init(
        baseURL: URL = URL(string: "http://127.0.0.1:4317")!,
        session: URLSession = TalentSignalNetworking.session,
        accessToken: String? = nil,
        runtimeScope: String? = nil
    ) {
        self.baseURL = baseURL
        self.session = session
        usesAuthenticatedSession = accessToken != nil
        self.accessToken = accessToken
        self.runtimeScope = runtimeScope
    }

    func createCapture(
        seed: PendingCaptureSeed,
        draft: RecognizedCaptureDraft
    ) async throws -> ResourceCaptureResult {
        try await createCapture(
            seed: seed,
            draft: draft,
            reviewStatus: "reviewed",
            sourceScope: "reviewed_extracted_text",
            purpose: "Preserve recruiter-reviewed conversation evidence for a purpose-scoped relationship",
            identityReason: "A recruiter reviewed the extracted text and must explicitly resolve the person."
        )
    }

    func createProposedCapture(
        seed: PendingCaptureSeed,
        draft: RecognizedCaptureDraft
    ) async throws -> ResourceCaptureResult {
        try await createCapture(
            seed: seed,
            draft: draft,
            reviewStatus: "proposed",
            sourceScope: "proposed_extracted_text",
            purpose: "Process one recruiter-selected screenshot into proposed relationship evidence",
            identityReason: "The Agent extracted an identity clue but cannot confirm who owns the screenshot."
        )
    }

    private func createCapture(
        seed: PendingCaptureSeed,
        draft: RecognizedCaptureDraft,
        reviewStatus: String,
        sourceScope: String,
        purpose: String,
        identityReason: String
    ) async throws -> ResourceCaptureResult {
        let clientResourceID = "ios-share:\(seed.id.uuidString.lowercased())"
        let reviewedSpeaker = draft.speaker ?? .unknown
        let body = ResourceCaptureBody(
            contractVersion: TalentSignalAPIContract.version,
            idempotencyKey: "ios:\(seed.id.uuidString.lowercased()):capture",
            channel: "ios_share",
            purpose: purpose,
            capturedAt: Self.timestamp(seed.createdAt),
            sourceTimezone: draft.sourceTimezone ?? TimeZone.current.identifier,
            personScope: .init(
                status: "unresolved",
                displayNameHint: draft.displayNameHint.nonEmpty,
                handles: draft.handleValue.nonEmpty.map {
                    [
                        .init(
                            type: draft.handleType.rawValue,
                            value: $0,
                            sourceClientResourceID: clientResourceID
                        )
                    ]
                } ?? [],
                relationshipContext: draft.relationshipLabel.nonEmpty == nil ? nil : .proposed(draft: draft),
                reason: identityReason
            ),
            resource: .init(
                clientResourceID: clientResourceID,
                kind: "conversation_screenshot",
                displayName: seed.fileName,
                mediaType: seed.mediaType,
                observedAt: Self.timestamp(seed.createdAt),
                sourceTimezone: draft.sourceTimezone ?? TimeZone.current.identifier,
                byteSize: draft.sourceByteCount ?? seed.imageData.count,
                sourceLocator: "ios-share:\(seed.origin.rawValue)",
                retention: .init(
                    requestedMode: "ephemeral",
                    sourceScope: sourceScope
                )
            ),
            fragments: [
                .init(
                    clientResourceID: clientResourceID,
                    kind: "message",
                    sequence: 0,
                    text: draft.reviewedText,
                    locator: .init(
                        kind: "message",
                        sourceMessageID: reviewStatus == "proposed"
                            ? "ocr-proposed-1"
                            : "ocr-reviewed-1",
                        sequence: 0,
                        speakerSide: "unknown",
                        messageTimestamp: draft.messageTimestamp.map(Self.timestamp)
                    ),
                    attribution: .init(
                        actorKind: reviewedSpeaker.rawValue,
                        status: reviewStatus == "proposed" || draft.speaker == nil
                            ? "proposed"
                            : reviewedSpeaker.attributionStatus
                    ),
                    reviewStatus: reviewStatus,
                    parser: .init(
                        name: "ios-vision-text-recognition",
                        version: "1.0.0"
                    )
                )
            ]
        )
        return try await request(
            path: "v1/resource-captures",
            method: "POST",
            body: body
        )
    }

    func loadIdentityCase(id: String) async throws -> IdentityResolutionCase {
        try await request(
            path: "v1/identity-resolution-cases/\(id)",
            method: "GET",
            body: Optional<EmptyBody>.none
        )
    }

    func loadCapture(id: String) async throws -> ResourceCaptureResult {
        try await request(path: "v1/resource-captures/\(id)", method: "GET", body: Optional<EmptyBody>.none)
    }

    func prepareChanges(captureID: String) async throws -> CaptureChangeReview {
        try await request(path: "v1/resource-captures/\(captureID)/review-preparations", method: "POST", body: Optional<EmptyBody>.none)
    }

    func decideClaim(_ decision: CaptureClaimDecision) async throws -> String {
        let receipt: ClaimDecisionReceipt = try await request(
            path: "v1/assertions/\(decision.assertionID)/decisions", method: "POST",
            body: ClaimDecisionBody(idempotency_key: decision.idempotencyKey,
                expected_assertion_version: decision.version,
                expected_review_token: decision.reviewToken, decision: decision.decision,
                corrected_value: decision.correctedValue)
        )
        return receipt.decision_id
    }

    func confirmSpeaker(_ decision: CaptureSpeakerDecision) async throws -> String {
        let receipt: SpeakerReviewReceipt = try await request(
            path: "v1/evidence-fragments/\(decision.fragmentID)/reviews", method: "POST",
            body: SpeakerReviewBody(idempotency_key: decision.idempotencyKey,
                expected_review_status: decision.expectedStatus, expected_last_review_id: decision.expectedReviewID,
                decision: "reviewed", confirmed_speaker: decision.speaker.rawValue,
                reason: "The recruiter inspected the source and explicitly confirmed the author of this excerpt.")
        )
        return receipt.review_id
    }

    func decideIdentity(
        identityCase: IdentityResolutionCase,
        decision: IdentityDecision,
        seed: PendingCaptureSeed,
        draft: RecognizedCaptureDraft
    ) async throws -> IdentityDecisionResult {
        let body = IdentityDecisionBody(
            idempotencyKey: [
                "ios",
                seed.id.uuidString.lowercased(),
                String(identityCase.version),
                decision.idempotencySuffix
            ].joined(separator: ":"),
            expectedCaseVersion: identityCase.version,
            decision: decision,
            draft: draft
        )
        return try await request(
            path: "v1/identity-resolution-cases/\(identityCase.id)/decisions",
            method: "POST",
            body: body
        )
    }

    func compileWiki(
        personID: String,
        relationshipContextID: String,
        seedID: UUID,
        reviewFingerprint: String
    ) async throws -> WikiCompilationReceipt {
        try await request(
            path: "v1/people/\(personID)/contexts/\(relationshipContextID)/wiki-compilations",
            method: "POST",
            body: CompileWikiBody(
                idempotencyKey: "ios:\(seedID.uuidString.lowercased()):wiki:\(reviewFingerprint.prefix(24))",
                objective: "Prepare a source-linked pre-contact relationship brief for the recruiter."
            )
        )
    }

    private func request<Response: Decodable, Body: Encodable>(
        path: String,
        method: String,
        body: Body?
    ) async throws -> Response {
        guard URLFixtureLoader.isLoopback(baseURL) || usesAuthenticatedSession else {
            throw RelationshipCaptureClientError.loopbackOnly
        }
        let token = try await authenticatedToken()
        var urlRequest = URLRequest(url: baseURL.appending(path: path))
        urlRequest.httpMethod = method
        urlRequest.setValue("application/json", forHTTPHeaderField: "accept")
        urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
        if let body {
            urlRequest.setValue("application/json", forHTTPHeaderField: "content-type")
            urlRequest.httpBody = try JSONEncoder().encode(body)
        }
        let (data, response) = try await TalentSignalNetworking.data(for: urlRequest, using: session)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw RelationshipCaptureClientError.invalidResponse
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            let envelope = try? JSONDecoder().decode(BackendErrorEnvelope.self, from: data)
            throw RelationshipCaptureClientError.backend(
                code: envelope?.error?.code ?? "HTTP_\(httpResponse.statusCode)",
                message: envelope?.error?.message ?? "The local backend rejected this request."
            )
        }
        do {
            return try JSONDecoder().decode(Response.self, from: data)
        } catch {
            throw RelationshipCaptureClientError.invalidResponse
        }
    }

    private func authenticatedToken() async throws -> String {
        if let accessToken {
            return accessToken
        }
        guard URLFixtureLoader.isLoopback(baseURL) else {
            throw RelationshipCaptureClientError.loopbackOnly
        }
        var request = URLRequest(
            url: baseURL.appending(path: "v1/auth/simulated-login")
        )
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONEncoder().encode(
            LoginBody(
                accountSlug: "fixture-alpha",
                userEmail: "recruiter@alpha.local",
                clientLabel: "ios-relationship-capture"
            )
        )
        let (data, response) = try await TalentSignalNetworking.data(for: request, using: session)
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode),
              let login = try? JSONDecoder().decode(LoginResponse.self, from: data) else {
            throw RelationshipCaptureClientError.loginFailed
        }
        accessToken = login.accessToken
        return login.accessToken
    }

    private static func timestamp(_ date: Date) -> String {
        // Inbox dates use ISO-8601 seconds. Keep the first wire request identical
        // to a retry after decoding the protected recovery record.
        ISO8601DateFormatter.captureFormatter.string(from: Date(timeIntervalSince1970: floor(date.timeIntervalSince1970)))
    }
}

enum RelationshipCaptureClientError: LocalizedError, Equatable {
    case loopbackOnly
    case loginFailed
    case invalidResponse
    case backend(code: String, message: String)

    var errorDescription: String? {
        switch self {
        case .loopbackOnly:
            return "This development build sends reviewed evidence only to a localhost backend."
        case .loginFailed:
            return "The local development session could not be opened."
        case .invalidResponse:
            return "The local backend returned an unreadable response."
        case let .backend(code, message):
            if code == "IDENTITY_HANDLE_CONFIRMED_ELSEWHERE" {
                return "That historical person cannot receive this source because the clue has a different current owner. Compare the current person or leave it unresolved."
            }
            return "\(message) (\(code))"
        }
    }
}

private struct EmptyBody: Encodable {}

private struct ClaimDecisionBody: Encodable {
    let idempotency_key: String
    let expected_assertion_version: Int
    let expected_review_token: String
    let decision: String
    let corrected_value: String?
}
private struct ClaimDecisionReceipt: Decodable { let decision_id: String }
private struct SpeakerReviewReceipt: Decodable { let review_id: String }
private struct SpeakerReviewBody: Encodable {
    let idempotency_key: String
    let expected_review_status: String
    let expected_last_review_id: String?
    let decision: String
    let confirmed_speaker: String
    let reason: String
    enum CodingKeys: String, CodingKey {
        case idempotency_key, expected_review_status, expected_last_review_id, decision, confirmed_speaker, reason
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(idempotency_key, forKey: .idempotency_key)
        try c.encode(expected_review_status, forKey: .expected_review_status)
        try c.encode(expected_last_review_id, forKey: .expected_last_review_id)
        try c.encode(decision, forKey: .decision)
        try c.encode(confirmed_speaker, forKey: .confirmed_speaker)
        try c.encode(reason, forKey: .reason)
    }
}

private struct LoginBody: Encodable {
    let accountSlug: String
    let userEmail: String
    let clientLabel: String

    enum CodingKeys: String, CodingKey {
        case accountSlug = "account_slug"
        case userEmail = "user_email"
        case clientLabel = "client_label"
    }
}

private struct LoginResponse: Decodable {
    let accessToken: String

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
    }
}

private struct BackendErrorEnvelope: Decodable {
    let error: BackendError?

    struct BackendError: Decodable {
        let code: String?
        let message: String?
    }
}

private struct ResourceCaptureBody: Encodable {
    let contractVersion: String
    let idempotencyKey: String
    let channel: String
    let purpose: String
    let capturedAt: String
    let sourceTimezone: String
    let personScope: PersonScope
    let resource: Resource
    let fragments: [Fragment]

    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case idempotencyKey = "idempotency_key"
        case channel
        case purpose
        case capturedAt = "captured_at"
        case sourceTimezone = "source_timezone"
        case personScope = "person_scope"
        case resource
        case fragments
    }

    struct PersonScope: Encodable {
        let status: String
        let displayNameHint: String?
        let handles: [Handle]
        let relationshipContext: RelationshipContext?
        let reason: String

        enum CodingKeys: String, CodingKey {
            case status
            case displayNameHint = "display_name_hint"
            case handles
            case relationshipContext = "relationship_context"
            case reason
        }
    }

    struct Handle: Encodable {
        let type: String
        let value: String
        let sourceClientResourceID: String

        enum CodingKeys: String, CodingKey {
            case type
            case value
            case sourceClientResourceID = "source_client_resource_id"
        }
    }

    struct RelationshipContext: Encodable {
        let status: String
        let label: String
        let purpose: String
        let role: String?

        static func proposed(draft: RecognizedCaptureDraft) -> RelationshipContext {
            RelationshipContext(
                status: "proposed",
                label: draft.relationshipLabel.nonEmpty ?? "Candidate relationship",
                purpose: draft.relationshipPurpose.nonEmpty ?? "Preserve reviewed conversation evidence",
                role: draft.relationshipRole.nonEmpty
            )
        }
    }

    struct Resource: Encodable {
        let clientResourceID: String
        let kind: String
        let displayName: String
        let mediaType: String
        let observedAt: String
        let sourceTimezone: String
        let byteSize: Int
        let sourceLocator: String
        let retention: Retention

        enum CodingKeys: String, CodingKey {
            case clientResourceID = "client_resource_id"
            case kind
            case displayName = "display_name"
            case mediaType = "media_type"
            case observedAt = "observed_at"
            case sourceTimezone = "source_timezone"
            case byteSize = "byte_size"
            case sourceLocator = "source_locator"
            case retention
        }
    }

    struct Retention: Encodable {
        let requestedMode: String
        let sourceScope: String

        enum CodingKeys: String, CodingKey {
            case requestedMode = "requested_mode"
            case sourceScope = "source_scope"
        }
    }

    struct Fragment: Encodable {
        let clientResourceID: String
        let kind: String
        let sequence: Int
        let text: String
        let locator: Locator
        let attribution: Attribution
        let reviewStatus: String
        let parser: Parser

        enum CodingKeys: String, CodingKey {
            case clientResourceID = "client_resource_id"
            case kind
            case sequence
            case text
            case locator
            case attribution
            case reviewStatus = "review_status"
            case parser
        }
    }

    struct Locator: Encodable {
        let kind: String
        let sourceMessageID: String
        let sequence: Int
        let speakerSide: String
        let messageTimestamp: String?

        enum CodingKeys: String, CodingKey {
            case kind
            case sourceMessageID = "source_message_id"
            case sequence
            case speakerSide = "speaker_side"
            case messageTimestamp = "message_timestamp"
        }
    }

    struct Attribution: Encodable {
        let actorKind: String
        let status: String

        enum CodingKeys: String, CodingKey {
            case actorKind = "actor_kind"
            case status
        }
    }

    struct Parser: Encodable {
        let name: String
        let version: String
    }
}

private struct IdentityDecisionBody: Encodable {
    let idempotencyKey: String
    let expectedCaseVersion: Int
    let decision: IdentityDecision
    let draft: RecognizedCaptureDraft

    enum CodingKeys: String, CodingKey {
        case idempotencyKey = "idempotency_key"
        case expectedCaseVersion = "expected_case_version"
        case decision
        case selectedPersonID = "selected_person_id"
        case relationshipContext = "relationship_context"
        case reason
        case displayLabel = "display_label"
        case bindingBasis = "binding_basis"
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(idempotencyKey, forKey: .idempotencyKey)
        try container.encode(expectedCaseVersion, forKey: .expectedCaseVersion)

        switch decision {
        case let .bind(candidate, context):
            try container.encode("bind_existing", forKey: .decision)
            try container.encode(candidate.personID, forKey: .selectedPersonID)
            if let context {
                try container.encode(
                    ExistingRelationshipContext(
                        status: "existing",
                        relationshipContextID: context.id
                    ),
                    forKey: .relationshipContext
                )
            } else {
                try container.encode(
                    ResourceCaptureBody.RelationshipContext.proposed(draft: draft),
                    forKey: .relationshipContext
                )
            }
            try container.encode(
                "The recruiter compared the source with the visible identity evidence and explicitly selected this person.",
                forKey: .reason
            )
        case let .bindFromAgent(candidate, context):
            try container.encode("bind_existing", forKey: .decision)
            try container.encode(candidate.personID, forKey: .selectedPersonID)
            try container.encode(
                ExistingRelationshipContext(
                    status: "existing",
                    relationshipContextID: context.id
                ),
                forKey: .relationshipContext
            )
            try container.encode(
                "The recruiter instructed this Agent Session to process the screenshot. The Agent attached it because one current confirmed identity clue matched one person with one existing relationship context.",
                forKey: .reason
            )
        case .createNew:
            try container.encode("create_new", forKey: .decision)
            try container.encode(
                draft.displayNameHint.nonEmpty ?? "New relationship",
                forKey: .displayLabel
            )
            try container.encode(
                ResourceCaptureBody.RelationshipContext.proposed(draft: draft),
                forKey: .relationshipContext
            )
            try container.encode(
                "No existing person was a safe match, so the recruiter explicitly created a separate person.",
                forKey: .bindingBasis
            )
            try container.encode(
                "The recruiter reviewed the source and chose to create a distinct person.",
                forKey: .reason
            )
        case .leaveUnresolved:
            try container.encode("leave_unresolved", forKey: .decision)
            try container.encode(
                "The available identity evidence is not sufficient for a safe binding.",
                forKey: .reason
            )
        }
    }
}

private struct ExistingRelationshipContext: Encodable {
    let status: String
    let relationshipContextID: String

    enum CodingKeys: String, CodingKey {
        case status
        case relationshipContextID = "relationship_context_id"
    }
}

private struct CompileWikiBody: Encodable {
    let idempotencyKey: String
    let objective: String

    enum CodingKeys: String, CodingKey {
        case idempotencyKey = "idempotency_key"
        case objective
    }
}

private extension String {
    var nonEmpty: String? {
        let value = trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }
}

private extension IdentityDecision {
    var idempotencySuffix: String {
        switch self {
        case let .bind(candidate, context):
            return "bind:\(candidate.personID):\(context?.id ?? "new")"
        case let .bindFromAgent(candidate, context):
            return "agent-bind:\(candidate.personID):\(context.id)"
        case .createNew:
            return "create"
        case .leaveUnresolved:
            return "unresolved"
        }
    }
}

private extension ISO8601DateFormatter {
    static let captureFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}
