import Foundation

enum AgentTaskStatus: String, Codable, Equatable {
    case active
    case waitingForClarification = "waiting_for_clarification"
    case waitingForDomainDecision = "waiting_for_domain_decision"
    case waitingForExternal = "waiting_for_external"
    case needsRebase = "needs_rebase"
    case completed
    case noAction = "no_action"
    case abstained
    case failed
    case cancelled
    case expired

    var isWaiting: Bool {
        switch self {
        case .waitingForClarification, .waitingForDomainDecision,
             .waitingForExternal, .needsRebase:
            return true
        default:
            return false
        }
    }

    var isTerminal: Bool {
        switch self {
        case .completed, .noAction, .abstained, .failed, .cancelled, .expired:
            return true
        default:
            return false
        }
    }
}

struct AgentTaskProjection: Codable, Equatable, Identifiable {
    let id: String
    let workspaceID: String
    let pursuitID: String
    let requestedByUserID: String
    let kind: String
    let objective: String
    let taskRevision: Int
    let status: AgentTaskStatus
    let permissionCeiling: [String]
    let semanticSnapshot: SemanticSnapshot
    let latestRun: LatestRun?
    let artifact: BriefingArtifact?
    let decisionBundle: DecisionBundle?
    let latestSequence: Int
    let latestCursor: String
    let continueAllowed: Bool
    let externalEffects: [String]
    let createdAt: String
    let updatedAt: String
    let completedAt: String?

    struct SemanticSnapshot: Codable, Equatable {
        let pursuitRevision: Int
        let evidenceManifestDigest: String
        let agentDefinitionDigest: String
        let toolSchemaDigest: String
        let policyDigest: String
        let modelDigest: String
        let createdAt: String

        enum CodingKeys: String, CodingKey {
            case pursuitRevision = "pursuit_revision"
            case evidenceManifestDigest = "evidence_manifest_digest"
            case agentDefinitionDigest = "agent_definition_digest"
            case toolSchemaDigest = "tool_schema_digest"
            case policyDigest = "policy_digest"
            case modelDigest = "model_digest"
            case createdAt = "created_at"
        }
    }

    struct LatestRun: Codable, Equatable {
        let id: String?
        let attempt: Int
        let status: String
        let agentRunStatus: String?
        let reasonCode: String?
        let proposalID: String?
        let noActionID: String?

        enum CodingKeys: String, CodingKey {
            case id, attempt, status
            case agentRunStatus = "agent_run_status"
            case reasonCode = "reason_code"
            case proposalID = "proposal_id"
            case noActionID = "no_action_id"
        }
    }

    struct BriefingArtifact: Codable, Equatable, Identifiable {
        let id: String
        let taskID: String
        let runID: String?
        let type: String
        let authority: String
        let status: String
        let title: String
        let summary: String
        let whatChanged: [Claim]
        let whatMattersNow: Dependency
        let nextMove: NextMove
        let limitations: [String]
        let evidenceManifestDigest: String
        let observedAt: String
        let expiresAt: String

        struct Claim: Codable, Equatable, Identifiable {
            let id: String
            let statement: String
            let epistemicStatus: String
            let authority: String
            let evidenceRefs: [String]
            let observedAt: String?
            let freshness: String

            enum CodingKeys: String, CodingKey {
                case id, statement, authority, freshness
                case epistemicStatus = "epistemic_status"
                case evidenceRefs = "evidence_refs"
                case observedAt = "observed_at"
            }
        }

        struct Dependency: Codable, Equatable {
            let dependency: String
            let reason: String
            let authority: String
            let evidenceRefs: [String]

            enum CodingKeys: String, CodingKey {
                case dependency, reason, authority
                case evidenceRefs = "evidence_refs"
            }
        }

        struct NextMove: Codable, Equatable {
            let kind: String
            let label: String
            let reason: String
        }

        enum CodingKeys: String, CodingKey {
            case id, type, authority, status, title, summary, limitations
            case taskID = "task_id"
            case runID = "run_id"
            case whatChanged = "what_changed"
            case whatMattersNow = "what_matters_now"
            case nextMove = "next_move"
            case evidenceManifestDigest = "evidence_manifest_digest"
            case observedAt = "observed_at"
            case expiresAt = "expires_at"
        }
    }

    struct DecisionBundle: Codable, Equatable, Identifiable {
        let id: String
        let taskID: String
        let taskRevision: Int
        let bundleRevision: Int
        let dependency: String
        let status: String
        let proposalID: String?
        let expiresAt: String

        enum CodingKeys: String, CodingKey {
            case id, dependency, status
            case taskID = "task_id"
            case taskRevision = "task_revision"
            case bundleRevision = "bundle_revision"
            case proposalID = "proposal_id"
            case expiresAt = "expires_at"
        }
    }

    enum CodingKeys: String, CodingKey {
        case id, kind, objective, status, artifact
        case workspaceID = "workspace_id"
        case pursuitID = "pursuit_id"
        case requestedByUserID = "requested_by_user_id"
        case taskRevision = "task_revision"
        case permissionCeiling = "permission_ceiling"
        case semanticSnapshot = "semantic_snapshot"
        case latestRun = "latest_run"
        case decisionBundle = "decision_bundle"
        case latestSequence = "latest_sequence"
        case latestCursor = "latest_cursor"
        case continueAllowed = "continue_allowed"
        case externalEffects = "external_effects"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case completedAt = "completed_at"
    }
}

struct AgentTaskEvent: Codable, Equatable, Identifiable {
    let id: String
    let workspaceID: String
    let taskID: String
    let runID: String?
    let taskSequence: Int
    let streamCursor: String
    let name: String
    let occurredAt: String
    let schemaVersion: Int

    enum CodingKeys: String, CodingKey {
        case id = "event_id"
        case name
        case workspaceID = "workspace_id"
        case taskID = "task_id"
        case runID = "run_id"
        case taskSequence = "task_sequence"
        case streamCursor = "stream_cursor"
        case occurredAt = "occurred_at"
        case schemaVersion = "schema_version"
    }
}
