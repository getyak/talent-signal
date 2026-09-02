export type JsonPrimitive = boolean | number | string | null;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type Sha256Digest = `sha256:${string}`;

export const RISK_TIERS = ["p0_blocker", "p1_core", "p2_quality"] as const;
export type RiskTier = (typeof RISK_TIERS)[number];

export const DATA_CLASSES = [
  "synthetic_shareable",
  "synthetic_restricted",
  "deidentified_governed",
  "private_reference_only",
  "prohibited_export",
] as const;
export type EvaluationDataClass = (typeof DATA_CLASSES)[number];

export const LIFECYCLE_STATES = ["draft", "active", "retired"] as const;
export type ScenarioLifecycle = (typeof LIFECYCLE_STATES)[number];

export const ADJUDICATION_STATES = ["unreviewed", "human_gold", "disputed"] as const;
export type ScenarioAdjudication = (typeof ADJUDICATION_STATES)[number];

/**
 * Mutually exclusive evaluation partitions. `p0` is deliberately a real
 * partition rather than a suite label so a release-blocking case cannot also
 * be tuned as development data.
 */
export const DATASET_PARTITIONS = ["p0", "dev", "held_out", "red_team"] as const;
export type DatasetPartition = (typeof DATASET_PARTITIONS)[number];

export const EXECUTION_MODES = [
  "control_plane_replay",
  "model_replay",
  "integration_probe",
] as const;
export type EvaluationExecutionMode = (typeof EXECUTION_MODES)[number];

export const EVALUATED_COMPONENTS = [
  "capture",
  "perception",
  "identity",
  "memory",
  "agent_policy",
  "model",
  "search",
  "effect_adapter",
] as const;
export type EvaluatedComponent = (typeof EVALUATED_COMPONENTS)[number];

export const GATE_STATUSES = ["pass", "fail", "needs_review", "not_run"] as const;
export type EvaluationGateStatus = (typeof GATE_STATUSES)[number];

export interface ContentIdentityV1 {
  identityId: string;
  version: string;
  contentDigest: Sha256Digest;
}

/** A repository-relative, content-addressed fixture reference. */
export interface FixtureReferenceV1 {
  fixtureId: string;
  path: string;
  contentDigest: Sha256Digest;
}

export interface EvaluationDataPolicyV1 {
  dataClass: EvaluationDataClass;
  containsRealCandidateData: boolean;
  projection:
    | "synthetic_content_opt_in"
    | "metadata_only"
    | "prohibited";
}

export interface ScenarioLineageV1 {
  sourceKind: "native" | "legacy_adapter" | "governed_case_proposal";
  sourceIds: string[];
  previousRevision?: string;
  previousDigest?: Sha256Digest;
  authorizationRef?: string;
}

export interface EvaluatorBindingV1 {
  evaluatorId: string;
  version: string;
  contentDigest: Sha256Digest;
  kind: "deterministic" | "human" | "model" | "outcome";
  criterionIds: string[];
  requiredForGate: boolean;
}

/**
 * Human adjudication belongs to one atomic criterion. A Scenario-level
 * adjudication is only a derived summary and carries no authority of its own.
 */
export interface CriterionAdjudicationV1 {
  criterionId: string;
  status: ScenarioAdjudication;
  evidence: EvidenceLocatorV1[];
  reviewerId?: string;
  decisionId?: string;
  decidedAt?: string;
}

export interface ObservationExpectationV1 {
  criterionId: string;
  operator: "equals" | "contains" | "excludes" | "exists" | "count_equals" | "at_most" | "ordered_before";
  actualPath: string;
  expected: JsonValue;
}

export interface IdentityExpectationV1 {
  criterionId: string;
  decision:
    | "not_applicable"
    | "propose_new"
    | "require_human_binding"
    | "abstain"
    | "propose_merge"
    | "possible_matches";
  expectedPersonRef?: string;
  reviewRequired: boolean;
  evidenceRefs?: string[];
}

export interface StateTransitionExpectationV1 {
  criterionId: string;
  operation: string;
  target: string;
  authority: "none" | "proposed" | "confirmed" | "contested" | "unavailable" | "external_observed";
  evidenceRefs: string[];
}

export interface TerminalExpectationV1 {
  criterionId: string;
  status: "no_action" | "clarify" | "abstain" | "proposal" | "blocked" | "partial" | "completed";
  reasonCode: string;
}

export interface ProposalExpectationV1 {
  criterionId: string;
  kind: string;
  maxCount: number;
  requiresHumanReview: boolean;
  evidenceRefs?: string[];
}

export interface EffectExpectationV1 {
  effectType: string;
  maxCount: number;
  requiresExactApproval: boolean;
}

export interface ForbiddenOutcomeV1 {
  criterionId: string;
  code: string;
  description: string;
  blocker: boolean;
}

export interface ScenarioOracleV1 {
  schemaVersion: "evaluation-oracle.v1";
  oracleId: string;
  scenarioId: string;
  observations: ObservationExpectationV1[];
  identity: IdentityExpectationV1;
  transitions: StateTransitionExpectationV1[];
  terminal: TerminalExpectationV1;
  proposal?: ProposalExpectationV1;
  requiredQuestions: string[];
  allowedEffects: EffectExpectationV1[];
  forbidden: ForbiddenOutcomeV1[];
}

export interface ScenarioModelInputFixtureV1 {
  schemaVersion: "evaluation-model-input.v1";
  fixtureId: string;
  dataClass: "synthetic_shareable" | "synthetic_restricted";
  scenarioId: string;
  input: JsonValue;
}

export interface ScenarioInitialStateFixtureV1 {
  schemaVersion: "evaluation-initial-state.v1";
  fixtureId: string;
  scenarioId: string;
  state: JsonValue;
}

export type ScenarioModelInputV1 = JsonValue;
export type ScenarioInitialStateV1 = JsonValue;

/**
 * Repository Scenario metadata. Model input, initial state, and oracle are
 * physically separated so the model-visible path never needs an oracle reader.
 */
export interface EvaluationScenarioDocumentV1 {
  schemaVersion: "evaluation-scenario.v1";
  scenarioId: string;
  revision: string;
  contentDigest: Sha256Digest;
  title: string;
  purpose: string;
  suiteIds: string[];
  riskTier: RiskTier;
  lifecycle: ScenarioLifecycle;
  /** Derived summary of criterionAdjudications. */
  adjudication: ScenarioAdjudication;
  partition: DatasetPartition;
  /** Profiles with which this Scenario's construct is valid. */
  compatibleProfileIds: string[];
  /** Empty means no criterion has been human-adjudicated yet. */
  criterionAdjudications: CriterionAdjudicationV1[];
  dataPolicy: EvaluationDataPolicyV1;
  modelInputRef: FixtureReferenceV1;
  initialStateRef: FixtureReferenceV1;
  oracleRef: FixtureReferenceV1;
  evaluatorBindings: EvaluatorBindingV1[];
  slices: Record<string, string>;
  lineage: ScenarioLineageV1;
}

/** Fully materialized Scenario used only inside the local evaluation boundary. */
export interface EvaluationScenarioV1 extends EvaluationScenarioDocumentV1 {
  input: ScenarioModelInputV1;
  initialState: ScenarioInitialStateV1;
  oracle: ScenarioOracleV1;
}

export interface FrozenDependencyBindingV1 {
  bindingId: string;
  component: EvaluatedComponent;
  fixture: FixtureReferenceV1;
  reason: string;
}

export interface LiveDependencyBindingV1 {
  bindingId: string;
  component: EvaluatedComponent;
  implementation: ContentIdentityV1;
  reason: string;
}

export interface ClockBindingV1 {
  bindingId: string;
  mode: "system" | "frozen" | "controlled";
  version: string;
  contentDigest: Sha256Digest;
}

export interface IdGeneratorBindingV1 {
  bindingId: string;
  mode: "system" | "deterministic";
  version: string;
  contentDigest: Sha256Digest;
}

export interface TimerBindingV1 {
  bindingId: string;
  mode: "system" | "controlled";
  version: string;
  contentDigest: Sha256Digest;
}

export interface AgentBudgetV1 {
  maximumSteps: number;
  maximumToolCalls: number;
  maximumDurationMs: number;
  maximumRetries: number;
}

export interface ReporterBindingV1 {
  reporterId: string;
  version: string;
  destination: "local" | "opik" | "other";
  contentDigest: Sha256Digest;
  required: boolean;
}

export interface EvaluationExecutionProfileV1 {
  schemaVersion: "evaluation-profile.v1";
  profileId: string;
  version: string;
  contentDigest: Sha256Digest;
  mode: EvaluationExecutionMode;
  systemUnderTest: EvaluatedComponent[];
  frozenDependencies: FrozenDependencyBindingV1[];
  liveDependencies: LiveDependencyBindingV1[];
  clock: ClockBindingV1;
  idGenerator: IdGeneratorBindingV1;
  timer: TimerBindingV1;
  budgets: AgentBudgetV1;
  reporters: ReporterBindingV1[];
}

export interface AgentDefinitionReferenceV1 {
  definitionId: string;
  version: string;
  contentDigest: Sha256Digest;
}

export interface AttemptFingerprintsV1 {
  provider: ContentIdentityV1;
  model: ContentIdentityV1;
  prompt: ContentIdentityV1;
  policy: ContentIdentityV1;
  toolManifest: ContentIdentityV1;
  sdk: ContentIdentityV1;
  rubric: ContentIdentityV1;
  exportPolicy: ContentIdentityV1;
  context: ContentIdentityV1;
}

export interface EvaluationAttemptV1 {
  schemaVersion: "evaluation-attempt.v1";
  attemptId: string;
  contentDigest: Sha256Digest;
  scenario: ContentIdentityV1;
  profile: ContentIdentityV1;
  agentDefinition: AgentDefinitionReferenceV1;
  trialNumber: number;
  gitSha: string;
  systemUnderTest: EvaluatedComponent[];
  frozenDependencies: FrozenDependencyBindingV1[];
  fingerprints: AttemptFingerprintsV1;
  startedAt: string;
}

export interface ScenarioRegistrationV1 {
  scenarioId: string;
  revision: string;
  contentDigest: Sha256Digest;
  lifecycle: ScenarioLifecycle;
  adjudication: ScenarioAdjudication;
  criterionAdjudicationDigest: Sha256Digest;
  partition: DatasetPartition;
  dataClass: EvaluationDataClass;
}

export interface EvaluationSuiteV1 {
  schemaVersion: "evaluation-suite.v1";
  suiteId: string;
  version: string;
  contentDigest: Sha256Digest;
  title: string;
  purpose: string;
  scenarios: ScenarioRegistrationV1[];
  lineage: ScenarioLineageV1;
}

export interface EvidenceLocatorV1 {
  artifactId: string;
  jsonPointer?: string;
  sourceRef?: string;
}

export interface EvaluationScoreV1 {
  schemaVersion: "evaluation-score.v1";
  scoreId: string;
  scenarioId: string;
  attemptId: string;
  capability: string;
  criterionId: string;
  evaluatorId: string;
  evaluatorVersion: string;
  evaluatorKind: "deterministic" | "human" | "model" | "outcome";
  riskTier: RiskTier;
  status: EvaluationGateStatus;
  gateAuthority: boolean;
  veto: boolean;
  evidence: EvidenceLocatorV1[];
  reasonCode?: string;
  value?: JsonValue;
}

export interface CapabilityGateV1 {
  capability: string;
  status: EvaluationGateStatus;
  scoreIds: string[];
  vetoScoreIds: string[];
  missingEvaluatorIds: string[];
  reasonCodes: string[];
}

export interface EvaluationGateResultV1 {
  schemaVersion: "evaluation-gate.v1";
  gateId: string;
  scenarioId: string;
  attemptId: string;
  status: EvaluationGateStatus;
  capabilities: CapabilityGateV1[];
  scores: EvaluationScoreV1[];
  createdAt: string;
  contentDigest: Sha256Digest;
}

export interface EvaluationResultV1 {
  schemaVersion: "evaluation-result.v1";
  resultId: string;
  attemptId: string;
  terminalStatus: "completed" | "cancelled" | "timed_out" | "crashed" | "not_run";
  terminalReasonCode: string;
  gate: EvaluationGateResultV1;
  traceDigest: Sha256Digest;
  startedAt: string;
  completedAt: string;
  contentDigest: Sha256Digest;
}

export interface EvaluationRunManifestV1 {
  schemaVersion: "evaluation-run-manifest.v1";
  runId: string;
  suite: ContentIdentityV1;
  attempt: EvaluationAttemptV1;
  profile: EvaluationExecutionProfileV1;
  createdAt: string;
  contentDigest: Sha256Digest;
}

export const SAFE_TRACE_EVENT_KINDS = [
  "frozen_provider_event",
  "terminal",
  "control_plane_replay",
  "model_replay",
  "integration_probe",
] as const;
export type SafeEvaluationTraceEventKind = (typeof SAFE_TRACE_EVENT_KINDS)[number];

export const SAFE_TRACE_STATUSES = ["observed", "completed", "not_run", "failed"] as const;
export type SafeEvaluationTraceStatus = (typeof SAFE_TRACE_STATUSES)[number];

export interface SafeEvaluationTraceV1 {
  schemaVersion: "safe-evaluation-trace.v1";
  traceId: string;
  attemptId: string;
  ordinal: number;
  eventKind: SafeEvaluationTraceEventKind;
  status: SafeEvaluationTraceStatus;
  inputDigest?: Sha256Digest;
  outputDigest?: Sha256Digest;
  reasonCode?: string;
  durationMs?: number;
}

export interface ReporterRunRefV1 {
  reporterId: string;
  runId: string;
  artifactRef: string;
  manifestDigest: Sha256Digest;
}

export interface ProjectionReferenceV1 {
  reporterId: string;
  runId: string;
  projectionId: string;
}

export interface ProjectionReceiptV1 {
  schemaVersion: "evaluation-projection-receipt.v1";
  receiptId: string;
  projectionId: string;
  runId: string;
  destination: string;
  status: "pending" | "succeeded" | "failed" | "deleted" | "not_run";
  idempotencyKey: string;
  attemptNumber: number;
  localArtifactDigest: Sha256Digest;
  externalId?: string;
  reasonCode?: string;
  createdAt: string;
  contentDigest: Sha256Digest;
}

export interface DeletionReceiptV1 {
  schemaVersion: "evaluation-deletion-receipt.v1";
  receiptId: string;
  projectionId: string;
  status: "deleted" | "not_found" | "failed";
  deletionScope: "trace_projection" | "full_remote_projection" | "local_projection_tombstone";
  retainedSurfaces: string[];
  readBackVerified: boolean;
  reasonCode: string;
  createdAt: string;
  contentDigest: Sha256Digest;
}

export interface EvaluationReporter {
  beginRun(manifest: EvaluationRunManifestV1): Promise<ReporterRunRefV1>;
  recordTrace(trace: SafeEvaluationTraceV1): Promise<void>;
  recordScores(scores: EvaluationScoreV1[]): Promise<void>;
  completeRun(result: EvaluationGateResultV1): Promise<ProjectionReceiptV1>;
  deleteProjection(ref: ProjectionReferenceV1): Promise<DeletionReceiptV1>;
}
