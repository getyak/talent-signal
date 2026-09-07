import type { JsonValue, Sha256Digest } from "./contracts.js";
import { digestCanonicalJson, hasValidSha256Format, withContentDigest } from "./digest.js";
import { assertPhaseOneDatasetCurrent, assertPhaseOneDigest, phaseOneAssert, phaseOneFreeze, phaseOneId, phaseOneTime,
  type PhaseOneCase, type PhaseOneDataset, type PhaseOneExposure } from "./phaseOneDataset.js";

export type PhaseOneStatus = "pass" | "fail" | "not_run" | "needs_review" | "unavailable";
export type PhaseOneCategory = "execution_integrity" | "deterministic_boundary" | "semantic_quality" | "release_conditions";

export interface PhaseOneConfiguration {
  configurationId: string;
  model: string;
  promptRevision: string;
  promptContentDigest: Sha256Digest;
  runtimePolicyDigest: Sha256Digest;
  parameters: JsonValue;
}

export interface PhaseOneCriterion {
  criterionId: string;
  category: Exclude<PhaseOneCategory, "execution_integrity" | "release_conditions">;
  evaluatorId: string;
  evaluatorKind: "deterministic" | "human" | "model";
  critical: boolean;
}

export interface PhaseOneComparison {
  schemaVersion: "phase-one-comparison.v1";
  runId: string;
  generatorActorId: string;
  datasetDigest: Sha256Digest;
  rubricDigest: Sha256Digest;
  environmentDigest: Sha256Digest;
  baseline: PhaseOneConfiguration;
  candidate: PhaseOneConfiguration;
  repetitions: number;
  seed: number;
  criteria: PhaseOneCriterion[];
  contentDigest: Sha256Digest;
}

export interface PhaseOneProductRequest {
  caseId: string;
  modelInput: JsonValue;
  referenceTime: string;
  configuration: PhaseOneConfiguration;
  configurationDigest: Sha256Digest;
  repetition: number;
  seed: number;
  idempotencyKey: string;
}

export interface PhaseOneProductReceipt {
  status: "completed" | "failed" | "unavailable";
  output: JsonValue | null;
  loadedConfigurationDigest: Sha256Digest | null;
  adapterId: string;
  receiptId: string;
  providerKind: "real_model" | "deterministic_fake";
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  durationMs: number | null;
}

export interface PhaseOneProductExecutor {
  executorId: string;
  execute(request: PhaseOneProductRequest): Promise<PhaseOneProductReceipt>;
}

export interface PhaseOneJudgment {
  criterionId: string;
  status: PhaseOneStatus;
  evidenceRefs: string[];
  /** Human decisions come from trusted review storage, never generated prose. */
  humanReviewerId?: string;
  humanDecisionRef?: string;
}

export interface PhaseOneJudgeAssurance {
  evaluatorId: string;
  rubricDigest: Sha256Digest;
  calibrationDigest: Sha256Digest | null;
  calibrationEligible: boolean;
  injectionProbe: PhaseOneStatus;
  orderStability: PhaseOneStatus;
  repeatStability: PhaseOneStatus;
}

export interface PhaseOneEvaluator {
  evaluate(input: { caseId: string; modelInput: JsonValue; oracle: JsonValue; output: JsonValue;
    repetition: number; criteria: readonly PhaseOneCriterion[] }): Promise<PhaseOneJudgment[]>;
}

export interface PhaseOneObservation {
  criterionId: string;
  category: PhaseOneCategory;
  critical: boolean;
  status: PhaseOneStatus;
  reasonCode: string;
  evidenceRefs: string[];
}

export interface PhaseOneAttemptResult {
  caseId: string;
  variant: "baseline" | "candidate";
  repetition: number;
  configurationDigest: Sha256Digest;
  receiptDigest: Sha256Digest | null;
  providerKind: "real_model" | "deterministic_fake" | "unavailable";
  observations: PhaseOneObservation[];
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  durationMs: number | null;
}

export interface PhaseOneMetric {
  numerator: number;
  denominator: number;
  unknown: number;
  value: number | null;
}

export interface PhaseOneReport {
  schemaVersion: "phase-one-report.v1";
  comparisonDigest: Sha256Digest;
  datasetDigest: Sha256Digest;
  exposureDigest: Sha256Digest;
  judgmentContextDigest: Sha256Digest;
  executorId: string;
  mode: "development" | "independent_verification";
  createdAt: string;
  attempts: PhaseOneAttemptResult[];
  categories: Record<PhaseOneCategory, PhaseOneStatus>;
  baseline: PhaseOneMetric;
  candidate: PhaseOneMetric;
  paired: { wins: number; regressions: number; ties: number; unknown: number; denominator: number };
  slices: Array<{ dimension: string; value: string; baseline: PhaseOneMetric; candidate: PhaseOneMetric }>;
  failures: Array<{ caseId: string; variant: "baseline" | "candidate"; repetition: number; criterionId: string; reasonCode: string }>;
  cost: { baseline: PhaseOneMetric; candidate: PhaseOneMetric; judges: PhaseOneMetric };
  safetyVeto: boolean;
  releaseAuthority: "none";
  contentDigest: Sha256Digest;
}

const executedReports = new WeakSet<PhaseOneReport>();

/** Signing is available only for reports produced by this executor instance. */
export function assertPhaseOneExecutedReport(report: PhaseOneReport): void {
  phaseOneAssert(executedReports.has(report), "PHASE_ONE_REPORT_NOT_EXECUTED_HERE");
  assertPhaseOneDigest(report);
}

export function freezePhaseOneComparison(input: Omit<PhaseOneComparison, "schemaVersion" | "contentDigest">): PhaseOneComparison {
  phaseOneId(input.runId); phaseOneId(input.generatorActorId);
  for (const digest of [input.datasetDigest, input.rubricDigest, input.environmentDigest]) phaseOneAssert(hasValidSha256Format(digest), "PHASE_ONE_DIGEST_INVALID");
  phaseOneAssert(Number.isInteger(input.repetitions) && input.repetitions >= 2 && input.repetitions <= 10, "PHASE_ONE_REPETITIONS_INVALID");
  phaseOneAssert(Number.isInteger(input.seed) && input.seed >= 0 && input.seed <= 2 ** 31 - 1, "PHASE_ONE_SEED_INVALID");
  for (const config of [input.baseline, input.candidate]) {
    phaseOneId(config.configurationId); phaseOneId(config.model); phaseOneId(config.promptRevision);
    phaseOneAssert(hasValidSha256Format(config.promptContentDigest) && hasValidSha256Format(config.runtimePolicyDigest), "PHASE_ONE_CONFIGURATION_DIGEST_INVALID");
  }
  phaseOneAssert(input.baseline.configurationId !== input.candidate.configurationId, "PHASE_ONE_CONFIGURATION_ID_DUPLICATE");
  phaseOneAssert(input.criteria.length > 0, "PHASE_ONE_CRITERIA_EMPTY");
  const ids = new Set<string>();
  for (const criterion of input.criteria) {
    phaseOneId(criterion.criterionId); phaseOneId(criterion.evaluatorId);
    phaseOneAssert(!ids.has(criterion.criterionId) && criterion.criterionId !== "execution.receipt", "PHASE_ONE_CRITERION_DUPLICATE");
    ids.add(criterion.criterionId);
    phaseOneAssert(["deterministic_boundary", "semantic_quality"].includes(criterion.category)
      && ["deterministic", "human", "model"].includes(criterion.evaluatorKind) && typeof criterion.critical === "boolean", "PHASE_ONE_CRITERION_INVALID");
    phaseOneAssert(criterion.category !== "deterministic_boundary" || criterion.evaluatorKind === "deterministic", "PHASE_ONE_BOUNDARY_REQUIRES_DETERMINISTIC_EVALUATOR");
    phaseOneAssert(criterion.category !== "semantic_quality" || criterion.evaluatorKind !== "deterministic", "PHASE_ONE_SEMANTIC_AUTHORITY_INVALID");
  }
  return phaseOneFreeze(withContentDigest({ schemaVersion: "phase-one-comparison.v1" as const, ...input }));
}

function aggregate(statuses: readonly PhaseOneStatus[]): PhaseOneStatus {
  if (statuses.length === 0) return "not_run";
  for (const status of ["fail", "unavailable", "not_run", "needs_review"] as const) if (statuses.includes(status)) return status;
  return "pass";
}

function metric(observations: PhaseOneObservation[]): PhaseOneMetric {
  const numerator = observations.filter((item) => item.status === "pass").length;
  const denominator = observations.length;
  return { numerator, denominator, unknown: observations.filter((item) => !["pass", "fail"].includes(item.status)).length,
    value: denominator === 0 ? null : numerator / denominator };
}

function costMetric(attempts: PhaseOneAttemptResult[]): PhaseOneMetric {
  const numerator = attempts.reduce((sum, item) => sum + (item.costUsd ?? 0), 0);
  const unknown = attempts.filter((item) => item.costUsd === null).length;
  return { numerator, denominator: attempts.length, unknown, value: unknown > 0 || attempts.length === 0 ? null : numerator };
}

function judgeObservation(criterion: PhaseOneCriterion, judgment: PhaseOneJudgment | undefined,
  comparison: PhaseOneComparison, assurances: readonly PhaseOneJudgeAssurance[]): PhaseOneObservation {
  let status: PhaseOneStatus = judgment?.status ?? "not_run";
  let reasonCode = judgment ? "ATOMIC_CRITERION_RECORDED" : "ATOMIC_CRITERION_MISSING";
  phaseOneAssert(["pass", "fail", "not_run", "needs_review", "unavailable"].includes(status), "PHASE_ONE_JUDGMENT_STATUS_INVALID");
  judgment?.evidenceRefs.forEach(phaseOneId);
  if (judgment && ["pass", "fail"].includes(status) && judgment.evidenceRefs.length === 0) {
    status = "needs_review"; reasonCode = "CRITERION_EVIDENCE_MISSING";
  }
  if (criterion.evaluatorKind === "human" && judgment && ["pass", "fail"].includes(status)) {
    if (!judgment.humanReviewerId || !judgment.humanDecisionRef || judgment.humanReviewerId === comparison.generatorActorId
      || comparison.criteria.some((item) => item.evaluatorId === judgment.humanReviewerId && item.evaluatorKind === "model")) {
      status = "needs_review"; reasonCode = "INDEPENDENT_HUMAN_DECISION_MISSING";
    } else { phaseOneId(judgment.humanReviewerId); phaseOneId(judgment.humanDecisionRef); }
  }
  if (criterion.evaluatorKind === "model") {
    const assurance = assurances.find((item) => item.evaluatorId === criterion.evaluatorId && item.rubricDigest === comparison.rubricDigest);
    const trusted = assurance?.calibrationEligible && hasValidSha256Format(assurance.calibrationDigest)
      && assurance.injectionProbe === "pass" && assurance.orderStability === "pass" && assurance.repeatStability === "pass";
    // Model judgments remain interpretation. Trusted calibration and adversarial stability are required even for noncritical passes.
    if (status === "pass" && !trusted) {
      status = "needs_review"; reasonCode = "JUDGE_ASSURANCE_INCOMPLETE";
    }
  }
  return { criterionId: criterion.criterionId, category: criterion.category, critical: criterion.critical,
    status, reasonCode, evidenceRefs: judgment?.evidenceRefs ?? [] };
}

/** Execute both arms through the same product adapter. Gold never enters execute(). */
export async function runPhaseOnePairedEvaluation(input: {
  comparison: PhaseOneComparison; dataset: PhaseOneDataset; cases: readonly PhaseOneCase[]; exposures: readonly PhaseOneExposure[];
  executor: PhaseOneProductExecutor; evaluator: PhaseOneEvaluator; judgeAssurances: readonly PhaseOneJudgeAssurance[];
  mode: "development" | "independent_verification"; createdAt: string; judgmentContextDigest: Sha256Digest;
  judgeCosts?: () => readonly (number | null)[];
}): Promise<PhaseOneReport> {
  const comparison = phaseOneFreeze(input.comparison);
  assertPhaseOneDigest(comparison);
  phaseOneAssert(freezePhaseOneComparison(comparison).contentDigest === comparison.contentDigest, "PHASE_ONE_COMPARISON_INVALID");
  const dataset = phaseOneFreeze(input.dataset), cases = phaseOneFreeze(input.cases), exposures = phaseOneFreeze(input.exposures);
  assertPhaseOneDatasetCurrent(dataset, cases, exposures);
  phaseOneAssert(comparison.datasetDigest === dataset.contentDigest, "PHASE_ONE_COMPARISON_DATASET_MISMATCH");
  phaseOneId(input.executor.executorId); phaseOneTime(input.createdAt);
  phaseOneAssert(hasValidSha256Format(input.judgmentContextDigest), "PHASE_ONE_JUDGMENT_CONTEXT_REQUIRED");
  phaseOneAssert(input.mode === "development" || input.mode === "independent_verification", "PHASE_ONE_MODE_INVALID");
  if (input.mode === "independent_verification") {
    phaseOneAssert(input.executor.executorId !== comparison.generatorActorId
      && !comparison.criteria.some((item) => item.evaluatorId === input.executor.executorId), "PHASE_ONE_EXECUTOR_NOT_INDEPENDENT");
    phaseOneAssert(dataset.cases.every((item) => item.currentPurpose === "final_verification" && item.sourcePartition !== "dev"), "PHASE_ONE_FINAL_DATA_EXPOSED_OR_DEVELOPMENT");
  } else phaseOneAssert(dataset.cases.every((item) => item.currentPurpose === "development"), "PHASE_ONE_DEVELOPMENT_ACCESS_TO_HOLDOUT");
  const attempts: PhaseOneAttemptResult[] = [], receiptIds = new Set<string>();
  for (const frozenCase of dataset.cases) {
    const item = cases.find((current) => current.caseId === frozenCase.caseId)!;
    for (let repetition = 1; repetition <= comparison.repetitions; repetition += 1) {
      // Alternate position by case and repeat; both arms use the same seed.
      const variants: Array<"baseline" | "candidate"> = (repetition + dataset.cases.indexOf(frozenCase) + comparison.seed) % 2 === 0
        ? ["baseline", "candidate"] : ["candidate", "baseline"];
      for (const variant of variants) {
        const configuration = comparison[variant], configurationDigest = digestCanonicalJson(configuration);
        let receipt: PhaseOneProductReceipt | null = null;
        try {
          receipt = await input.executor.execute(phaseOneFreeze({ caseId: item.caseId, modelInput: item.modelInput,
            referenceTime: item.referenceTime, configuration, configurationDigest, repetition, seed: comparison.seed + repetition - 1,
            idempotencyKey: digestCanonicalJson({ comparison: comparison.contentDigest, caseId: item.caseId, variant, repetition }) }));
        } catch { /* No provider exceptions or input content are exported. Unknown stays unknown. */ }
        let integrity: PhaseOneStatus = receipt?.status === "completed" ? "pass" : receipt?.status === "failed" ? "fail" : "unavailable";
        if (receipt) {
          try {
            phaseOneId(receipt.receiptId); phaseOneId(receipt.adapterId);
            phaseOneAssert(["real_model", "deterministic_fake"].includes(receipt.providerKind), "PHASE_ONE_PROVIDER_KIND_INVALID");
            for (const value of [receipt.inputTokens, receipt.outputTokens, receipt.costUsd, receipt.durationMs]) {
              phaseOneAssert(value === null || Number.isFinite(value) && value >= 0, "PHASE_ONE_USAGE_INVALID");
            }
            phaseOneAssert(!receiptIds.has(receipt.receiptId), "PHASE_ONE_RECEIPT_REUSED");
            receiptIds.add(receipt.receiptId);
            phaseOneAssert(receipt.status !== "completed" || receipt.loadedConfigurationDigest === configurationDigest && receipt.output !== null,
              "PHASE_ONE_LOADED_CONFIGURATION_MISMATCH");
          } catch { integrity = "fail"; receipt = null; }
        }
        const observations: PhaseOneObservation[] = [{ criterionId: "execution.receipt", category: "execution_integrity", critical: true,
          status: integrity, reasonCode: integrity === "pass" ? "PRODUCT_EXECUTION_RECEIPT_VERIFIED" : "PRODUCT_EXECUTION_UNVERIFIED",
          evidenceRefs: receipt ? [receipt.receiptId] : [] }];
        let judgments: PhaseOneJudgment[] = [];
        if (integrity === "pass" && receipt?.output !== null && receipt?.output !== undefined) {
          try {
            judgments = await input.evaluator.evaluate(phaseOneFreeze({ caseId: item.caseId, modelInput: item.modelInput, oracle: item.oracle,
              output: receipt.output, repetition, criteria: comparison.criteria }));
            phaseOneAssert(new Set(judgments.map((entry) => entry.criterionId)).size === judgments.length
              && judgments.every((entry) => comparison.criteria.some((criterion) => criterion.criterionId === entry.criterionId)), "PHASE_ONE_JUDGMENTS_INVALID");
            for (const judgment of judgments) { judgment.evidenceRefs.forEach(phaseOneId); }
          } catch { judgments = []; }
        }
        for (const criterion of comparison.criteria) {
          try {
            const observation = judgeObservation(criterion, judgments.find((entry) => entry.criterionId === criterion.criterionId), comparison, input.judgeAssurances);
            if (receipt?.providerKind === "deterministic_fake" && criterion.category === "semantic_quality" && observation.status === "pass") {
              observation.status = "needs_review"; observation.reasonCode = "FIXTURE_CANNOT_PROVE_MODEL_QUALITY";
            }
            observations.push(observation);
          }
          catch { observations.push({ ...criterion, status: "needs_review", reasonCode: "JUDGMENT_INVALID", evidenceRefs: [] }); }
        }
        attempts.push({ caseId: item.caseId, variant, repetition, configurationDigest, receiptDigest: receipt ? digestCanonicalJson(receipt) : null,
          providerKind: receipt?.providerKind ?? "unavailable", observations, inputTokens: receipt?.inputTokens ?? null, outputTokens: receipt?.outputTokens ?? null,
          costUsd: receipt?.costUsd ?? null, durationMs: receipt?.durationMs ?? null });
      }
    }
  }
  const candidate = attempts.filter((item) => item.variant === "candidate"), baseline = attempts.filter((item) => item.variant === "baseline");
  const paired = { wins: 0, regressions: 0, ties: 0, unknown: 0, denominator: 0 };
  for (const left of baseline) {
    const right = candidate.find((item) => item.caseId === left.caseId && item.repetition === left.repetition)!;
    for (const before of left.observations) {
      const after = right.observations.find((item) => item.criterionId === before.criterionId)!;
      paired.denominator += 1;
      if (!["pass", "fail"].includes(before.status) || !["pass", "fail"].includes(after.status)) paired.unknown += 1;
      else if (before.status === after.status) paired.ties += 1;
      else if (after.status === "pass") paired.wins += 1;
      else paired.regressions += 1;
    }
  }
  const slices: PhaseOneReport["slices"] = [];
  const dimensions = new Set(dataset.cases.flatMap((item) => ["source_partition", ...Object.keys(item.slices)]));
  for (const dimension of [...dimensions].sort()) {
    const valueOf = (item: PhaseOneDataset["cases"][number]) => dimension === "source_partition" ? item.sourcePartition : item.slices[dimension];
    for (const value of [...new Set(dataset.cases.map(valueOf).filter((item): item is string => item !== undefined))].sort()) {
      const ids = new Set(dataset.cases.filter((item) => valueOf(item) === value).map((item) => item.caseId));
      slices.push({ dimension, value, baseline: metric(baseline.filter((item) => ids.has(item.caseId)).flatMap((item) => item.observations)),
        candidate: metric(candidate.filter((item) => ids.has(item.caseId)).flatMap((item) => item.observations)) });
    }
  }
  const candidateObservations = candidate.flatMap((item) => item.observations);
  const categories: PhaseOneReport["categories"] = {
    execution_integrity: aggregate(attempts.flatMap((item) => item.observations).filter((item) => item.category === "execution_integrity").map((item) => item.status)),
    deterministic_boundary: aggregate(candidateObservations.filter((item) => item.category === "deterministic_boundary").map((item) => item.status)),
    semantic_quality: aggregate(candidateObservations.filter((item) => item.category === "semantic_quality").map((item) => item.status)),
    release_conditions: "not_run",
  };
  const judgeCosts = input.judgeCosts?.() ?? [];
  const judgeUnknown = judgeCosts.filter(value => value === null).length;
  const judgeTotal = judgeCosts.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const report = phaseOneFreeze(withContentDigest({ schemaVersion: "phase-one-report.v1" as const, comparisonDigest: comparison.contentDigest,
    datasetDigest: dataset.contentDigest, exposureDigest: dataset.exposureDigest, judgmentContextDigest: input.judgmentContextDigest, executorId: input.executor.executorId,
    mode: input.mode, createdAt: input.createdAt, attempts, categories, baseline: metric(baseline.flatMap((item) => item.observations)),
    candidate: metric(candidateObservations), paired, slices,
    failures: attempts.flatMap((attempt) => attempt.observations.filter((item) => item.status === "fail").map((item) => ({ caseId: attempt.caseId,
      variant: attempt.variant, repetition: attempt.repetition, criterionId: item.criterionId, reasonCode: item.reasonCode }))),
    cost: { baseline: costMetric(baseline), candidate: costMetric(candidate), judges: { numerator: judgeTotal, denominator: judgeCosts.length, unknown: judgeUnknown, value: judgeCosts.length === 0 || judgeUnknown > 0 ? null : judgeTotal } },
    safetyVeto: candidateObservations.some((item) => item.critical && item.status === "fail"), releaseAuthority: "none" as const }));
  executedReports.add(report);
  return report;
}
