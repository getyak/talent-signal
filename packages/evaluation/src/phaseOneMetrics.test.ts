import { describe, expect, it } from "vitest";
import { digestCanonicalJson as hash } from "./digest.js";
import { freezePhaseOneDataset, type PhaseOneCase } from "./phaseOneDataset.js";
import { freezePhaseOneComparison, PHASE_ONE_SEMANTIC_DIMENSIONS, runPhaseOnePairedEvaluation,
  type PhaseOneCriterion, type PhaseOneEvaluator, type PhaseOneProductExecutor } from "./phaseOneEvaluation.js";

const referenceTime = "2026-09-07T12:00:00.000Z";
const boundary: PhaseOneCriterion = { criterionId: "relationship.output_boundary", category: "deterministic_boundary",
  evaluatorId: "boundary-1", evaluatorKind: "deterministic", critical: true };

function fixture() {
  const cases: PhaseOneCase[] = (["p0", "held_out"] as const).map((sourcePartition, index) => ({
    caseId: `case-${index}`, sourcePartition, purpose: "final_verification", sourceIds: [`source-${index}`], referenceTime,
    modelInput: { synthetic: index }, oracle: { expectedBehavior: "Keep source and time uncertainty explicit" }, slices: { behavior: index === 0 ? "ambiguity" : "historical_state" },
  }));
  const dataset = freezePhaseOneDataset({ datasetId: "metrics-study", cases, exposures: [] });
  const config = { model: "test-model", promptRevision: "test-revision", promptContentDigest: hash("prompt"), runtimePolicyDigest: hash("policy"), parameters: {} };
  const criteria: PhaseOneCriterion[] = [boundary, ...PHASE_ONE_SEMANTIC_DIMENSIONS.map(dimension => ({ criterionId: dimension.criterionId,
    category: "semantic_quality" as const, evaluatorId: "review-store", evaluatorKind: "human" as const, critical: true }))];
  const comparison = freezePhaseOneComparison({ runId: "metrics-run", generatorActorId: "generator-1", datasetDigest: dataset.contentDigest,
    rubricDigest: hash({ version: "metrics-test.v2", criteria }), environmentDigest: hash("test-environment"),
    baseline: { ...config, configurationId: "baseline" }, candidate: { ...config, configurationId: "candidate" }, repetitions: 2, seed: 1, criteria });
  let receipts = 0;
  const executor: PhaseOneProductExecutor = { executorId: "independent-executor", async execute(request) {
    return { status: "completed", output: { variant: request.configuration.configurationId }, loadedConfigurationDigest: request.configurationDigest,
      adapterId: "test-adapter", receiptId: `receipt-${++receipts}`, providerKind: "real_model", inputTokens: 10, outputTokens: 5, costUsd: 0.01, durationMs: 50 };
  } };
  const evaluator: PhaseOneEvaluator = { async evaluate(input) {
    expect(input.referenceTime).toBe(referenceTime);
    return input.criteria.map(criterion => ({ criterionId: criterion.criterionId, status: "pass", evidenceRefs: [`source:${input.caseId}`],
      humanReviewerId: "independent-human", humanDecisionRef: `review:${input.caseId}:${criterion.criterionId}` }));
  } };
  const run = (overrides: Partial<Parameters<typeof runPhaseOnePairedEvaluation>[0]> = {}) => runPhaseOnePairedEvaluation({
    comparison, dataset, cases, exposures: [], executor, evaluator, judgeAssurances: [], mode: "independent_verification",
    judgmentContextDigest: hash("review-snapshot"), createdAt: referenceTime, ...overrides,
  });
  return { run, executor, evaluator, comparison };
}

describe("versioned atomic phase-one metrics", () => {
  it("keeps every dimension and slice denominator independent, including missing judgments and critical regressions", async () => {
    const state = fixture();
    const report = await state.run({ evaluator: { async evaluate(input) {
      const result = await state.evaluator.evaluate(input), candidate = (input.output as { variant: string }).variant === "candidate";
      return result.filter(item => !(candidate && input.caseId === "case-0" && item.criterionId === "relationship.ambiguity_handling"))
        .map(item => ({ ...item, status: (!candidate && input.caseId === "case-0" && item.criterionId === "relationship.evidence_support")
          || (candidate && input.caseId === "case-1" && item.criterionId === "relationship.temporal_correctness") ? "fail" : item.status }));
    } } });
    expect(report.metrics.schemaVersion).toBe("phase-one-metrics.v1");
    const dimension = (name: string) => report.metrics.criteria.find(item => item.criterionId === `relationship.${name}`)!;
    expect(dimension("evidence_support")).toMatchObject({ baseline: { numerator: 2, denominator: 4, unknown: 0 },
      candidate: { numerator: 4, denominator: 4, unknown: 0 }, paired: { wins: 2, regressions: 0, ties: 2, unknown: 0, denominator: 4 } });
    expect(dimension("ambiguity_handling")).toMatchObject({ candidate: { numerator: 2, denominator: 4, unknown: 2, value: 0.5 },
      paired: { wins: 0, regressions: 0, ties: 2, unknown: 2, denominator: 4 } });
    expect(dimension("temporal_correctness")).toMatchObject({ candidate: { numerator: 2, denominator: 4, unknown: 0 },
      paired: { wins: 0, regressions: 2, ties: 2, unknown: 0, denominator: 4 } });
    for (const name of ["valid_completion", "correction_burden"]) expect(dimension(name).candidate).toEqual({ numerator: 4, denominator: 4, unknown: 0, value: 1 });
    const ambiguous = report.slices.find(item => item.dimension === "behavior" && item.value === "ambiguity")!;
    expect(ambiguous.criteria.find(item => item.criterionId === "relationship.ambiguity_handling")!.candidate)
      .toEqual({ numerator: 0, denominator: 2, unknown: 2, value: 0 });
    const historical = report.slices.find(item => item.dimension === "source_partition" && item.value === "held_out")!;
    expect(historical.criteria.find(item => item.criterionId === "relationship.temporal_correctness")!.candidate)
      .toEqual({ numerator: 0, denominator: 2, unknown: 0, value: 0 });
    expect(report.categories.semantic_quality).toBe("fail"); expect(report.safetyVeto).toBe(true);
    expect(report.failures.filter(item => item.variant === "candidate").every(item => item.criterionId === "relationship.temporal_correctness")).toBe(true);
  });

  it("counts unknown cost, token usage and duration separately instead of imputing zeros", async () => {
    const state = fixture();
    const report = await state.run({ executor: { ...state.executor, async execute(request) {
      const receipt = await state.executor.execute(request);
      return request.caseId === "case-1" && request.configuration.configurationId === "candidate"
        ? { ...receipt, inputTokens: null, costUsd: null, durationMs: null } : receipt;
    } }, judgeUsage: () => [
      { inputTokens: 20, outputTokens: 8, costUsd: 0.005, durationMs: 10 },
      { inputTokens: null, outputTokens: 0, costUsd: null, durationMs: null },
    ] });
    expect(report.metrics.usage.baseline.inputTokens).toEqual({ numerator: 40, denominator: 4, unknown: 0, value: 40 });
    expect(report.metrics.usage.candidate.inputTokens).toEqual({ numerator: 20, denominator: 4, unknown: 2, value: null });
    expect(report.metrics.usage.candidate.outputTokens).toEqual({ numerator: 20, denominator: 4, unknown: 0, value: 20 });
    expect(report.metrics.usage.candidate.durationMs).toEqual({ numerator: 100, denominator: 4, unknown: 2, value: null });
    expect(report.cost.candidate).toEqual({ numerator: 0.02, denominator: 4, unknown: 2, value: null });
    expect(report.metrics.usage.judges.inputTokens).toEqual({ numerator: 20, denominator: 2, unknown: 1, value: null });
    expect(report.metrics.usage.judges.outputTokens).toEqual({ numerator: 8, denominator: 2, unknown: 0, value: 8 });
    expect(report.metrics.usage.judges.costUsd).toEqual(report.cost.judges);
    expect(report.cost.judges).toEqual({ numerator: 0.005, denominator: 2, unknown: 1, value: null });
  });

  it("retains denominator coverage when an execution is absent or the evaluator returns no semantic judgments", async () => {
    const state = fixture();
    const report = await state.run({ executor: { ...state.executor, async execute(request) {
      if (request.caseId === "case-0" && request.configuration.configurationId === "candidate") throw new Error("provider unavailable");
      return state.executor.execute(request);
    } }, evaluator: { async evaluate(input) { return (await state.evaluator.evaluate(input)).filter(item => item.criterionId === boundary.criterionId); } } });
    for (const dimension of report.metrics.criteria.filter(item => item.category === "semantic_quality")) {
      expect(dimension.candidate).toEqual({ numerator: 0, denominator: 4, unknown: 4, value: 0 });
      expect(dimension.paired).toEqual({ wins: 0, regressions: 0, ties: 0, unknown: 4, denominator: 4 });
    }
    expect(report.metrics.usage.candidate.inputTokens).toMatchObject({ numerator: 20, denominator: 4, unknown: 2, value: null });
    expect(report.metrics.usage.judges.costUsd).toEqual({ numerator: 0, denominator: 0, unknown: 0, value: null });
    expect(report.categories.execution_integrity).toBe("unavailable"); expect(report.categories.semantic_quality).toBe("not_run");
  });

  it("cannot promote fake executions or uncalibrated model judgments into any semantic dimension pass", async () => {
    const state = fixture();
    const fake = await state.run({ executor: { ...state.executor, async execute(request) { return { ...await state.executor.execute(request), providerKind: "deterministic_fake" }; } } });
    const comparison = freezePhaseOneComparison({ ...state.comparison, criteria: state.comparison.criteria.map(item => item.category === "semantic_quality"
      ? { ...item, evaluatorKind: "model" as const, evaluatorId: "model-judge" } : item) });
    const uncalibrated = await state.run({ comparison });
    for (const report of [fake, uncalibrated]) {
      expect(report.categories.deterministic_boundary).toBe("pass");
      expect(report.categories.semantic_quality).toBe("needs_review");
      for (const dimension of report.metrics.criteria.filter(item => item.category === "semantic_quality")) {
        expect(dimension.candidate).toEqual({ numerator: 0, denominator: 4, unknown: 4, value: 0 });
      }
    }
  });
});
