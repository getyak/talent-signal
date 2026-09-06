import CryptoKit
import Foundation

enum TalentSignalAPIContract {
    static let version = "2026-08-24.10"
}

protocol TextSignalSyncServing {
    func loadScopes() async throws -> TextSignalScopeCatalog
    func sync(_ record: TextSignalOutboxRecord) async throws -> TextSignalSyncReceipt
    func deleteCapture(id: String, recordID: UUID) async throws -> TextSignalDeletionReceipt
}

actor TextSignalWorkspaceBindingStore {
    struct Binding: Codable, Equatable {
        let workspaceID: String
        let endpoint: String
        let accountSlug: String
        let userEmail: String
        let verifiedAt: Date
    }

    static let shared = TextSignalWorkspaceBindingStore()

    private let directoryURL: URL

    init(directoryURL: URL? = nil) {
        self.directoryURL = directoryURL
            ?? FileManager.default.urls(
                for: .applicationSupportDirectory,
                in: .userDomainMask
            )[0].appending(
                path: "TextSignalWorkspaceBindings",
                directoryHint: .isDirectory
            )
    }

    func save(
        workspaceID: String,
        baseURL: URL,
        accountSlug: String,
        userEmail: String,
        verifiedAt: Date = Date()
    ) throws {
        let endpoint = Self.normalizedEndpoint(baseURL)
        let binding = Binding(
            workspaceID: workspaceID,
            endpoint: endpoint,
            accountSlug: accountSlug,
            userEmail: userEmail,
            verifiedAt: verifiedAt
        )
        try prepareDirectory()
        let destination = bindingURL(
            endpoint: endpoint,
            accountSlug: accountSlug,
            userEmail: userEmail
        )
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        try encoder.encode(binding).write(
            to: destination,
            options: [.atomic, .completeFileProtection]
        )
        try FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.complete],
            ofItemAtPath: destination.path
        )
    }

    func binding(
        baseURL: URL,
        accountSlug: String,
        userEmail: String
    ) throws -> Binding? {
        let endpoint = Self.normalizedEndpoint(baseURL)
        let source = bindingURL(
            endpoint: endpoint,
            accountSlug: accountSlug,
            userEmail: userEmail
        )
        guard FileManager.default.fileExists(atPath: source.path) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let binding = try decoder.decode(Binding.self, from: Data(contentsOf: source))
        guard binding.endpoint == endpoint,
              binding.accountSlug == accountSlug,
              binding.userEmail == userEmail,
              !binding.workspaceID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return nil
        }
        return binding
    }

    private func prepareDirectory() throws {
        try FileManager.default.createDirectory(
            at: directoryURL,
            withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.complete]
        )
    }

    private func bindingURL(
        endpoint: String,
        accountSlug: String,
        userEmail: String
    ) -> URL {
        let key = [endpoint, accountSlug, userEmail].joined(separator: "\u{001F}")
        let component = SHA256.hash(data: Data(key.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
        return directoryURL.appending(path: "\(component).json")
    }

    private static func normalizedEndpoint(_ url: URL) -> String {
        let absolute = url.absoluteString
        return absolute.hasSuffix("/") ? String(absolute.dropLast()) : absolute
    }
}

actor URLTextSignalSyncClient: TextSignalSyncServing {
    private static let accountSlug = "fixture-alpha"
    private static let userEmail = "recruiter@alpha.local"
    private let baseURL: URL
    private let session: URLSession
    private let bindingStore: TextSignalWorkspaceBindingStore
    private let usesAuthenticatedSession: Bool
    private var accessToken: String?
    private var workspaceID: String?

    init(
        baseURL: URL,
        session: URLSession = TalentSignalNetworking.session,
        bindingStore: TextSignalWorkspaceBindingStore = .shared,
        accessToken: String? = nil,
        workspaceID: String? = nil
    ) {
        self.baseURL = baseURL
        self.session = session
        self.bindingStore = bindingStore
        usesAuthenticatedSession = accessToken != nil && workspaceID != nil
        self.accessToken = accessToken
        self.workspaceID = workspaceID
    }

    func loadScopes() async throws -> TextSignalScopeCatalog {
        do {
            return try await loadOnlineScopes()
        } catch {
            guard !usesAuthenticatedSession,
                  Self.isRecoverableOffline(error),
                  let cached = try? await bindingStore.binding(
                      baseURL: baseURL,
                      accountSlug: Self.accountSlug,
                      userEmail: Self.userEmail
                  ) else {
                throw error
            }
            workspaceID = cached.workspaceID
            return TextSignalScopeCatalog(
                workspaceID: cached.workspaceID,
                scopes: [],
                verification: .cachedOffline
            )
        }
    }

    private func loadOnlineScopes() async throws -> TextSignalScopeCatalog {
        let workspaceID = try await authenticatedWorkspaceID()
        async let pursuits: TextPursuitListEnvelope = request(
            path: "v1/pursuits",
            method: "GET",
            body: Optional<TextEmptyBody>.none
        )
        async let people: TextPeopleEnvelope = request(
            path: "v1/people",
            method: "GET",
            body: Optional<TextEmptyBody>.none
        )
        let (pursuitEnvelope, peopleEnvelope) = try await (pursuits, people)
        let peopleByID = Dictionary(
            uniqueKeysWithValues: peopleEnvelope.people.map { ($0.id, $0) }
        )

        guard pursuitEnvelope.workspaceID == workspaceID,
              pursuitEnvelope.pursuits.allSatisfy({ $0.workspaceID == workspaceID }) else {
            throw TextSignalSyncError.workspaceReadbackMismatch
        }
        let scopes = pursuitEnvelope.pursuits
            .filter { $0.status == "active" || $0.status == "draft" }
            .flatMap { pursuit in
                pursuit.roles.compactMap { role -> TextSignalScope? in
                    guard role.subjectRef.type == "person",
                          role.status == "active",
                          role.confidence == "confirmed",
                          role.roleType == "candidate",
                          let person = peopleByID[role.subjectRef.id] else {
                        return nil
                    }
                    let normalizedTitle = pursuit.title
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                        .lowercased()
                    let context = person.contexts.first { context in
                        let label = context.displayLabel
                            .trimmingCharacters(in: .whitespacesAndNewlines)
                            .lowercased()
                        return label == normalizedTitle
                            || normalizedTitle.contains(label)
                            || label.contains(normalizedTitle)
                    } ?? (person.contexts.count == 1 ? person.contexts[0] : nil)
                    return TextSignalScope(
                        workspaceID: workspaceID,
                        pursuitID: pursuit.id,
                        pursuitTitle: pursuit.title,
                        pursuitRevision: pursuit.revision,
                        currentMilestone: pursuit.milestone,
                        roleID: role.id,
                        roleType: role.roleType,
                        personID: person.id,
                        personDisplayLabel: person.displayLabel,
                        relationshipContextID: context?.id,
                        relationshipContextLabel: context?.displayLabel
                    )
                }
            }
            .sorted {
                if $0.pursuitTitle == $1.pursuitTitle {
                    if $0.personDisplayLabel == $1.personDisplayLabel {
                        if $0.identityClue == $1.identityClue {
                            return $0.personID < $1.personID
                        }
                        return $0.identityClue < $1.identityClue
                    }
                    return $0.personDisplayLabel < $1.personDisplayLabel
                }
                return $0.pursuitTitle < $1.pursuitTitle
            }
        if !usesAuthenticatedSession {
            try await bindingStore.save(
                workspaceID: workspaceID,
                baseURL: baseURL,
                accountSlug: Self.accountSlug,
                userEmail: Self.userEmail
            )
        }
        return TextSignalScopeCatalog(
            workspaceID: workspaceID,
            scopes: scopes,
            verification: .online
        )
    }

    func sync(_ record: TextSignalOutboxRecord) async throws -> TextSignalSyncReceipt {
        guard let scope = record.scope, let speaker = record.speaker else {
            throw TextSignalSyncError.invalidRecord
        }
        let workspaceID = try await authenticatedWorkspaceID()
        guard record.workspaceID == workspaceID,
              scope.workspaceID == workspaceID else {
            throw TextSignalSyncError.workspaceReadbackMismatch
        }
        let trimmedText = record.text.trimmingCharacters(in: .whitespacesAndNewlines)
        let clientResourceID = "ios-text-signal:\(record.id.uuidString.lowercased())"
        let timestamp = Self.timestamp(record.createdAt)
        let capture: TextResourceCaptureEnvelope = try await request(
            path: "v1/resource-captures",
            method: "POST",
            body: TextResourceCaptureBody(
                contractVersion: TalentSignalAPIContract.version,
                idempotencyKey: "ios:text-signal:\(record.id.uuidString.lowercased()):capture",
                channel: "ios_share",
                purpose: record.purpose.trimmingCharacters(in: .whitespacesAndNewlines),
                capturedAt: timestamp,
                sourceTimezone: TimeZone.current.identifier,
                personScope: TextPersonScope(
                    personID: scope.personID,
                    contextID: scope.relationshipContextID,
                    pursuitTitle: scope.pursuitTitle
                ),
                resource: .init(
                    clientResourceID: clientResourceID,
                    kind: "conversation_transcript",
                    displayName: "Typed Signal · \(scope.personDisplayLabel)",
                    mediaType: "text/plain",
                    observedAt: timestamp,
                    sourceTimezone: TimeZone.current.identifier,
                    byteSize: Data(trimmedText.utf8).count,
                    contentHash: Self.hash(trimmedText),
                    sourceLocator: "ios:text-signal:\(record.id.uuidString.lowercased())",
                    retention: .init(
                        requestedMode: "ephemeral",
                        sourceScope: "reviewed_selected_text"
                    )
                ),
                fragments: [
                    .init(
                        clientResourceID: clientResourceID,
                        kind: "message",
                        sequence: 0,
                        text: trimmedText,
                        locator: .init(
                            kind: "message",
                            sourceMessageID: "typed-signal-1",
                            sequence: 0,
                            speakerSide: "unknown"
                        ),
                        attribution: .init(
                            actorKind: speaker.rawValue,
                            status: speaker.attributionStatus
                        ),
                        reviewStatus: "reviewed",
                        parser: .init(name: "ios-typed-signal", version: "1.0.0")
                    )
                ]
            )
        )
        guard capture.identity.status == "bound",
              capture.identity.personID == scope.personID else {
            throw TextSignalSyncError.identityReadbackMismatch
        }

        let resource: TextResourceDetailEnvelope = try await request(
            path: "v1/resources/\(capture.resource.id)",
            method: "GET",
            body: Optional<TextEmptyBody>.none
        )
        guard resource.resource.id == capture.resource.id,
              let fragment = resource.fragments.first(where: {
                  $0.text == trimmedText
                      && $0.reviewStatus == "reviewed"
                      && $0.attribution.status == speaker.attributionStatus
                      && $0.attribution.actorKind == speaker.rawValue
              }) else {
            throw TextSignalSyncError.evidenceReadbackMismatch
        }

        var proposalID: String?
        if record.stagesProposal {
            guard speaker == .candidate else {
                throw TextSignalSyncError.proposalRequiresCandidateAttribution
            }
            let proposedMilestone = record.proposedMilestone
                .trimmingCharacters(in: .whitespacesAndNewlines)
            let proposalReason = record.proposalReason
                .trimmingCharacters(in: .whitespacesAndNewlines)
            let proposal: TextProposalEnvelope = try await request(
                path: "v1/pursuits/\(scope.pursuitID)/proposals",
                method: "POST",
                body: TextStageProposalBody(
                    idempotencyKey: "ios:text-signal:\(record.id.uuidString.lowercased()):proposal",
                    proposalID: record.id.uuidString.lowercased(),
                    captureID: capture.captureID,
                    baseRevision: scope.pursuitRevision,
                    summary: "Recruiter-authored milestone proposal from a reviewed typed Signal.",
                    producer: .init(
                        kind: "human",
                        name: "ios-typed-signal",
                        version: "1.0.0",
                        runID: record.id.uuidString.lowercased()
                    ),
                    items: [
                        .init(
                            itemKey: "typed-signal-milestone",
                            basisKind: "evidence_supported",
                            epistemicStatus: "inference",
                            evidenceRefs: [fragment.id],
                            reason: proposalReason,
                            effectSummary: "Would update only the canonical Pursuit milestone after item review.",
                            change: .init(
                                kind: "set_milestone",
                                proposedValue: proposedMilestone
                            )
                        )
                    ]
                )
            )
            guard proposal.proposal.id == record.id.uuidString.lowercased(),
                  proposal.proposal.pursuitID == scope.pursuitID,
                  proposal.proposal.captureID == capture.captureID,
                  proposal.proposal.baseRevision == scope.pursuitRevision,
                  proposal.proposal.status == "needs_review" else {
                throw TextSignalSyncError.proposalReadbackMismatch
            }
            proposalID = proposal.proposal.id
        }

        let currentScopes = try await loadOnlineScopes().scopes
        guard currentScopes.contains(where: {
            $0.workspaceID == scope.workspaceID
                && $0.pursuitID == scope.pursuitID
                && $0.roleID == scope.roleID
                && $0.personID == scope.personID
                && $0.relationshipContextID == scope.relationshipContextID
        }) else {
            throw TextSignalSyncError.identityReadbackMismatch
        }
        return TextSignalSyncReceipt(
            workspaceID: scope.workspaceID,
            pursuitID: scope.pursuitID,
            roleID: scope.roleID,
            personID: scope.personID,
            relationshipContextID: scope.relationshipContextID,
            captureID: capture.captureID,
            resourceID: capture.resource.id,
            evidenceFragmentID: fragment.id,
            proposalID: proposalID
        )
    }

    func deleteCapture(
        id: String,
        recordID: UUID
    ) async throws -> TextSignalDeletionReceipt {
        try await request(
            path: "v1/captures/\(id)/deletion",
            method: "POST",
            body: TextDeleteCaptureBody(
                idempotencyKey: "ios:text-signal:\(recordID.uuidString.lowercased()):delete",
                reason: "The recruiter deleted this typed Signal from its purpose-bound outbox."
            )
        )
    }

    private func request<Response: Decodable, Body: Encodable>(
        path: String,
        method: String,
        body: Body?
    ) async throws -> Response {
        guard URLFixtureLoader.isLoopback(baseURL) || usesAuthenticatedSession else {
            throw TextSignalSyncError.loopbackOnly
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
            throw TextSignalSyncError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let envelope = try? JSONDecoder().decode(TextBackendErrorEnvelope.self, from: data)
            throw TextSignalSyncError.backend(
                code: envelope?.error?.code ?? "HTTP_\(http.statusCode)",
                message: envelope?.error?.message ?? "The backend rejected this Signal."
            )
        }
        do {
            return try JSONDecoder().decode(Response.self, from: data)
        } catch {
            throw TextSignalSyncError.invalidResponse
        }
    }

    private func authenticatedToken() async throws -> String {
        if let accessToken { return accessToken }
        var request = URLRequest(url: baseURL.appending(path: "v1/auth/simulated-login"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONEncoder().encode(
            TextLoginBody(
                accountSlug: "fixture-alpha",
                userEmail: "recruiter@alpha.local",
                clientLabel: "ios-text-signal"
            )
        )
        let (data, response) = try await TalentSignalNetworking.data(for: request, using: session)
        guard let http = response as? HTTPURLResponse else {
            throw TextSignalSyncError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let envelope = try? JSONDecoder().decode(TextBackendErrorEnvelope.self, from: data)
            throw TextSignalSyncError.backend(
                code: envelope?.error?.code ?? "HTTP_\(http.statusCode)",
                message: envelope?.error?.message ?? "Login was rejected."
            )
        }
        guard let login = try? JSONDecoder().decode(TextLoginEnvelope.self, from: data) else {
            throw TextSignalSyncError.loginFailed
        }
        accessToken = login.accessToken
        workspaceID = login.account.id
        return login.accessToken
    }

    private func authenticatedWorkspaceID() async throws -> String {
        _ = try await authenticatedToken()
        guard let workspaceID else { throw TextSignalSyncError.loginFailed }
        return workspaceID
    }

    private static func timestamp(_ date: Date) -> String {
        ISO8601DateFormatter.textSignalFormatter.string(from: date)
    }

    private static func hash(_ text: String) -> String {
        SHA256.hash(data: Data(text.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }

    private static func isRecoverableOffline(_ error: Error) -> Bool {
        if error is URLError { return true }
        guard case let TextSignalSyncError.backend(code, _) = error else { return false }
        return ["SYNTHETIC_OFFLINE", "HTTP_502", "HTTP_503", "HTTP_504"]
            .contains(code)
    }
}

enum TextSignalSyncError: LocalizedError, Equatable {
    case loopbackOnly
    case loginFailed
    case invalidRecord
    case invalidResponse
    case workspaceReadbackMismatch
    case identityReadbackMismatch
    case evidenceReadbackMismatch
    case proposalRequiresCandidateAttribution
    case proposalReadbackMismatch
    case backend(code: String, message: String)

    var errorDescription: String? {
        switch self {
        case .loopbackOnly:
            return "This development build syncs only with a localhost backend. The local Signal remains saved."
        case .loginFailed:
            return "No connection was verified. The local Signal remains saved; retry will reuse the same Signal ID."
        case .invalidRecord:
            return "Choose a Pursuit, Person context, and speaker before syncing."
        case .invalidResponse:
            return "The canonical response could not be read. Retry uses the same idempotency key."
        case .workspaceReadbackMismatch:
            return "The authenticated workspace did not match canonical readback. No local Signal was opened or synced."
        case .identityReadbackMismatch:
            return "Canonical identity readback did not match the selected Pursuit role. Nothing is presented as synced."
        case .evidenceReadbackMismatch:
            return "Canonical evidence readback did not match the reviewed text and attribution."
        case .proposalRequiresCandidateAttribution:
            return "A milestone Proposal requires explicit candidate attribution. The Signal itself remains recoverable."
        case .proposalReadbackMismatch:
            return "The staged Proposal did not match the selected Capture and Pursuit revision."
        case let .backend(code, message):
            return "\(message) (\(code))"
        }
    }
}

private struct TextEmptyBody: Encodable {}

private struct TextLoginBody: Encodable {
    let accountSlug: String
    let userEmail: String
    let clientLabel: String

    enum CodingKeys: String, CodingKey {
        case accountSlug = "account_slug"
        case userEmail = "user_email"
        case clientLabel = "client_label"
    }
}

private struct TextLoginEnvelope: Decodable {
    let accessToken: String
    let account: Account

    struct Account: Decodable { let id: String }

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case account
    }
}

private struct TextBackendErrorEnvelope: Decodable {
    let error: ErrorBody?
    struct ErrorBody: Decodable { let code: String?; let message: String? }
}

private struct TextPursuitListEnvelope: Decodable {
    let workspaceID: String
    let pursuits: [Pursuit]

    enum CodingKeys: String, CodingKey {
        case workspaceID = "workspace_id"
        case pursuits
    }

    struct Pursuit: Decodable {
        let id: String
        let workspaceID: String
        let title: String
        let status: String
        let milestone: String
        let revision: Int
        let roles: [Role]

        enum CodingKeys: String, CodingKey {
            case id
            case workspaceID = "workspace_id"
            case title
            case status
            case milestone
            case revision
            case roles
        }
    }

    struct Role: Decodable {
        let id: String
        let subjectRef: SubjectRef
        let roleType: String
        let status: String
        let confidence: String

        enum CodingKeys: String, CodingKey {
            case id
            case subjectRef = "subject_ref"
            case roleType = "role_type"
            case status
            case confidence
        }
    }

    struct SubjectRef: Decodable { let type: String; let id: String }
}

private struct TextPeopleEnvelope: Decodable {
    let people: [Person]

    struct Person: Decodable {
        let id: String
        let displayLabel: String
        let contexts: [Context]
        enum CodingKeys: String, CodingKey {
            case id
            case displayLabel = "display_label"
            case contexts
        }
    }

    struct Context: Decodable {
        let id: String
        let displayLabel: String
        enum CodingKeys: String, CodingKey {
            case id
            case displayLabel = "display_label"
        }
    }
}

private struct TextResourceCaptureEnvelope: Decodable {
    let captureID: String
    let identity: Identity
    let resource: Resource

    enum CodingKeys: String, CodingKey {
        case captureID = "capture_id"
        case identity
        case resource
    }

    struct Identity: Decodable {
        let status: String
        let personID: String?
        enum CodingKeys: String, CodingKey {
            case status
            case personID = "person_id"
        }
    }

    struct Resource: Decodable { let id: String }
}

private struct TextResourceDetailEnvelope: Decodable {
    let resource: Resource
    let fragments: [Fragment]
    struct Resource: Decodable { let id: String }
    struct Fragment: Decodable {
        let id: String
        let text: String?
        let reviewStatus: String
        let attribution: Attribution
        enum CodingKeys: String, CodingKey {
            case id
            case text
            case reviewStatus = "review_status"
            case attribution
        }
    }
    struct Attribution: Decodable {
        let actorKind: String
        let status: String
        enum CodingKeys: String, CodingKey {
            case actorKind = "actor_kind"
            case status
        }
    }
}

private struct TextProposalEnvelope: Decodable {
    let proposal: Proposal
    struct Proposal: Decodable {
        let id: String
        let pursuitID: String
        let captureID: String
        let baseRevision: Int
        let status: String
        enum CodingKeys: String, CodingKey {
            case id
            case pursuitID = "pursuit_id"
            case captureID = "capture_id"
            case baseRevision = "base_revision"
            case status
        }
    }
}

private struct TextPersonScope: Encodable {
    let personID: String
    let contextID: String?
    let pursuitTitle: String

    enum CodingKeys: String, CodingKey {
        case status
        case personID = "person_id"
        case relationshipContext = "relationship_context"
        case bindingBasis = "binding_basis"
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode("confirmed", forKey: .status)
        try container.encode(personID, forKey: .personID)
        if let contextID {
            try container.encode(
                ExistingContext(status: "existing", relationshipContextID: contextID),
                forKey: .relationshipContext
            )
        } else {
            try container.encode(
                ProposedContext(
                    status: "proposed",
                    label: pursuitTitle,
                    purpose: "Preserve reviewed evidence for this Pursuit",
                    role: "Candidate"
                ),
                forKey: .relationshipContext
            )
        }
        try container.encode(
            "The recruiter explicitly selected this confirmed Person role inside the visible Pursuit.",
            forKey: .bindingBasis
        )
    }

    private struct ExistingContext: Encodable {
        let status: String
        let relationshipContextID: String
        enum CodingKeys: String, CodingKey {
            case status
            case relationshipContextID = "relationship_context_id"
        }
    }

    private struct ProposedContext: Encodable {
        let status: String
        let label: String
        let purpose: String
        let role: String
    }
}

private struct TextResourceCaptureBody: Encodable {
    let contractVersion: String
    let idempotencyKey: String
    let channel: String
    let purpose: String
    let capturedAt: String
    let sourceTimezone: String
    let personScope: TextPersonScope
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

    struct Resource: Encodable {
        let clientResourceID: String
        let kind: String
        let displayName: String
        let mediaType: String
        let observedAt: String
        let sourceTimezone: String
        let byteSize: Int
        let contentHash: String
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
            case contentHash = "content_hash"
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
        enum CodingKeys: String, CodingKey {
            case kind
            case sourceMessageID = "source_message_id"
            case sequence
            case speakerSide = "speaker_side"
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

    struct Parser: Encodable { let name: String; let version: String }
}

private struct TextStageProposalBody: Encodable {
    let idempotencyKey: String
    let proposalID: String
    let captureID: String
    let baseRevision: Int
    let summary: String
    let producer: Producer
    let items: [Item]

    enum CodingKeys: String, CodingKey {
        case idempotencyKey = "idempotency_key"
        case proposalID = "proposal_id"
        case captureID = "capture_id"
        case baseRevision = "base_revision"
        case summary
        case producer
        case items
    }

    struct Producer: Encodable {
        let kind: String
        let name: String
        let version: String
        let runID: String
        enum CodingKeys: String, CodingKey {
            case kind
            case name
            case version
            case runID = "run_id"
        }
    }

    struct Item: Encodable {
        let itemKey: String
        let basisKind: String
        let epistemicStatus: String
        let evidenceRefs: [String]
        let reason: String
        let effectSummary: String
        let change: Change
        enum CodingKeys: String, CodingKey {
            case itemKey = "item_key"
            case basisKind = "basis_kind"
            case epistemicStatus = "epistemic_status"
            case evidenceRefs = "evidence_refs"
            case reason
            case effectSummary = "effect_summary"
            case change
        }
    }

    struct Change: Encodable {
        let kind: String
        let proposedValue: String
        enum CodingKeys: String, CodingKey {
            case kind
            case proposedValue = "proposed_value"
        }
    }
}

private struct TextDeleteCaptureBody: Encodable {
    let idempotencyKey: String
    let reason: String
    enum CodingKeys: String, CodingKey {
        case idempotencyKey = "idempotency_key"
        case reason
    }
}

private extension ISO8601DateFormatter {
    static let textSignalFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}
