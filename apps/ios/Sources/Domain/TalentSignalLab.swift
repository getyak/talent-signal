import Foundation

struct LabVersionEnvelope: Codable, Equatable {
    let webBuild: String
    let iosBuild: String
    let backendRevision: String
    let agentVersion: String
    let promptVersion: String
    let policyVersion: String
    let fixtureVersion: String

    enum CodingKeys: String, CodingKey {
        case webBuild = "web_build"
        case iosBuild = "ios_build"
        case backendRevision = "backend_revision"
        case agentVersion = "agent_version"
        case promptVersion = "prompt_version"
        case policyVersion = "policy_version"
        case fixtureVersion = "fixture_version"
    }
}

enum LabEvidenceStatus: String, Codable, Equatable {
    case observation
    case confirmed
    case conflict
    case unavailable
}

struct LabEvidenceItem: Codable, Equatable, Identifiable {
    let id: String
    let label: String
    let excerpt: String
    let observedAt: String
    let status: LabEvidenceStatus
    let sourceLabel: String

    enum CodingKeys: String, CodingKey {
        case id, label, excerpt, status
        case observedAt = "observed_at"
        case sourceLabel = "source_label"
    }
}

struct LabEvidenceSummary: Codable, Equatable {
    let confirmed: Int
    let observations: Int
    let conflicts: Int
    let unavailable: Int
}

enum LabInsightKind: String, Codable, Equatable {
    case relationshipChange = "relationship_change"
    case identityReview = "identity_review"
    case evidenceConflict = "evidence_conflict"
    case sourceAuthority = "source_authority"
    case actionReview = "action_review"
}

enum LabLifecycle: String, Codable, Equatable {
    case hypothesis
    case abstained
    case blocked
    case unavailable
    case needsReview = "needs_review"
}

struct LabScenarioOutput: Codable, Equatable {
    let insightID: String
    let insightKind: LabInsightKind
    let headline: String
    let observation: String
    let interpretation: String
    let uncertainty: String?
    let lifecycle: LabLifecycle
    let evidenceSummary: LabEvidenceSummary
    let evidence: [LabEvidenceItem]
    let requiredQuestion: String?
    let requiresHumanConfirmation: Bool
    let confirmationCount: Int
    let canonicalMutationCount: Int
    let externalEffectCount: Int

    enum CodingKeys: String, CodingKey {
        case headline, observation, interpretation, uncertainty, lifecycle, evidence
        case insightID = "insight_id"
        case insightKind = "insight_kind"
        case evidenceSummary = "evidence_summary"
        case requiredQuestion = "required_question"
        case requiresHumanConfirmation = "requires_human_confirmation"
        case confirmationCount = "confirmation_count"
        case canonicalMutationCount = "canonical_mutation_count"
        case externalEffectCount = "external_effect_count"
    }
}

enum LabScenarioCategory: String, Codable, Equatable {
    case momentum
    case identity
    case evidence
    case authorization
    case action
}

enum LabRiskTier: String, Codable, Equatable {
    case blocker = "p0_blocker"
    case core = "p1_core"
}

struct LabScenarioSummary: Codable, Equatable, Identifiable {
    let id: String
    let revision: String
    let title: String
    let summary: String
    let category: LabScenarioCategory
    let riskTier: LabRiskTier
    let expectedBehavior: String
    let snapshotHash: String
    let demoIdentity: String
    let baseline: LabVersionEnvelope
    let candidate: LabVersionEnvelope

    enum CodingKeys: String, CodingKey {
        case id, revision, title, summary, category, baseline, candidate
        case riskTier = "risk_tier"
        case expectedBehavior = "expected_behavior"
        case snapshotHash = "snapshot_hash"
        case demoIdentity = "demo_identity"
    }
}

enum LabSessionStatus: String, Codable, Equatable {
    case active
    case expired
    case closed
}

struct LabSession: Codable, Equatable, Identifiable {
    let id: String
    let scenario: LabScenarioSummary
    let environment: String
    let workspaceReference: String
    let testerIdentity: String
    let status: LabSessionStatus
    let canonicalIsolation: Bool
    let productionDataAccess: Bool
    let writeBoundary: String
    let activeEnvelope: LabVersionEnvelope
    let startedAt: String
    let expiresAt: String

    enum CodingKeys: String, CodingKey {
        case id, scenario, environment, status
        case workspaceReference = "workspace_ref"
        case testerIdentity = "tester_identity"
        case canonicalIsolation = "canonical_isolation"
        case productionDataAccess = "production_data_access"
        case writeBoundary = "write_boundary"
        case activeEnvelope = "active_envelope"
        case startedAt = "started_at"
        case expiresAt = "expires_at"
    }
}

enum LabRunVariant: String, Codable, Equatable {
    case baseline
    case candidate
}

struct LabRun: Codable, Equatable, Identifiable {
    let id: String
    let sessionID: String
    let scenarioID: String
    let scenarioRevision: String
    let variant: LabRunVariant
    let snapshotHash: String
    let outputHash: String
    let envelope: LabVersionEnvelope
    let output: LabScenarioOutput
    let traceID: String
    let deterministic: Bool
    let canonicalRevisionBefore: Int
    let canonicalRevisionAfter: Int
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, variant, envelope, output, deterministic
        case sessionID = "session_id"
        case scenarioID = "scenario_id"
        case scenarioRevision = "scenario_revision"
        case snapshotHash = "snapshot_hash"
        case outputHash = "output_hash"
        case traceID = "trace_id"
        case canonicalRevisionBefore = "canonical_revision_before"
        case canonicalRevisionAfter = "canonical_revision_after"
        case createdAt = "created_at"
    }
}

enum LabDifferenceKind: String, Codable, Equatable {
    case insight
    case explanation
    case caution
    case question
    case confirmationEffort = "confirmation_effort"
}

enum LabDifferenceImpact: String, Codable, Equatable {
    case improved
    case regressed
    case changed
    case unchanged
}

struct LabComparisonDifference: Codable, Equatable, Identifiable {
    let kind: LabDifferenceKind
    let label: String
    let baseline: String
    let candidate: String
    let impact: LabDifferenceImpact

    var id: String { kind.rawValue }
}

struct LabComparison: Codable, Equatable, Identifiable {
    let id: String
    let sessionID: String
    let baselineRun: LabRun
    let candidateRun: LabRun
    let identicalSnapshot: Bool
    let differences: [LabComparisonDifference]
    let improvedCount: Int
    let regressedCount: Int
    let changedCount: Int
    let canonicalMutationCount: Int
    let externalEffectCount: Int
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, differences
        case sessionID = "session_id"
        case baselineRun = "baseline_run"
        case candidateRun = "candidate_run"
        case identicalSnapshot = "identical_snapshot"
        case improvedCount = "improved_count"
        case regressedCount = "regressed_count"
        case changedCount = "changed_count"
        case canonicalMutationCount = "canonical_mutation_count"
        case externalEffectCount = "external_effect_count"
        case createdAt = "created_at"
    }
}

enum RealityReceiptStatus: String, Codable, Equatable {
    case recorded
    case promoted
}

struct RealityReceipt: Codable, Equatable, Identifiable {
    let id: String
    let displayReference: String
    let sessionID: String
    let runID: String
    let scenarioID: String
    let scenarioRevision: String
    let expected: String
    let actual: String
    let issueSummary: String
    let snapshotHash: String
    let outputHash: String
    let envelope: LabVersionEnvelope
    let traceID: String
    let canonicalRevision: Int
    let reproduced: Bool
    let screenshotState: String
    let redactionApplied: Bool
    let status: RealityReceiptStatus
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, expected, actual, envelope, reproduced, status
        case displayReference = "display_ref"
        case sessionID = "session_id"
        case runID = "run_id"
        case scenarioID = "scenario_id"
        case scenarioRevision = "scenario_revision"
        case issueSummary = "issue_summary"
        case snapshotHash = "snapshot_hash"
        case outputHash = "output_hash"
        case traceID = "trace_id"
        case canonicalRevision = "canonical_revision"
        case screenshotState = "screenshot_state"
        case redactionApplied = "redaction_applied"
        case createdAt = "created_at"
    }
}

struct LabEvalCase: Codable, Equatable, Identifiable {
    let id: String
    let caseReference: String
    let version: Int
    let sourceReceiptID: String
    let scenarioID: String
    let scenarioRevision: String
    let snapshotHash: String
    let expectedBehavior: String
    let observedRegression: String
    let partition: String
    let lifecycle: String
    let adjudication: String
    let releaseGate: String
    let reviewerNote: String
    let promotedByUserID: String
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, version, partition, lifecycle, adjudication
        case caseReference = "case_ref"
        case sourceReceiptID = "source_receipt_id"
        case scenarioID = "scenario_id"
        case scenarioRevision = "scenario_revision"
        case snapshotHash = "snapshot_hash"
        case expectedBehavior = "expected_behavior"
        case observedRegression = "observed_regression"
        case releaseGate = "release_gate"
        case reviewerNote = "reviewer_note"
        case promotedByUserID = "promoted_by_user_id"
        case createdAt = "created_at"
    }
}

struct LabCapability: Codable, Equatable {
    let enabled: Bool
    let reason: String?
    let internalBuildRequired: Bool
    let syntheticEvidenceOnly: Bool
    let productionDataAccess: Bool
    let canonicalWriteAccess: Bool
    let externalEffectAccess: Bool

    enum CodingKeys: String, CodingKey {
        case enabled, reason
        case internalBuildRequired = "internal_build_required"
        case syntheticEvidenceOnly = "synthetic_evidence_only"
        case productionDataAccess = "production_data_access"
        case canonicalWriteAccess = "canonical_write_access"
        case externalEffectAccess = "external_effect_access"
    }
}

struct LabManifest: Codable, Equatable {
    let contractVersion: String
    let capability: LabCapability
    let environment: String
    let scenarios: [LabScenarioSummary]
    let activeSession: LabSession?
    let latestRun: LabRun?
    let evalCases: [LabEvalCase]

    enum CodingKeys: String, CodingKey {
        case capability, environment, scenarios
        case contractVersion = "contract_version"
        case activeSession = "active_session"
        case latestRun = "latest_run"
        case evalCases = "eval_cases"
    }
}
