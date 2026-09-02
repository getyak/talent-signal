import type {
  EvaluationAttemptV1,
  EvaluationExecutionMode,
  EvaluationExecutionProfileV1,
  EvaluationGateResultV1,
  EvaluationResultV1,
  EvaluationScenarioV1,
  EvaluationScoreV1,
  JsonValue,
  ProjectionReceiptV1,
  SafeEvaluationTraceV1,
  Sha256Digest,
} from "@talent-signal/evaluation";
import type { ReviewBoundaryV1 } from "./reviewBoundary.js";

/** The executor-facing view intentionally has no oracle or evaluator bindings. */
export interface ModeExecutionInputV1 {
  schemaVersion: "evaluation-mode-input.v1";
  attempt: EvaluationAttemptV1;
  profile: EvaluationExecutionProfileV1;
  scenario: {
    scenarioId: string;
    revision: string;
    purpose: string;
    dataPolicy: EvaluationScenarioV1["dataPolicy"];
    input: EvaluationScenarioV1["input"];
    initialState: EvaluationScenarioV1["initialState"];
  };
}

export interface ObservedCriterionV1 {
  criterionId: string;
  status: "pass" | "fail" | "needs_review" | "not_run";
  reasonCode: string;
  evidenceLocator: string;
  value?: JsonValue;
}

export interface ObservedViolationV1 {
  outcomeId?: string;
  category: string;
  reasonCode: string;
  evidenceLocator: string;
}

export interface ModeExecutionObservationV1 {
  schemaVersion: "evaluation-mode-observation.v1";
  mode: EvaluationExecutionMode;
  terminalStatus: EvaluationResultV1["terminalStatus"];
  terminalReasonCode: string;
  outcomeStatus: EvaluationScenarioV1["oracle"]["terminal"]["status"];
  /** Executor-produced result. The evaluator may compare it with the local oracle. */
  output: JsonValue;
  /** Typed separation of source evidence, authority, interpretation, action, and outcome. */
  reviewBoundary: ReviewBoundaryV1;
  trace: SafeEvaluationTraceV1[];
  criteria: ObservedCriterionV1[];
  violations: ObservedViolationV1[];
  outputDigest: Sha256Digest;
  startedAt: string;
  completedAt: string;
}

export interface EvaluationModeExecutor {
  readonly mode: EvaluationExecutionMode;
  execute(input: ModeExecutionInputV1): Promise<ModeExecutionObservationV1>;
}

export interface DeterministicEvaluationContextV1 {
  attempt: EvaluationAttemptV1;
  profile: EvaluationExecutionProfileV1;
  scenario: EvaluationScenarioV1;
  observation: ModeExecutionObservationV1;
}

export interface DeterministicEvaluator {
  readonly evaluatorId: string;
  readonly version: string;
  evaluate(context: DeterministicEvaluationContextV1): EvaluationScoreV1[];
}

export interface EvaluationAttemptOutcomeV1 {
  manifestDigest: Sha256Digest;
  result: EvaluationResultV1;
  gate: EvaluationGateResultV1;
  observation: ModeExecutionObservationV1;
  projectionReceipts: ProjectionReceiptV1[];
}

export interface SafeDatasetItemV1 {
  id: string;
  scenarioId: string;
  revision: string;
  scenarioDigest: Sha256Digest;
  suiteIds: string[];
  riskTier: EvaluationScenarioV1["riskTier"];
  lifecycle: EvaluationScenarioV1["lifecycle"];
  adjudication: EvaluationScenarioV1["adjudication"];
  partition: EvaluationScenarioV1["partition"];
  dataClass: EvaluationScenarioV1["dataPolicy"]["dataClass"];
  slices: Record<string, string>;
}

export interface SafeProjectionEnvelopeV1 {
  schemaVersion: "safe-opik-projection.v1";
  policyVersion: string;
  projectName: string;
  datasetName: string;
  datasetDigest: Sha256Digest;
  runId: string;
  manifestDigest: Sha256Digest;
  scenarioId: string;
  scenarioRevision: string;
  scenarioDigest: Sha256Digest;
  profileId: string;
  profileVersion: string;
  profileDigest: Sha256Digest;
  agentDefinitionId: string;
  agentDefinitionVersion: string;
  agentDefinitionDigest: Sha256Digest;
  attemptId: string;
  trialNumber: number;
  mode: EvaluationExecutionMode;
  systemUnderTest: string[];
  dataClass: EvaluationScenarioV1["dataPolicy"]["dataClass"];
  exportDecision: "content_allowed" | "metadata_only";
  terminalStatus?: EvaluationResultV1["terminalStatus"];
  terminalReasonCode?: string;
  gateStatus?: EvaluationGateResultV1["status"];
  trace: SafeEvaluationTraceV1[];
  scores: SafeProjectedScoreV1[];
  opaqueTraceRef: string;
}

export interface SafeEvidenceLocatorV1 {
  artifactId: string;
  jsonPointer?: string;
  sourceRef?: string;
}

/** Atomic criterion projection. It is never an aggregate release approval. */
export interface SafeProjectedScoreV1 {
  scoreId: string;
  capability: string;
  criterionId: string;
  evaluatorId: string;
  evaluatorVersion: string;
  evaluatorKind: EvaluationScoreV1["evaluatorKind"];
  status: EvaluationScoreV1["status"];
  gateAuthority: boolean;
  veto: boolean;
  evidenceLocators: SafeEvidenceLocatorV1[];
  semantic: "atomic_criterion";
  aggregateApproval: false;
  reasonCode?: string;
}

export interface SafeProjectedTerminalV1 {
  status: EvaluationResultV1["terminalStatus"];
  reasonCode: string;
  gateStatus: EvaluationGateResultV1["status"];
}

export interface DatasetSyncPlanV1 {
  schemaVersion: "evaluation-dataset-sync-plan.v1";
  policyVersion: string;
  projectName: string;
  datasetName: string;
  suiteId: string;
  suiteVersion: string;
  suiteDigest: Sha256Digest;
  desiredDatasetDigest: Sha256Digest;
  dryRun: boolean;
  operation: "create" | "replace_changed" | "noop";
  itemCount: number;
  items: SafeDatasetItemV1[];
  priorDigest?: Sha256Digest;
}

export interface AnnotationImportProposalV1 {
  schemaVersion: "evaluation-annotation-import-proposal.v1";
  proposalId: string;
  source: "opik_annotation_export";
  importedAt: string;
  rubricId: string;
  rubricVersion: string;
  scenarioId: string;
  attemptId: string;
  criterionId: string;
  reviewerRef: string;
  label:
    | "accept"
    | "accept_with_edits"
    | "reject"
    | "wrong_person"
    | "wrong_speaker"
    | "missing_evidence"
    | "stale"
    | "unnecessary_research"
    | "unsafe_action";
  evidenceLocators: string[];
  comment?: string;
  adjudication: "unreviewed";
  sourceDigest: Sha256Digest;
}
