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
            accountID: nil,
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

protocol PursuitWorkspaceServing {
    func loadWorkspace() async throws -> PursuitWorkspaceSnapshot
    func ask(
        objective: String,
        personID: String,
        relationshipContextID: String,
        idempotencyKey: String
    ) async throws -> RelationshipAskResponse
    func revalidateAsk(
        response: RelationshipAskResponse,
        personID: String,
        relationshipContextID: String
    ) async throws
    func readOperation(id: UUID) async throws -> PursuitActionOperationReadback
    func rejectEvidence(
        fragmentID: String,
        expectedReviewStatus: String,
        reason: String,
        idempotencyKey: String
    ) async throws
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
    func ask(
        objective: String,
        personID: String,
        relationshipContextID: String,
        idempotencyKey: String
    ) async throws -> RelationshipAskResponse {
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
        reason: String,
        idempotencyKey: String
    ) async throws {
        throw PursuitWorkspaceClientError.askUnavailable
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

    func ask(
        objective: String,
        personID: String,
        relationshipContextID: String,
        idempotencyKey: String
    ) async throws -> RelationshipAskResponse {
        guard authenticatedSession != nil || URLFixtureLoader.isLoopback(baseURL) else {
            throw PursuitWorkspaceClientError.loopbackOnly
        }
        let login = try await loginIfNeeded()
        let body = RelationshipAskBody(
            idempotencyKey: idempotencyKey,
            objective: objective,
            personID: personID,
            relationshipContextID: relationshipContextID
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
        reason: String,
        idempotencyKey: String
    ) async throws {
        guard authenticatedSession != nil || URLFixtureLoader.isLoopback(baseURL) else {
            throw PursuitWorkspaceClientError.loopbackOnly
        }
        let login = try await loginIfNeeded()
        let response: WorkspaceEvidenceReviewResponse = try await post(
            path: "v1/evidence-fragments/\(fragmentID)/reviews",
            token: login.accessToken,
            body: WorkspaceEvidenceReviewBody(
                idempotencyKey: idempotencyKey,
                expectedReviewStatus: expectedReviewStatus,
                decision: "rejected",
                reason: reason
            )
        )
        guard response.fragmentID == fragmentID,
              response.reviewStatus == "rejected" else {
            throw PursuitWorkspaceClientError.scopeReadbackMismatch
        }
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
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw PursuitWorkspaceClientError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let envelope = try? JSONDecoder().decode(WorkspaceErrorEnvelope.self, from: data)
            throw PursuitWorkspaceClientError.backend(
                code: envelope?.error?.code ?? "HTTP_\(http.statusCode)",
                message: envelope?.error?.message ?? "The action outcome was rejected."
            )
        }
        do {
            return try JSONDecoder().decode(Response.self, from: data)
        } catch {
            throw PursuitWorkspaceClientError.invalidResponse
        }
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

enum PursuitWorkspaceClientError: LocalizedError, Equatable {
    case loopbackOnly
    case loginFailed
    case invalidResponse
    case scopeReadbackMismatch
    case askCompilationScopeMismatch
    case askResponseContractMismatch
    case askReadbackEnvelopeMismatch
    case askCitationBindingMismatch
    case citedEvidenceUnavailable
    case actionCompletionUnavailable
    case askUnavailable
    case backend(code: String, message: String)

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
        case .citedEvidenceUnavailable:
            return "Ask stopped because one cited source is unavailable or outside its current authorization."
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

        enum CodingKeys: String, CodingKey {
            case id, kind, title, body, status
            case citationDependencyIDs = "citation_dependency_ids"
            case requiresUserDecision = "requires_user_decision"
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
        createdAt: String,
        citations: [Citation] = []
    ) {
        self.contractVersion = contractVersion
        self.taskID = taskID
        self.contextManifestID = contextManifestID
        self.knowledgeSnapshotID = knowledgeSnapshotID
        self.disposition = disposition
        self.blocks = blocks
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
            createdAt: createdAt,
            citations: citations
        )
    }

    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case taskID = "task_id"
        case contextManifestID = "context_manifest_id"
        case knowledgeSnapshotID = "knowledge_snapshot_id"
        case disposition, blocks
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
                && citation.reviewStatus == "reviewed"
                && citation.attribution.status == "confirmed"
                && citation.exactExcerpt?.trimmingCharacters(
                    in: .whitespacesAndNewlines
                ).isEmpty == false
        }) else {
            throw PursuitWorkspaceClientError.askCitationBindingMismatch
        }
        return response.attaching(
            citations: citedIDs.compactMap { detailsByID[$0] }
        )
    }

    enum CodingKeys: String, CodingKey {
        case citations
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

    enum CodingKeys: String, CodingKey {
        case idempotencyKey = "idempotency_key"
        case objective
        case personID = "person_id"
        case relationshipContextID = "relationship_context_id"
    }
}

private struct WorkspaceEvidenceReviewBody: Encodable {
    let idempotencyKey: String
    let expectedReviewStatus: String
    let decision: String
    let reason: String

    enum CodingKeys: String, CodingKey {
        case idempotencyKey = "idempotency_key"
        case expectedReviewStatus = "expected_review_status"
        case decision, reason
    }
}

private struct WorkspaceEvidenceReviewResponse: Decodable {
    let fragmentID: String
    let reviewStatus: String

    enum CodingKeys: String, CodingKey {
        case fragmentID = "fragment_id"
        case reviewStatus = "review_status"
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
