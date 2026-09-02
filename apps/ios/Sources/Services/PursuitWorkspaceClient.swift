import CryptoKit
import Foundation

struct PursuitWorkspaceSession: Equatable {
    let baseURL: URL
    let accountSlug: String
    let userEmail: String
    let accessToken: String?
    let accountID: String?
    let userID: String?
    let userDisplayName: String?

    static func authenticated(_ session: TalentSignalSession) -> PursuitWorkspaceSession {
        PursuitWorkspaceSession(
            baseURL: session.baseURL,
            accountSlug: session.account.slug,
            userEmail: session.user.email,
            accessToken: session.accessToken,
            accountID: session.account.id,
            userID: session.user.id,
            userDisplayName: session.user.displayName
        )
    }

    static func configured(arguments: [String]) -> PursuitWorkspaceSession? {
#if DEBUG
        guard let backend = value(after: "--workspace-backend-url", in: arguments),
              let baseURL = URL(string: backend),
              URLFixtureLoader.isLoopback(baseURL) else {
            return nil
        }
        return PursuitWorkspaceSession(
            baseURL: baseURL,
            accountSlug: value(after: "--workspace-account-slug", in: arguments)
                ?? "fixture-alpha",
            userEmail: value(after: "--workspace-user-email", in: arguments)
                ?? "recruiter@alpha.local",
            accessToken: nil,
            accountID: value(after: "--workspace-account-id", in: arguments),
            userID: nil,
            userDisplayName: nil
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

struct PursuitEvidenceReviewResult: Equatable {
    let reviewID: String
    let priorReviewID: String?
    let decidedAt: String
}

private struct ConversationContactCaptureBody: Encodable {
    let contractVersion: String
    let idempotencyKey: String
    let channel: String
    let purpose: String
    let capturedAt: String
    let sourceTimezone: String
    let personScope: PersonScope
    let resource: Resource
    let confirmedIdentityHandles: [IdentityHandle]?
    let fragments: [Fragment]

    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case idempotencyKey = "idempotency_key"
        case channel, purpose
        case capturedAt = "captured_at"
        case sourceTimezone = "source_timezone"
        case personScope = "person_scope"
        case resource
        case confirmedIdentityHandles = "confirmed_identity_handles"
        case fragments
    }

    enum PersonScope: Encodable {
        case newPerson(
            displayLabel: String,
            relationshipContext: RelationshipContext,
            bindingBasis: String
        )
        case confirmed(
            personID: String,
            relationshipContext: RelationshipContext,
            bindingBasis: String
        )
        case unresolved(
            displayNameHint: String,
            handles: [IdentityHandle],
            relationshipContext: RelationshipContext,
            reason: String
        )

        enum CodingKeys: String, CodingKey {
            case status
            case displayLabel = "display_label"
            case personID = "person_id"
            case displayNameHint = "display_name_hint"
            case handles
            case relationshipContext = "relationship_context"
            case bindingBasis = "binding_basis"
            case reason
        }

        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            switch self {
            case let .newPerson(displayLabel, relationshipContext, bindingBasis):
                try container.encode("new_person", forKey: .status)
                try container.encode(displayLabel, forKey: .displayLabel)
                try container.encode(relationshipContext, forKey: .relationshipContext)
                try container.encode(bindingBasis, forKey: .bindingBasis)
            case let .confirmed(personID, relationshipContext, bindingBasis):
                try container.encode("confirmed", forKey: .status)
                try container.encode(personID, forKey: .personID)
                try container.encode(relationshipContext, forKey: .relationshipContext)
                try container.encode(bindingBasis, forKey: .bindingBasis)
            case let .unresolved(displayNameHint, handles, relationshipContext, reason):
                try container.encode("unresolved", forKey: .status)
                try container.encode(displayNameHint, forKey: .displayNameHint)
                try container.encode(handles, forKey: .handles)
                try container.encode(relationshipContext, forKey: .relationshipContext)
                try container.encode(reason, forKey: .reason)
            }
        }
    }

    struct RelationshipContext: Encodable {
        let status: String
        let relationshipContextID: String?
        let label: String?
        let purpose: String?

        enum CodingKeys: String, CodingKey {
            case status
            case relationshipContextID = "relationship_context_id"
            case label, purpose
        }
    }

    struct Resource: Encodable {
        let clientResourceID: String
        let kind: String
        let displayName: String
        let mediaType: String
        let observedAt: String
        let sourceTimezone: String
        let retention: Retention

        enum CodingKeys: String, CodingKey {
            case clientResourceID = "client_resource_id"
            case kind
            case displayName = "display_name"
            case mediaType = "media_type"
            case observedAt = "observed_at"
            case sourceTimezone = "source_timezone"
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

    struct IdentityHandle: Encodable {
        let type: String
        let value: String
        let sourceClientResourceID: String

        enum CodingKeys: String, CodingKey {
            case type, value
            case sourceClientResourceID = "source_client_resource_id"
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
            case kind, sequence, text, locator, attribution
            case reviewStatus = "review_status"
            case parser
        }
    }

    struct Locator: Encodable {
        let kind: String
        let revision: Int?
        let field: String?
        let sourceRecordVersion: String?

        enum CodingKeys: String, CodingKey {
            case kind, revision, field
            case sourceRecordVersion = "source_record_version"
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

struct ChatMediaAsset: Codable, Equatable, Identifiable {
    let id: String
    let fileName: String
    let mediaType: String
    let byteSize: Int
    let width: Int?
    let height: Int?
    let status: String
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, width, height, status
        case fileName = "file_name"
        case mediaType = "media_type"
        case byteSize = "byte_size"
        case createdAt = "created_at"
    }
}

struct ChatMediaContent: Equatable {
    let data: Data
    let mediaType: String
}

protocol PursuitWorkspaceServing {
    func loadWorkspace() async throws -> PursuitWorkspaceSnapshot
    func findContactMatches(
        identityClue: ConversationContactDraft.IdentityClue
    ) async throws -> [WorkspacePerson]
    func saveContactDraft(
        _ draft: ConversationContactDraft,
        target: ConversationContactTarget,
        confirmIdentityClue: Bool,
        capturedAt: Date,
        idempotencyKey: String
    ) async throws -> ResourceCaptureResult
    func ask(
        objective: String,
        personID: String,
        relationshipContextID: String,
        idempotencyKey: String
    ) async throws -> RelationshipAskResponse
    func ask(
        objective: String,
        personID: String,
        relationshipContextID: String,
        idempotencyKey: String,
        mediaIDs: [String]
    ) async throws -> RelationshipAskResponse
    func chatUnscoped(
        objective: String,
        idempotencyKey: String
    ) async throws -> UnscopedChatTaskResponse
    func researchPerson(
        objective: String,
        imageData: Data,
        mediaType: String,
        idempotencyKey: String
    ) async throws -> PersonResearchTaskResponse
    func createChatMedia(
        personID: String,
        relationshipContextID: String,
        fileName: String,
        mediaType: String,
        byteSize: Int,
        width: Int?,
        height: Int?,
        idempotencyKey: String
    ) async throws -> ChatMediaAsset
    func uploadChatMedia(id: String, data: Data, mediaType: String) async throws -> ChatMediaAsset
    func deleteChatMedia(id: String) async throws
    func loadChatMedia(id: String) async throws -> ChatMediaContent
    func revalidateAsk(
        response: RelationshipAskResponse,
        personID: String,
        relationshipContextID: String
    ) async throws
    func readOperation(id: UUID) async throws -> PursuitActionOperationReadback
    func rejectEvidence(
        fragmentID: String,
        expectedReviewStatus: String,
        expectedLastReviewID: String?,
        reason: String,
        idempotencyKey: String
    ) async throws -> PursuitEvidenceReviewResult
    func reviewEvidence(
        fragmentID: String,
        expectedReviewStatus: String,
        expectedLastReviewID: String?,
        decision: String,
        reason: String,
        idempotencyKey: String
    ) async throws -> PursuitEvidenceReviewResult
    func completeAction(
        pursuitID: String,
        actionID: String,
        expectedPursuitRevision: Int,
        expectedActionRevision: Int,
        outcomeSummary: String,
        operationID: UUID
    ) async throws -> PursuitActionCompletionResult
}

extension PursuitWorkspaceServing {
    func findContactMatches(
        identityClue: ConversationContactDraft.IdentityClue
    ) async throws -> [WorkspacePerson] {
        throw PursuitWorkspaceClientError.askUnavailable
    }

    func saveContactDraft(
        _ draft: ConversationContactDraft,
        target: ConversationContactTarget,
        confirmIdentityClue: Bool,
        capturedAt: Date,
        idempotencyKey: String
    ) async throws -> ResourceCaptureResult {
        throw PursuitWorkspaceClientError.askUnavailable
    }

    func ask(
        objective: String,
        personID: String,
        relationshipContextID: String,
        idempotencyKey: String
    ) async throws -> RelationshipAskResponse {
        throw PursuitWorkspaceClientError.askUnavailable
    }

    func ask(
        objective: String,
        personID: String,
        relationshipContextID: String,
        idempotencyKey: String,
        mediaIDs: [String]
    ) async throws -> RelationshipAskResponse {
        guard mediaIDs.isEmpty else { throw PursuitWorkspaceClientError.askUnavailable }
        return try await ask(
            objective: objective,
            personID: personID,
            relationshipContextID: relationshipContextID,
            idempotencyKey: idempotencyKey
        )
    }

    func chatUnscoped(
        objective: String,
        idempotencyKey: String
    ) async throws -> UnscopedChatTaskResponse {
        throw PursuitWorkspaceClientError.askUnavailable
    }

    func researchPerson(
        objective: String,
        imageData: Data,
        mediaType: String,
        idempotencyKey: String
    ) async throws -> PersonResearchTaskResponse {
        throw PursuitWorkspaceClientError.askUnavailable
    }

    func createChatMedia(
        personID: String,
        relationshipContextID: String,
        fileName: String,
        mediaType: String,
        byteSize: Int,
        width: Int?,
        height: Int?,
        idempotencyKey: String
    ) async throws -> ChatMediaAsset {
        throw PursuitWorkspaceClientError.askUnavailable
    }

    func uploadChatMedia(id: String, data: Data, mediaType: String) async throws -> ChatMediaAsset {
        throw PursuitWorkspaceClientError.askUnavailable
    }

    func deleteChatMedia(id: String) async throws {
        throw PursuitWorkspaceClientError.askUnavailable
    }

    func loadChatMedia(id: String) async throws -> ChatMediaContent {
        throw PursuitWorkspaceClientError.askUnavailable
    }

    func revalidateAsk(
        response: RelationshipAskResponse,
        personID: String,
        relationshipContextID: String
    ) async throws {
        throw PursuitWorkspaceClientError.askUnavailable
    }

    func readOperation(id: UUID) async throws -> PursuitActionOperationReadback {
        throw PursuitWorkspaceClientError.actionCompletionUnavailable
    }

    func rejectEvidence(
        fragmentID: String,
        expectedReviewStatus: String,
        expectedLastReviewID: String?,
        reason: String,
        idempotencyKey: String
    ) async throws -> PursuitEvidenceReviewResult {
        throw PursuitWorkspaceClientError.askUnavailable
    }

    func reviewEvidence(
        fragmentID: String,
        expectedReviewStatus: String,
        expectedLastReviewID: String?,
        decision: String,
        reason: String,
        idempotencyKey: String
    ) async throws -> PursuitEvidenceReviewResult {
        guard decision == "rejected" else {
            throw PursuitWorkspaceClientError.askUnavailable
        }
        return try await rejectEvidence(
            fragmentID: fragmentID,
            expectedReviewStatus: expectedReviewStatus,
            expectedLastReviewID: expectedLastReviewID,
            reason: reason,
            idempotencyKey: idempotencyKey
        )
    }

    func completeAction(
        pursuitID: String,
        actionID: String,
        expectedPursuitRevision: Int,
        expectedActionRevision: Int,
        outcomeSummary: String,
        operationID: UUID
    ) async throws -> PursuitActionCompletionResult {
        throw PursuitWorkspaceClientError.actionCompletionUnavailable
    }
}

struct PursuitActionCompletionResult: Equatable {
    let pursuit: WorkspacePursuit
    let receipt: PursuitReviewReceipt
}

struct PursuitActionOperationReadback: Decodable, Equatable {
    let contractVersion: String
    let operation: Operation
    let receipt: PursuitReviewReceipt?
    let pursuit: WorkspacePursuit

    struct Operation: Decodable, Equatable {
        let id: String
        let pursuitID: String
        let proposalID: String?
        let operationKind: String
        let status: String
        let beforeRevision: Int
        let afterRevision: Int?

        enum CodingKeys: String, CodingKey {
            case id, status
            case pursuitID = "pursuit_id"
            case proposalID = "proposal_id"
            case operationKind = "operation_kind"
            case beforeRevision = "before_revision"
            case afterRevision = "after_revision"
        }
    }

    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case operation, receipt, pursuit
    }
}

actor URLPursuitWorkspaceClient: PursuitWorkspaceServing {
    private let baseURL: URL
    private let accountSlug: String
    private let userEmail: String
    private let session: URLSession
    private var authenticatedSession: WorkspaceLoginResponse?

    init(
        baseURL: URL,
        accountSlug: String = "fixture-alpha",
        userEmail: String = "recruiter@alpha.local",
        accessToken: String? = nil,
        accountID: String? = nil,
        userID: String? = nil,
        userDisplayName: String? = nil,
        session: URLSession = .shared
    ) {
        self.baseURL = baseURL
        self.accountSlug = accountSlug
        self.userEmail = userEmail
        self.session = session
        if let accessToken, let accountID, let userID, let userDisplayName {
            authenticatedSession = WorkspaceLoginResponse(
                contractVersion: TalentSignalAPIContract.version,
                accessToken: accessToken,
                account: .init(id: accountID),
                user: .init(id: userID, displayName: userDisplayName)
            )
        }
    }

    func loadWorkspace() async throws -> PursuitWorkspaceSnapshot {
        guard authenticatedSession != nil || URLFixtureLoader.isLoopback(baseURL) else {
            throw PursuitWorkspaceClientError.loopbackOnly
        }
        let login = try await loginIfNeeded()
        async let pursuits: WorkspacePursuitListEnvelope = request(
            path: "v1/pursuits",
            token: login.accessToken
        )
        async let people: WorkspacePeopleEnvelope = request(
            path: "v1/people",
            token: login.accessToken
        )
        async let proposals: WorkspaceProposalListEnvelope = request(
            path: "v1/pursuit-proposals",
            token: login.accessToken
        )
        let result = try await (pursuits, people, proposals)
        guard result.0.contractVersion == TalentSignalAPIContract.version,
              result.1.contractVersion == TalentSignalAPIContract.version,
              result.2.contractVersion == TalentSignalAPIContract.version,
              result.0.workspaceID == login.account.id,
              result.2.workspaceID == login.account.id,
              result.0.pursuits.allSatisfy({ $0.workspaceID == login.account.id }) else {
            throw PursuitWorkspaceClientError.scopeReadbackMismatch
        }
        return PursuitWorkspaceSnapshot(
            workspaceID: login.account.id,
            currentUserID: login.user.id,
            currentUserName: login.user.displayName,
            pursuits: result.0.pursuits,
            people: result.1.people,
            proposals: result.2.proposals,
            loadedAt: Date()
        )
    }

    func findContactMatches(
        identityClue: ConversationContactDraft.IdentityClue
    ) async throws -> [WorkspacePerson] {
        guard authenticatedSession != nil || URLFixtureLoader.isLoopback(baseURL) else {
            throw PursuitWorkspaceClientError.loopbackOnly
        }
        let login = try await loginIfNeeded()
        let result: WorkspacePeopleEnvelope = try await post(
            path: "v1/people/search",
            token: login.accessToken,
            body: WorkspacePeopleSearchBody(query: identityClue.value)
        )
        guard result.contractVersion == TalentSignalAPIContract.version else {
            throw PursuitWorkspaceClientError.scopeReadbackMismatch
        }
        return ConversationContactMatchPolicy.authoritativeMatches(in: result.people)
    }

    func saveContactDraft(
        _ draft: ConversationContactDraft,
        target: ConversationContactTarget,
        confirmIdentityClue: Bool,
        capturedAt: Date,
        idempotencyKey: String
    ) async throws -> ResourceCaptureResult {
        guard authenticatedSession != nil || URLFixtureLoader.isLoopback(baseURL) else {
            throw PursuitWorkspaceClientError.loopbackOnly
        }
        let login = try await loginIfNeeded()
        let observedAt = Self.contactTimestamp(capturedAt)
        let clientResourceID = "ios-contact:\(idempotencyKey.suffix(72))"
        let personScope: ConversationContactCaptureBody.PersonScope
        switch target {
        case .newPerson:
            personScope = .newPerson(
                displayLabel: draft.name,
                relationshipContext: .init(
                    status: "proposed",
                    relationshipContextID: nil,
                    label: draft.relationshipContext,
                    purpose: "Recruiter-defined relationship context"
                ),
                bindingBasis: "The signed-in recruiter reviewed the Agent proposal and explicitly chose to create a new person."
            )
        case let .existingPerson(personID, relationshipContextID):
            personScope = .confirmed(
                personID: personID,
                relationshipContext: .init(
                    status: relationshipContextID == nil ? "proposed" : "existing",
                    relationshipContextID: relationshipContextID,
                    label: relationshipContextID == nil ? draft.relationshipContext : nil,
                    purpose: relationshipContextID == nil
                        ? "Recruiter-defined relationship context"
                        : nil
                ),
                bindingBasis: "The signed-in recruiter reviewed the visible identity match and explicitly chose this person."
            )
        case .unresolved:
            let handles = draft.identityClue.map {
                [ConversationContactCaptureBody.IdentityHandle(
                    type: $0.type,
                    value: $0.value,
                    sourceClientResourceID: clientResourceID
                )]
            } ?? []
            personScope = .unresolved(
                displayNameHint: draft.name,
                handles: handles,
                relationshipContext: .init(
                    status: "proposed",
                    relationshipContextID: nil,
                    label: draft.relationshipContext,
                    purpose: "Recruiter-defined relationship context"
                ),
                reason: "The recruiter preserved this source for identity review because current and historical identity ownership conflict."
            )
        }
        let confirmedHandles: [ConversationContactCaptureBody.IdentityHandle]?
        if target != .unresolved, confirmIdentityClue, let clue = draft.identityClue {
            confirmedHandles = [
                .init(
                    type: clue.type,
                    value: clue.value,
                    sourceClientResourceID: clientResourceID
                )
            ]
        } else {
            confirmedHandles = nil
        }
        let body = ConversationContactCaptureBody(
            contractVersion: TalentSignalAPIContract.version,
            idempotencyKey: idempotencyKey,
            channel: "chat",
            purpose: "Preserve a recruiter-reviewed contact note after explicit identity confirmation",
            capturedAt: observedAt,
            sourceTimezone: TimeZone.current.identifier,
            personScope: personScope,
            resource: .init(
                clientResourceID: clientResourceID,
                kind: "contact_record",
                displayName: "Agent contact intake",
                mediaType: "text/plain",
                observedAt: observedAt,
                sourceTimezone: TimeZone.current.identifier,
                retention: .init(
                    requestedMode: "ephemeral",
                    sourceScope: "reviewed_selected_text"
                )
            ),
            confirmedIdentityHandles: confirmedHandles,
            fragments: [
                .init(
                    clientResourceID: clientResourceID,
                    kind: "contact_field",
                    sequence: 0,
                    text: draft.sourceNote,
                    locator: .init(
                        kind: "contact_field",
                        revision: nil,
                        field: "source_note",
                        sourceRecordVersion: "1"
                    ),
                    attribution: .init(actorKind: "recruiter", status: "confirmed"),
                    reviewStatus: "reviewed",
                    parser: .init(
                        name: draft.interpreter?.name ?? "ios-agent-contact-intake",
                        version: draft.interpreter?.version ?? "1.0.0"
                    )
                )
            ]
        )
        let result: ResourceCaptureResult = try await post(
            path: "v1/resource-captures",
            token: login.accessToken,
            body: body
        )
        switch target {
        case .unresolved:
            guard ["needs_review", "unresolved"].contains(result.identity.status),
                  result.identity.personID == nil,
                  result.identity.resolutionCaseID != nil else {
                throw PursuitWorkspaceClientError.scopeReadbackMismatch
            }
        case .newPerson, .existingPerson:
            guard result.identity.status == "bound", result.identity.personID != nil else {
                throw PursuitWorkspaceClientError.scopeReadbackMismatch
            }
        }
        if case let .existingPerson(expectedPersonID, expectedContextID) = target {
            guard result.identity.personID == expectedPersonID,
                  expectedContextID == nil
                    || result.identity.relationshipContextID == expectedContextID else {
                throw PursuitWorkspaceClientError.scopeReadbackMismatch
            }
        }
        return result
    }

    func ask(
        objective: String,
        personID: String,
        relationshipContextID: String,
        idempotencyKey: String
    ) async throws -> RelationshipAskResponse {
        try await ask(
            objective: objective,
            personID: personID,
            relationshipContextID: relationshipContextID,
            idempotencyKey: idempotencyKey,
            mediaIDs: []
        )
    }

    func ask(
        objective: String,
        personID: String,
        relationshipContextID: String,
        idempotencyKey: String,
        mediaIDs: [String]
    ) async throws -> RelationshipAskResponse {
        guard authenticatedSession != nil || URLFixtureLoader.isLoopback(baseURL) else {
            throw PursuitWorkspaceClientError.loopbackOnly
        }
        let login = try await loginIfNeeded()
        let body = RelationshipAskBody(
            idempotencyKey: idempotencyKey,
            objective: objective,
            personID: personID,
            relationshipContextID: relationshipContextID,
            mediaIDs: mediaIDs
        )
        let response: RelationshipAskResponse
        do {
            response = try await post(
                path: "v1/chat/tasks",
                token: login.accessToken,
                body: body
            )
        } catch let PursuitWorkspaceClientError.backend(code, _)
            where code == "WIKI_SNAPSHOT_NOT_FOUND" {
            let snapshot: WorkspaceWikiCompilationResponse = try await post(
                path: "v1/people/\(personID)/contexts/\(relationshipContextID)/wiki-compilations",
                token: login.accessToken,
                body: WorkspaceWikiCompilationBody(
                    idempotencyKey: "\(idempotencyKey):compile",
                    objective: "Prepare cited relationship context for this recruiter-initiated Ask request."
                )
            )
            guard snapshot.accountID == login.account.id,
                  snapshot.personID == personID,
                  snapshot.relationshipContextID == relationshipContextID else {
                throw PursuitWorkspaceClientError.askCompilationScopeMismatch
            }
            response = try await post(
                path: "v1/chat/tasks",
                token: login.accessToken,
                body: body
            )
        }
        guard response.contractVersion == TalentSignalAPIContract.version else {
            throw PursuitWorkspaceClientError.askResponseContractMismatch
        }
        let readback: RelationshipAskReadback = try await request(
            path: "v1/chat/tasks/\(response.taskID)/readback",
            token: login.accessToken
        )
        return try readback.validated(
            response,
            expectedAccountID: login.account.id,
            expectedPersonID: personID,
            expectedRelationshipContextID: relationshipContextID
        )
    }

    func chatUnscoped(
        objective: String,
        idempotencyKey: String
    ) async throws -> UnscopedChatTaskResponse {
        guard authenticatedSession != nil || URLFixtureLoader.isLoopback(baseURL) else {
            throw PursuitWorkspaceClientError.loopbackOnly
        }
        let login = try await loginIfNeeded()
        let response: UnscopedChatTaskResponse = try await post(
            path: "v1/chat/unscoped-tasks",
            token: login.accessToken,
            body: UnscopedChatTaskBody(
                idempotencyKey: idempotencyKey,
                objective: objective
            )
        )
        guard response.contractVersion == TalentSignalAPIContract.version,
              UUID(uuidString: response.taskID) != nil,
              ["answer", "clarify"].contains(response.disposition),
              response.externalEffects.isEmpty,
              response.blocks.count == 1,
              response.blocks.allSatisfy({ block in
                  ["answer", "clarification"].contains(block.kind)
                      && block.citationDependencyIDs.isEmpty
                      && block.targetRef == nil
                      && (block.publicSources ?? []).isEmpty
              }) else {
            throw PursuitWorkspaceClientError.invalidResponse
        }
        return response
    }

    func researchPerson(
        objective: String,
        imageData: Data,
        mediaType: String,
        idempotencyKey: String
    ) async throws -> PersonResearchTaskResponse {
        guard authenticatedSession != nil || URLFixtureLoader.isLoopback(baseURL) else {
            throw PursuitWorkspaceClientError.loopbackOnly
        }
        guard ["image/jpeg", "image/png", "image/webp"].contains(mediaType),
              (1...8_388_608).contains(imageData.count) else {
            throw PursuitWorkspaceClientError.personResearchReceiptMismatch
        }
        let login = try await loginIfNeeded()
        let contentHash = SHA256.hash(data: imageData)
            .map { String(format: "%02x", $0) }
            .joined()
        let response: PersonResearchTaskResponse = try await post(
            path: "v1/person-research/tasks",
            token: login.accessToken,
            body: PersonResearchTaskBody(
                idempotencyKey: idempotencyKey,
                objective: objective,
                image: .init(
                    mediaType: mediaType,
                    byteSize: imageData.count,
                    contentHash: contentHash,
                    dataBase64: imageData.base64EncodedString()
                )
            )
        )
        try response.validate(
            expectedMediaType: mediaType,
            expectedByteSize: imageData.count,
            expectedContentHash: contentHash
        )
        return response
    }

    func createChatMedia(
        personID: String,
        relationshipContextID: String,
        fileName: String,
        mediaType: String,
        byteSize: Int,
        width: Int?,
        height: Int?,
        idempotencyKey: String
    ) async throws -> ChatMediaAsset {
        guard authenticatedSession != nil || URLFixtureLoader.isLoopback(baseURL) else {
            throw PursuitWorkspaceClientError.loopbackOnly
        }
        let login = try await loginIfNeeded()
        return try await post(
            path: "v1/chat/media",
            token: login.accessToken,
            body: CreateChatMediaBody(
                idempotencyKey: idempotencyKey,
                personID: personID,
                relationshipContextID: relationshipContextID,
                fileName: fileName,
                mediaType: mediaType,
                byteSize: byteSize,
                width: width,
                height: height
            )
        )
    }

    func uploadChatMedia(id: String, data: Data, mediaType: String) async throws -> ChatMediaAsset {
        guard authenticatedSession != nil || URLFixtureLoader.isLoopback(baseURL) else {
            throw PursuitWorkspaceClientError.loopbackOnly
        }
        let login = try await loginIfNeeded()
        var request = URLRequest(url: baseURL.appending(path: "v1/chat/media/\(id)/content"))
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "accept")
        request.setValue(mediaType, forHTTPHeaderField: "content-type")
        request.setValue("Bearer \(login.accessToken)", forHTTPHeaderField: "authorization")
        request.httpBody = data
        return try await decodedResponse(request, rejectionMessage: "The image upload was rejected.")
    }

    func deleteChatMedia(id: String) async throws {
        guard authenticatedSession != nil || URLFixtureLoader.isLoopback(baseURL) else {
            throw PursuitWorkspaceClientError.loopbackOnly
        }
        let login = try await loginIfNeeded()
        var request = URLRequest(url: baseURL.appending(path: "v1/chat/media/\(id)"))
        request.httpMethod = "DELETE"
        request.setValue("application/json", forHTTPHeaderField: "accept")
        request.setValue("Bearer \(login.accessToken)", forHTTPHeaderField: "authorization")
        let response: ChatMediaDeleteResponse = try await decodedResponse(
            request,
            rejectionMessage: "The image could not be removed."
        )
        guard response.id == id, response.status == "deleted" else {
            throw PursuitWorkspaceClientError.invalidResponse
        }
    }

    func loadChatMedia(id: String) async throws -> ChatMediaContent {
        guard authenticatedSession != nil || URLFixtureLoader.isLoopback(baseURL) else {
            throw PursuitWorkspaceClientError.loopbackOnly
        }
        let login = try await loginIfNeeded()
        var request = URLRequest(url: baseURL.appending(path: "v1/chat/media/\(id)/content"))
        request.httpMethod = "GET"
        request.setValue("image/*", forHTTPHeaderField: "accept")
        request.setValue("Bearer \(login.accessToken)", forHTTPHeaderField: "authorization")
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw PursuitWorkspaceClientError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            throw Self.backendError(data: data, statusCode: http.statusCode, fallback: "The image could not be read.")
        }
        guard let mediaType = http.value(forHTTPHeaderField: "content-type"),
              mediaType.hasPrefix("image/"), !data.isEmpty else {
            throw PursuitWorkspaceClientError.invalidResponse
        }
        return ChatMediaContent(data: data, mediaType: mediaType)
    }

    func revalidateAsk(
        response: RelationshipAskResponse,
        personID: String,
        relationshipContextID: String
    ) async throws {
        guard authenticatedSession != nil || URLFixtureLoader.isLoopback(baseURL) else {
            throw PursuitWorkspaceClientError.loopbackOnly
        }
        let login = try await loginIfNeeded()
        let readback: RelationshipAskReadback = try await request(
            path: "v1/chat/tasks/\(response.taskID)/readback",
            token: login.accessToken
        )
        _ = try readback.validated(
            response,
            expectedAccountID: login.account.id,
            expectedPersonID: personID,
            expectedRelationshipContextID: relationshipContextID
        )
    }

    func rejectEvidence(
        fragmentID: String,
        expectedReviewStatus: String,
        expectedLastReviewID: String?,
        reason: String,
        idempotencyKey: String
    ) async throws -> PursuitEvidenceReviewResult {
        try await reviewEvidence(
            fragmentID: fragmentID,
            expectedReviewStatus: expectedReviewStatus,
            expectedLastReviewID: expectedLastReviewID,
            decision: "rejected",
            reason: reason,
            idempotencyKey: idempotencyKey
        )
    }

    func reviewEvidence(
        fragmentID: String,
        expectedReviewStatus: String,
        expectedLastReviewID: String?,
        decision: String,
        reason: String,
        idempotencyKey: String
    ) async throws -> PursuitEvidenceReviewResult {
        guard ["reviewed", "rejected"].contains(decision),
              authenticatedSession != nil || URLFixtureLoader.isLoopback(baseURL) else {
            throw PursuitWorkspaceClientError.loopbackOnly
        }
        let login = try await loginIfNeeded()
        let response: WorkspaceEvidenceReviewResponse = try await post(
            path: "v1/evidence-fragments/\(fragmentID)/reviews",
            token: login.accessToken,
            body: WorkspaceEvidenceReviewBody(
                idempotencyKey: idempotencyKey,
                expectedReviewStatus: expectedReviewStatus,
                expectedLastReviewID: expectedLastReviewID,
                decision: decision,
                reason: reason
            )
        )
        return try Self.validatedEvidenceReviewResult(
            expectedFragmentID: fragmentID,
            expectedLastReviewID: expectedLastReviewID,
            expectedDecision: decision,
            responseFragmentID: response.fragmentID,
            responseReviewID: response.reviewID,
            responsePriorReviewID: response.priorReviewID,
            responseReviewStatus: response.reviewStatus,
            responseDecidedAt: response.decidedAt
        )
    }

    func completeAction(
        pursuitID: String,
        actionID: String,
        expectedPursuitRevision: Int,
        expectedActionRevision: Int,
        outcomeSummary: String,
        operationID: UUID
    ) async throws -> PursuitActionCompletionResult {
        guard authenticatedSession != nil || URLFixtureLoader.isLoopback(baseURL) else {
            throw PursuitWorkspaceClientError.loopbackOnly
        }
        let login = try await loginIfNeeded()
        let body = WorkspaceActionCompletionBody(
            operationID: operationID.uuidString.lowercased(),
            idempotencyKey: "ios:complete-pursuit-action:\(operationID.uuidString.lowercased())",
            expectedPursuitRevision: expectedPursuitRevision,
            expectedActionRevision: expectedActionRevision,
            outcomeSummary: outcomeSummary
        )
        let envelope: WorkspaceActionCompletionEnvelope = try await post(
            path: "v1/pursuits/\(pursuitID)/actions/\(actionID)/completions",
            token: login.accessToken,
            body: body
        )
        guard envelope.contractVersion == TalentSignalAPIContract.version,
              envelope.pursuit.workspaceID == login.account.id,
              envelope.pursuit.id == pursuitID,
              envelope.receipt.workspaceID == login.account.id,
              envelope.receipt.operationID == operationID.uuidString.lowercased(),
              envelope.receipt.operationKind == "revise_pursuit",
              envelope.receipt.status == "applied",
              envelope.receipt.proposalID == nil,
              envelope.receipt.actorUserID == login.user.id,
              envelope.receipt.outcome == "canonical_applied",
              envelope.receipt.entityRef.beforeRevision == expectedPursuitRevision,
              envelope.receipt.entityRef.afterRevision == expectedPursuitRevision + 1,
              envelope.receipt.entityRef.afterRevision == envelope.pursuit.revision,
              Set(envelope.receipt.changedFields) == Set([
                "actions.\(actionID).status",
                "actions.\(actionID).outcome_summary",
              ]),
              envelope.receipt.externalEffects.isEmpty else {
            throw PursuitWorkspaceClientError.scopeReadbackMismatch
        }
        guard let action = envelope.pursuit.actions.first(where: { $0.id == actionID }),
              action.status == "completed",
              action.revision == expectedActionRevision + 1,
              action.outcomeSummary == outcomeSummary.trimmingCharacters(in: .whitespacesAndNewlines),
              action.completedAt != nil else {
            throw PursuitWorkspaceClientError.invalidResponse
        }
        return PursuitActionCompletionResult(
            pursuit: envelope.pursuit,
            receipt: envelope.receipt
        )
    }

    func readOperation(id: UUID) async throws -> PursuitActionOperationReadback {
        guard authenticatedSession != nil || URLFixtureLoader.isLoopback(baseURL) else {
            throw PursuitWorkspaceClientError.loopbackOnly
        }
        let login = try await loginIfNeeded()
        let envelope: PursuitActionOperationReadback = try await request(
            path: "v1/operations/\(id.uuidString.lowercased())",
            token: login.accessToken
        )
        guard envelope.contractVersion == TalentSignalAPIContract.version,
              envelope.operation.id == id.uuidString.lowercased(),
              envelope.operation.pursuitID == envelope.pursuit.id,
              envelope.operation.proposalID == nil,
              envelope.operation.operationKind == "revise_pursuit",
              envelope.pursuit.workspaceID == login.account.id,
              envelope.receipt.map({ $0.workspaceID == login.account.id }) ?? true else {
            throw PursuitWorkspaceClientError.scopeReadbackMismatch
        }
        return envelope
    }

    private func request<Response: Decodable>(
        path: String,
        token: String
    ) async throws -> Response {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw PursuitWorkspaceClientError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let envelope = try? JSONDecoder().decode(WorkspaceErrorEnvelope.self, from: data)
            throw PursuitWorkspaceClientError.backend(
                code: envelope?.error?.code ?? "HTTP_\(http.statusCode)",
                message: envelope?.error?.message ?? "The workspace read was rejected."
            )
        }
        do {
            return try JSONDecoder().decode(Response.self, from: data)
        } catch {
            throw PursuitWorkspaceClientError.invalidResponse
        }
    }

    private func post<Response: Decodable, Body: Encodable>(
        path: String,
        token: String,
        body: Body
    ) async throws -> Response {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "accept")
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
        request.httpBody = try JSONEncoder().encode(body)
        return try await decodedResponse(request, rejectionMessage: "The action outcome was rejected.")
    }

    private func decodedResponse<Response: Decodable>(
        _ request: URLRequest,
        rejectionMessage: String
    ) async throws -> Response {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw PursuitWorkspaceClientError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            throw Self.backendError(data: data, statusCode: http.statusCode, fallback: rejectionMessage)
        }
        do {
            return try JSONDecoder().decode(Response.self, from: data)
        } catch {
            throw PursuitWorkspaceClientError.invalidResponse
        }
    }

    private static func backendError(
        data: Data,
        statusCode: Int,
        fallback: String
    ) -> PursuitWorkspaceClientError {
        let envelope = try? JSONDecoder().decode(WorkspaceErrorEnvelope.self, from: data)
        return .backend(
            code: envelope?.error?.code ?? "HTTP_\(statusCode)",
            message: envelope?.error?.message ?? fallback
        )
    }

    private static func isVerifiedTimestamp(_ value: String) -> Bool {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) != nil
            || ISO8601DateFormatter().date(from: value) != nil
    }

    private static func contactTimestamp(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    static func validatedEvidenceReviewResult(
        expectedFragmentID: String,
        expectedLastReviewID: String?,
        expectedDecision: String,
        responseFragmentID: String,
        responseReviewID: String,
        responsePriorReviewID: String?,
        responseReviewStatus: String,
        responseDecidedAt: String
    ) throws -> PursuitEvidenceReviewResult {
        guard responseFragmentID == expectedFragmentID,
              responseReviewStatus == expectedDecision,
              responsePriorReviewID == expectedLastReviewID,
              !responseReviewID.isEmpty,
              isVerifiedTimestamp(responseDecidedAt) else {
            throw PursuitWorkspaceClientError.scopeReadbackMismatch
        }
        return PursuitEvidenceReviewResult(
            reviewID: responseReviewID,
            priorReviewID: responsePriorReviewID,
            decidedAt: responseDecidedAt
        )
    }

    private func loginIfNeeded() async throws -> WorkspaceLoginResponse {
        if let authenticatedSession { return authenticatedSession }
        var request = URLRequest(url: baseURL.appending(path: "v1/auth/simulated-login"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONEncoder().encode(
            WorkspaceLoginBody(
                accountSlug: accountSlug,
                userEmail: userEmail,
                clientLabel: "ios-pursuit-workspace"
            )
        )
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse,
              (200...299).contains(http.statusCode),
              let login = try? JSONDecoder().decode(WorkspaceLoginResponse.self, from: data),
              login.contractVersion == TalentSignalAPIContract.version else {
            throw PursuitWorkspaceClientError.loginFailed
        }
        authenticatedSession = login
        return login
    }
}

struct AskCitationReviewRequirement: Equatable {
    let taskID: String
    let citation: RelationshipAskResponse.Citation
}

enum PursuitWorkspaceClientError: LocalizedError, Equatable {
    case loopbackOnly
    case loginFailed
    case invalidResponse
    case scopeReadbackMismatch
    case askCompilationScopeMismatch
    case askResponseContractMismatch
    case askReadbackEnvelopeMismatch
    case askCitationBindingMismatch
    case askCitationReviewAuthorityMissing
    case askCitationReviewRequired(AskCitationReviewRequirement)
    case citedEvidenceUnavailable
    case personResearchReceiptMismatch
    case actionCompletionUnavailable
    case askUnavailable
    case backend(code: String, message: String)

    var isSupersededEvidenceReview: Bool {
        guard case let .backend(code, _) = self else { return false }
        return code == "EVIDENCE_REVIEW_AUTHORITY_STALE"
    }

    var errorDescription: String? {
        switch self {
        case .loopbackOnly:
            return "This development workspace reads only from the localhost backend."
        case .loginFailed:
            return "The canonical workspace session could not be opened."
        case .invalidResponse:
            return "The canonical workspace response could not be verified."
        case .scopeReadbackMismatch:
            return "The workspace readback did not match the authenticated account."
        case .askCompilationScopeMismatch:
            return "Ask stopped because the compiled relationship context did not match the selected person and workspace."
        case .askResponseContractMismatch:
            return "Ask stopped because the response contract could not be verified."
        case .askReadbackEnvelopeMismatch:
            return "Ask stopped because the task readback did not match the selected person, context, and workspace."
        case .askCitationBindingMismatch:
            return "Ask stopped because a cited source was not bound to the selected person and context."
        case .askCitationReviewAuthorityMissing,
             .askCitationReviewRequired(_):
            return "Ask stopped because a cited source needs a current recruiter review before it can be used."
        case .citedEvidenceUnavailable:
            return "Ask stopped because one cited source is unavailable or outside its current authorization."
        case .personResearchReceiptMismatch:
            return "Screenshot research stopped because its zero-retention receipt or public-source result could not be verified."
        case .actionCompletionUnavailable:
            return "Canonical action completion is unavailable in this workspace."
        case .askUnavailable:
            return "Ask needs a connected canonical workspace."
        case let .backend(code, message):
            return "\(message) (\(code))"
        }
    }
}

struct RelationshipAskResponse: Decodable, Equatable, Identifiable {
    let contractVersion: String
    let taskID: String
    let contextManifestID: String
    let knowledgeSnapshotID: String
    let disposition: String
    let blocks: [Block]
    let media: [ChatMediaAsset]
    let createdAt: String
    let citations: [Citation]

    var id: String { taskID }

    struct Block: Codable, Equatable, Identifiable {
        let id: String
        let kind: String
        let title: String
        let body: String
        let status: String
        let citationDependencyIDs: [String]
        let requiresUserDecision: Bool
        let targetRef: TargetRef?
        let publicSources: [PublicSource]?

        struct PublicSource: Codable, Equatable, Identifiable {
            let resultID: String
            let providerID: String
            let platform: String
            let profileURL: String
            let displayName: String
            let handle: String?
            let biography: String?
            let avatarURL: String?
            let verified: Bool?
            let matchBasis: String
            let contentHash: String
            let retrievedAt: String

            var id: String { resultID }

            enum CodingKeys: String, CodingKey {
                case resultID = "result_id"
                case providerID = "provider_id"
                case platform
                case profileURL = "profile_url"
                case displayName = "display_name"
                case handle, biography
                case avatarURL = "avatar_url"
                case verified
                case matchBasis = "match_basis"
                case contentHash = "content_hash"
                case retrievedAt = "retrieved_at"
            }
        }

        struct TargetRef: Codable, Equatable {
            let type: String
            let pursuitID: String
            let actionID: String

            enum CodingKeys: String, CodingKey {
                case type
                case pursuitID = "pursuit_id"
                case actionID = "action_id"
            }
        }

        enum CodingKeys: String, CodingKey {
            case id, kind, title, body, status
            case citationDependencyIDs = "citation_dependency_ids"
            case requiresUserDecision = "requires_user_decision"
            case targetRef = "target_ref"
            case publicSources = "public_source_refs"
        }

        init(
            id: String,
            kind: String,
            title: String,
            body: String,
            status: String,
            citationDependencyIDs: [String],
            requiresUserDecision: Bool,
            targetRef: TargetRef? = nil,
            publicSources: [PublicSource]? = nil
        ) {
            self.id = id
            self.kind = kind
            self.title = title
            self.body = body
            self.status = status
            self.citationDependencyIDs = citationDependencyIDs
            self.requiresUserDecision = requiresUserDecision
            self.targetRef = targetRef
            self.publicSources = publicSources
        }
    }

    struct Citation: Codable, Equatable, Identifiable {
        let id: String
        let dependencyType: String
        let personID: String?
        let relationshipContextID: String?
        let inclusionReason: String
        let authorizationScope: String
        let availability: String
        let unavailableReason: String?
        let resourceID: String
        let sourceName: String
        let observedAt: String
        let sourceTimezone: String?
        let captureVersion: Int
        let fragmentKind: String
        let sequence: Int
        let exactExcerpt: String?
        let attribution: Attribution
        let reviewStatus: String
        let parser: Parser
        let contentHash: String
        let fragmentCreatedAt: String
        let lastReviewID: String?
        let lastReviewedAt: String?
        let lastReviewedBy: String?

        struct Attribution: Codable, Equatable {
            let actorKind: String
            let status: String

            enum CodingKeys: String, CodingKey {
                case actorKind = "actor_kind"
                case status
            }
        }

        struct Parser: Codable, Equatable {
            let name: String
            let version: String
        }

        enum CodingKeys: String, CodingKey {
            case id, availability, attribution, sequence, parser
            case dependencyType = "dependency_type"
            case personID = "person_id"
            case relationshipContextID = "relationship_context_id"
            case inclusionReason = "inclusion_reason"
            case authorizationScope = "authorization_scope"
            case unavailableReason = "unavailable_reason"
            case resourceID = "resource_id"
            case sourceName = "source_name"
            case observedAt = "observed_at"
            case sourceTimezone = "source_timezone"
            case captureVersion = "capture_version"
            case fragmentKind = "fragment_kind"
            case exactExcerpt = "exact_excerpt"
            case reviewStatus = "review_status"
            case contentHash = "content_hash"
            case fragmentCreatedAt = "fragment_created_at"
            case lastReviewID = "last_review_id"
            case lastReviewedAt = "last_reviewed_at"
            case lastReviewedBy = "last_reviewed_by"
        }
    }

    init(
        contractVersion: String,
        taskID: String,
        contextManifestID: String,
        knowledgeSnapshotID: String,
        disposition: String,
        blocks: [Block],
        media: [ChatMediaAsset] = [],
        createdAt: String,
        citations: [Citation] = []
    ) {
        self.contractVersion = contractVersion
        self.taskID = taskID
        self.contextManifestID = contextManifestID
        self.knowledgeSnapshotID = knowledgeSnapshotID
        self.disposition = disposition
        self.blocks = blocks
        self.media = media
        self.createdAt = createdAt
        self.citations = citations
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        contractVersion = try container.decode(String.self, forKey: .contractVersion)
        taskID = try container.decode(String.self, forKey: .taskID)
        contextManifestID = try container.decode(String.self, forKey: .contextManifestID)
        knowledgeSnapshotID = try container.decode(String.self, forKey: .knowledgeSnapshotID)
        disposition = try container.decode(String.self, forKey: .disposition)
        blocks = try container.decode([Block].self, forKey: .blocks)
        media = try container.decodeIfPresent([ChatMediaAsset].self, forKey: .media) ?? []
        createdAt = try container.decode(String.self, forKey: .createdAt)
        citations = []
    }

    func attaching(citations: [Citation]) -> RelationshipAskResponse {
        RelationshipAskResponse(
            contractVersion: contractVersion,
            taskID: taskID,
            contextManifestID: contextManifestID,
            knowledgeSnapshotID: knowledgeSnapshotID,
            disposition: disposition,
            blocks: blocks,
            media: media,
            createdAt: createdAt,
            citations: citations
        )
    }

    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case taskID = "task_id"
        case contextManifestID = "context_manifest_id"
        case knowledgeSnapshotID = "knowledge_snapshot_id"
        case disposition, blocks, media
        case createdAt = "created_at"
    }
}

struct PersonResearchTaskResponse: Decodable, Equatable, Identifiable {
    struct SourceImage: Decodable, Equatable {
        let mediaType: String
        let byteSize: Int
        let contentHash: String
        let persisted: Bool

        enum CodingKeys: String, CodingKey {
            case mediaType = "media_type"
            case byteSize = "byte_size"
            case contentHash = "content_hash"
            case persisted
        }
    }

    let contractVersion: String
    let taskID: String
    let disposition: String
    let blocks: [RelationshipAskResponse.Block]
    let sourceImage: SourceImage
    let externalEffects: [String]
    let createdAt: String

    var id: String { taskID }

    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case taskID = "task_id"
        case disposition, blocks
        case sourceImage = "source_image"
        case externalEffects = "external_effects"
        case createdAt = "created_at"
    }

    func validate(
        expectedMediaType: String,
        expectedByteSize: Int,
        expectedContentHash: String
    ) throws {
        guard contractVersion == TalentSignalAPIContract.version,
              UUID(uuidString: taskID) != nil,
              ["answer", "no_action", "unavailable"].contains(disposition),
              blocks.count == 1,
              sourceImage.mediaType == expectedMediaType,
              sourceImage.byteSize == expectedByteSize,
              sourceImage.contentHash == expectedContentHash,
              !sourceImage.persisted,
              externalEffects.isEmpty else {
            throw PursuitWorkspaceClientError.personResearchReceiptMismatch
        }
        guard let block = blocks.first,
              block.citationDependencyIDs.isEmpty,
              block.targetRef == nil,
              ["person_research", "failure_recovery"].contains(block.kind) else {
            throw PursuitWorkspaceClientError.personResearchReceiptMismatch
        }
        switch disposition {
        case "answer":
            guard block.kind == "person_research",
                  block.status == "needs_review",
                  !(block.publicSources ?? []).isEmpty else {
                throw PursuitWorkspaceClientError.personResearchReceiptMismatch
            }
        case "no_action":
            guard block.kind == "person_research",
                  block.requiresUserDecision == false,
                  (block.publicSources ?? []).isEmpty else {
                throw PursuitWorkspaceClientError.personResearchReceiptMismatch
            }
        case "unavailable":
            guard block.kind == "failure_recovery",
                  block.requiresUserDecision == false,
                  (block.publicSources ?? []).isEmpty else {
                throw PursuitWorkspaceClientError.personResearchReceiptMismatch
            }
        default:
            throw PursuitWorkspaceClientError.personResearchReceiptMismatch
        }
        for source in block.publicSources ?? [] {
            guard source.providerID == "tikhub",
                  source.resultID.range(
                    of: "^[a-f0-9]{64}$",
                    options: .regularExpression
                  ) != nil,
                  source.contentHash.range(
                    of: "^[a-f0-9]{64}$",
                    options: .regularExpression
                  ) != nil,
                  let profileURL = URL(string: source.profileURL),
                  profileURL.scheme == "https",
                  profileURL.host != nil else {
                throw PursuitWorkspaceClientError.personResearchReceiptMismatch
            }
        }
    }

    var relationshipAskProjection: RelationshipAskResponse {
        RelationshipAskResponse(
            contractVersion: contractVersion,
            taskID: taskID,
            contextManifestID: "none-unbound-person-research",
            knowledgeSnapshotID: "none-unbound-person-research",
            disposition: disposition,
            blocks: blocks,
            media: [],
            createdAt: createdAt,
            citations: []
        )
    }
}

struct UnscopedChatTaskResponse: Decodable, Equatable, Identifiable {
    let contractVersion: String
    let taskID: String
    let disposition: String
    let blocks: [RelationshipAskResponse.Block]
    let externalEffects: [String]
    let createdAt: String

    var id: String { taskID }

    var relationshipAskProjection: RelationshipAskResponse {
        RelationshipAskResponse(
            contractVersion: contractVersion,
            taskID: taskID,
            contextManifestID: "none-unbound-conversation",
            knowledgeSnapshotID: "none-unbound-conversation",
            disposition: disposition,
            blocks: blocks,
            createdAt: createdAt
        )
    }

    enum CodingKeys: String, CodingKey {
        case disposition, blocks
        case contractVersion = "contract_version"
        case taskID = "task_id"
        case externalEffects = "external_effects"
        case createdAt = "created_at"
    }
}

struct RelationshipAskReadback: Decodable, Equatable {
    let contractVersion: String
    let accountID: String
    let taskID: String
    let contextManifestID: String
    let knowledgeSnapshotID: String
    let personID: String
    let relationshipContextID: String
    let manifestStatus: String
    let snapshotStatus: String
    let authorizationScope: String
    let citations: [RelationshipAskResponse.Citation]
    var media: [ChatMediaAsset]? = nil
    let createdAt: String

    func validated(
        _ response: RelationshipAskResponse,
        expectedAccountID: String,
        expectedPersonID: String,
        expectedRelationshipContextID: String
    ) throws -> RelationshipAskResponse {
        guard contractVersion == TalentSignalAPIContract.version,
              accountID == expectedAccountID,
              taskID == response.taskID,
              contextManifestID == response.contextManifestID,
              knowledgeSnapshotID == response.knowledgeSnapshotID,
              personID == expectedPersonID,
              relationshipContextID == expectedRelationshipContextID,
              manifestStatus == "active",
              snapshotStatus == "published",
              authorizationScope == "person:\(personID):relationship-context:\(relationshipContextID)" else {
            throw PursuitWorkspaceClientError.askReadbackEnvelopeMismatch
        }

        let citedIDs = Set(
            response.blocks.flatMap(\.citationDependencyIDs)
        )
        guard Set(citations.map(\.id)).count == citations.count else {
            throw PursuitWorkspaceClientError.askCitationBindingMismatch
        }
        let responseMediaIDs = response.media.map(\.id)
        let readbackMedia = media ?? []
        guard responseMediaIDs == readbackMedia.map(\.id),
              readbackMedia.allSatisfy({ $0.status == "ready" }) else {
            throw PursuitWorkspaceClientError.askReadbackEnvelopeMismatch
        }
        let detailsByID = Dictionary(
            uniqueKeysWithValues: citations.map { ($0.id, $0) }
        )
        guard citedIDs.allSatisfy({ detailsByID[$0]?.availability == "available" }) else {
            throw PursuitWorkspaceClientError.citedEvidenceUnavailable
        }
        let expectedCitationScope =
            "person:\(expectedPersonID):relationship-context:\(expectedRelationshipContextID)"
        guard citedIDs.allSatisfy({ id in
            guard let citation = detailsByID[id] else { return false }
            return citation.dependencyType == "evidence_fragment"
                && citation.personID == expectedPersonID
                && citation.relationshipContextID == expectedRelationshipContextID
                && citation.authorizationScope == expectedCitationScope
        }) else {
            throw PursuitWorkspaceClientError.askCitationBindingMismatch
        }
        let citationNeedingReview = citations.first { citation in
            citedIDs.contains(citation.id)
                && (
                    citation.reviewStatus != "reviewed"
                        || citation.lastReviewID == nil
                )
                && citation.attribution.status == "confirmed"
                && citation.exactExcerpt?.trimmingCharacters(
                    in: .whitespacesAndNewlines
                ).isEmpty == false
        }
        if let citationNeedingReview {
            throw PursuitWorkspaceClientError.askCitationReviewRequired(
                AskCitationReviewRequirement(
                    taskID: response.taskID,
                    citation: citationNeedingReview
                )
            )
        }
        guard citedIDs.allSatisfy({ id in
            guard let citation = detailsByID[id] else { return false }
            return citation.reviewStatus == "reviewed"
                && citation.lastReviewID != nil
                && citation.attribution.status == "confirmed"
                && citation.exactExcerpt?.trimmingCharacters(
                    in: .whitespacesAndNewlines
                ).isEmpty == false
        }) else {
            throw PursuitWorkspaceClientError.askCitationReviewAuthorityMissing
        }
        return response.attaching(
            citations: citedIDs.compactMap { detailsByID[$0] }
        )
    }

    enum CodingKeys: String, CodingKey {
        case citations, media
        case contractVersion = "contract_version"
        case accountID = "account_id"
        case taskID = "task_id"
        case contextManifestID = "context_manifest_id"
        case knowledgeSnapshotID = "knowledge_snapshot_id"
        case personID = "person_id"
        case relationshipContextID = "relationship_context_id"
        case manifestStatus = "manifest_status"
        case snapshotStatus = "snapshot_status"
        case authorizationScope = "authorization_scope"
        case createdAt = "created_at"
    }
}

private struct RelationshipAskBody: Encodable {
    let idempotencyKey: String
    let objective: String
    let personID: String
    let relationshipContextID: String
    let mediaIDs: [String]

    enum CodingKeys: String, CodingKey {
        case idempotencyKey = "idempotency_key"
        case objective
        case personID = "person_id"
        case relationshipContextID = "relationship_context_id"
        case mediaIDs = "media_ids"
    }
}

private struct UnscopedChatTaskBody: Encodable {
    let idempotencyKey: String
    let objective: String

    enum CodingKeys: String, CodingKey {
        case objective
        case idempotencyKey = "idempotency_key"
    }
}

private struct PersonResearchTaskBody: Encodable {
    struct Image: Encodable {
        let mediaType: String
        let byteSize: Int
        let contentHash: String
        let dataBase64: String

        enum CodingKeys: String, CodingKey {
            case mediaType = "media_type"
            case byteSize = "byte_size"
            case contentHash = "content_hash"
            case dataBase64 = "data_base64"
        }
    }

    let idempotencyKey: String
    let objective: String
    let image: Image

    enum CodingKeys: String, CodingKey {
        case idempotencyKey = "idempotency_key"
        case objective, image
    }
}

private struct CreateChatMediaBody: Encodable {
    let idempotencyKey: String
    let personID: String
    let relationshipContextID: String
    let fileName: String
    let mediaType: String
    let byteSize: Int
    let width: Int?
    let height: Int?

    enum CodingKeys: String, CodingKey {
        case idempotencyKey = "idempotency_key"
        case personID = "person_id"
        case relationshipContextID = "relationship_context_id"
        case fileName = "file_name"
        case mediaType = "media_type"
        case byteSize = "byte_size"
        case width, height
    }
}

private struct ChatMediaDeleteResponse: Decodable {
    let id: String
    let status: String
}

private struct WorkspaceEvidenceReviewBody: Encodable {
    let idempotencyKey: String
    let expectedReviewStatus: String
    let expectedLastReviewID: String?
    let decision: String
    let reason: String

    enum CodingKeys: String, CodingKey {
        case idempotencyKey = "idempotency_key"
        case expectedReviewStatus = "expected_review_status"
        case expectedLastReviewID = "expected_last_review_id"
        case decision, reason
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(idempotencyKey, forKey: .idempotencyKey)
        try container.encode(expectedReviewStatus, forKey: .expectedReviewStatus)
        if let expectedLastReviewID {
            try container.encode(expectedLastReviewID, forKey: .expectedLastReviewID)
        } else {
            try container.encodeNil(forKey: .expectedLastReviewID)
        }
        try container.encode(decision, forKey: .decision)
        try container.encode(reason, forKey: .reason)
    }
}

private struct WorkspaceEvidenceReviewResponse: Decodable {
    let fragmentID: String
    let reviewID: String
    let priorReviewID: String?
    let reviewStatus: String
    let decidedAt: String

    enum CodingKeys: String, CodingKey {
        case fragmentID = "fragment_id"
        case reviewID = "review_id"
        case priorReviewID = "prior_review_id"
        case reviewStatus = "review_status"
        case decidedAt = "decided_at"
    }
}

private struct WorkspaceWikiCompilationBody: Encodable {
    let idempotencyKey: String
    let objective: String

    enum CodingKeys: String, CodingKey {
        case idempotencyKey = "idempotency_key"
        case objective
    }
}

private struct WorkspaceWikiCompilationResponse: Decodable {
    let accountID: String
    let personID: String
    let relationshipContextID: String?

    enum CodingKeys: String, CodingKey {
        case accountID = "account_id"
        case personID = "person_id"
        case relationshipContextID = "relationship_context_id"
    }
}

private struct WorkspaceLoginBody: Encodable {
    let accountSlug: String
    let userEmail: String
    let clientLabel: String

    enum CodingKeys: String, CodingKey {
        case accountSlug = "account_slug"
        case userEmail = "user_email"
        case clientLabel = "client_label"
    }
}

private struct WorkspaceLoginResponse: Decodable {
    let contractVersion: String
    let accessToken: String
    let account: Account
    let user: User

    struct Account: Decodable { let id: String }
    struct User: Decodable {
        let id: String
        let displayName: String
        enum CodingKeys: String, CodingKey {
            case id
            case displayName = "display_name"
        }
    }

    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case accessToken = "access_token"
        case account, user
    }
}

private struct WorkspacePursuitListEnvelope: Decodable {
    let contractVersion: String
    let workspaceID: String
    let pursuits: [WorkspacePursuit]

    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case workspaceID = "workspace_id"
        case pursuits
    }
}

private struct WorkspacePeopleEnvelope: Decodable {
    let contractVersion: String
    let people: [WorkspacePerson]

    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case people
    }
}

private struct WorkspacePeopleSearchBody: Encodable {
    let query: String
}

private struct WorkspaceProposalListEnvelope: Decodable {
    let contractVersion: String
    let workspaceID: String
    let proposals: [WorkspaceProposal]

    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case workspaceID = "workspace_id"
        case proposals
    }
}

private struct WorkspaceActionCompletionBody: Encodable {
    let operationID: String
    let idempotencyKey: String
    let expectedPursuitRevision: Int
    let expectedActionRevision: Int
    let outcomeSummary: String

    enum CodingKeys: String, CodingKey {
        case operationID = "operation_id"
        case idempotencyKey = "idempotency_key"
        case expectedPursuitRevision = "expected_pursuit_revision"
        case expectedActionRevision = "expected_action_revision"
        case outcomeSummary = "outcome_summary"
    }
}

private struct WorkspaceActionCompletionEnvelope: Decodable {
    let contractVersion: String
    let pursuit: WorkspacePursuit
    let receipt: PursuitReviewReceipt

    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case pursuit, receipt
    }
}

private struct WorkspaceErrorEnvelope: Decodable {
    let error: ErrorBody?
    struct ErrorBody: Decodable { let code: String?; let message: String? }
}
