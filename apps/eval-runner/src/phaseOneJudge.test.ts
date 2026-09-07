import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { digestCanonicalJson, PHASE_ONE_SEMANTIC_DIMENSIONS } from "@talent-signal/evaluation";
import { FileOptimizationBudgetLedger } from "./optimization/budget.js";
import { eligiblePhaseOneJudgeAssurance, evaluatePhaseOneModelJudgment, PHASE_ONE_JUDGE_POLICY,
  type PhaseOneCalibratedJudgeAssurance, type PhaseOneModelJudgeConfiguration } from "./phaseOneJudge.js";

const paths: string[] = [], ledgers: FileOptimizationBudgetLedger[] = [];
const hash = digestCanonicalJson;
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "phase-one-judge-")); paths.push(directory);
  const ledger = new FileOptimizationBudgetLedger({ path: join(directory, "ledger.sqlite") }); ledgers.push(ledger);
  const now = Date.now(), limits = { amountMicros: 1000000, calls: 20, tokens: 100000, elapsedMs: 360000, candidateCount: 2, concurrency: 2 };
  const run = { runId: "judge-run", bindings: { baselineDigest: hash("baseline"), datasetDigest: hash("dataset"), evaluatorVersion: "judge.v1", optimizerVersion: "optimizer.v1" },
    permit: { permitId: "unit-fixture-only", budgetScopeId: "unit-fixture", status: "active" as const, currency: "USD", issuedAt: new Date(now - 1000).toISOString(),
      expiresAt: new Date(now + 86400000).toISOString(), runLimits: limits, monthlyLimits: limits,
      finalValidationReserve: { amountMicros: 100, calls: 4, tokens: 4000, elapsedMs: 30000, candidateCount: 0 } } };
  ledger.startRun(run);
  const config: PhaseOneModelJudgeConfiguration = { kind: "model", evaluatorId: "judge-1", model: "glm-4.5", assuranceFile: "assurance.json",
    pricing: { currency: "USD", inputMicrosPerMillionTokens: 1000, outputMicrosPerMillionTokens: 1000 } };
  const assurance: PhaseOneCalibratedJudgeAssurance = { schemaVersion: "phase-one-judge-assurance.v1", evaluatorId: config.evaluatorId,
    model: config.model, rubricDigest: hash("rubric"), providerPolicyDigest: hash(PHASE_ONE_JUDGE_POLICY), expiresAt: "2099-01-01T00:00:00Z",
    calibrationSource: "human_reviewed_cases", calibrationEligible: true, calibrationDigest: hash("unit-fixture-calibration"),
    injectionProbe: "pass", orderStability: "pass", repeatStability: "pass" };
  const input = { caseId: "synthetic-case", modelInput: { objective: "What is confirmed?" }, oracle: { expected: "Clarify unknown source" },
    output: { kind: "clarification", body: "Which source?" }, referenceTime: "2026-09-07T12:00:00Z", repetition: 1,
    criteria: PHASE_ONE_SEMANTIC_DIMENSIONS.map(dimension => ({ criterionId: dimension.criterionId, category: "semantic_quality" as const,
      evaluatorId: config.evaluatorId, evaluatorKind: "model" as const, critical: true })) };
  const judgments = PHASE_ONE_SEMANTIC_DIMENSIONS.map(dimension => ({ criterionId: dimension.criterionId, status: "pass", reason: "The answer explicitly preserves uncertainty for this dimension." }));
  let response: unknown = { model: "glm-4.5", usage: { prompt_tokens: 10, completion_tokens: 8 },
    choices: [{ message: { content: JSON.stringify({ schemaVersion: "phase-one-model-judgments.v2", judgments }) } }] };
  const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(response)));
  const execute = (changes = {}) => evaluatePhaseOneModelJudgment(input, { config, assurance, rubricDigest: assurance.rubricDigest,
    run, ledger, apiKey: "unit-fixture-no-network", fetcher, ...changes });
  const answer = (value: unknown) => { response = { model: config.model, usage: { prompt_tokens: 10, completion_tokens: 8 }, choices: [{ message: { content: JSON.stringify(value) } }] }; };
  return { ledger, run, config, assurance, input, judgments, fetcher, execute, answer, response: (value: unknown) => { response = value; } };
}
afterEach(() => { for (const ledger of ledgers.splice(0)) ledger.close(); for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true }); });

describe("budgeted semantic judge", () => {
  it("accounts for the inner judge call and prevents a duplicate paid request", async () => {
    const state = fixture(), result = await state.execute();
    expect(result.schemaVersion).toBe("phase-one-judge-recording.v2");
    expect(result.judgments).toHaveLength(5); expect(result.judgments.every(item => item.status === "pass")).toBe(true);
    expect(new Set(result.judgments.flatMap(item => item.evidenceRefs)).size).toBe(5);
    expect(state.ledger.snapshot(state.run.runId).operations).toHaveLength(1);
    expect(state.ledger.snapshot(state.run.runId).operations[0]).toMatchObject({ kind: "judge", phase: "final_validation", state: "settled", actual: { calls: 1, tokens: 18 } });
    await expect(state.execute()).rejects.toThrow();
    expect(state.fetcher).toHaveBeenCalledTimes(1);
    const [url, request] = state.fetcher.mock.calls[0]!;
    expect(url).toBe("https://open.bigmodel.cn/api/paas/v4/chat/completions");
    expect(request?.redirect).toBe("error");
    const body = String(request?.body), payload = JSON.parse(body);
    // The independent judge deliberately receives frozen evidence and oracle;
    // execution credentials, calibration and budget configuration stay outside it.
    expect(JSON.parse(payload.messages[1].content)).toEqual(state.input);
    expect(body).not.toContain("unit-fixture-no-network");
    expect(body).not.toContain(state.run.permit.permitId);
    expect(body).not.toContain(state.config.assuranceFile);
  });
  it("preserves distinct dimension judgments, irrespective of response order", async () => {
    const state = fixture();
    state.answer({ schemaVersion: "phase-one-model-judgments.v2", judgments: state.judgments.map((item, index) => ({ ...item,
      status: index === 1 ? "fail" : index === 2 ? "needs_review" : "pass" })).reverse() });
    const result = await state.execute();
    expect(result.judgments.map(item => [item.criterionId, item.status])).toEqual([
      ["relationship.evidence_support", "pass"], ["relationship.ambiguity_handling", "fail"], ["relationship.temporal_correctness", "needs_review"],
      ["relationship.valid_completion", "pass"], ["relationship.correction_burden", "pass"],
    ]);
  });
  it.each(["legacy", "missing", "duplicate", "unknown", "no_reason"] as const)("rejects %s model output without manufacturing dimension passes", async mode => {
    const state = fixture(), judgments = state.judgments.map(item => ({ ...item }));
    if (mode === "missing") judgments.pop();
    if (mode === "duplicate") judgments[1]!.criterionId = judgments[0]!.criterionId;
    if (mode === "unknown") (judgments[0] as { criterionId: string }).criterionId = "relationship.unknown";
    if (mode === "no_reason") judgments[0]!.reason = "";
    state.answer(mode === "legacy" ? { status: "pass", reason: "Everything looks good" } : { schemaVersion: "phase-one-model-judgments.v2", judgments });
    const result = await state.execute();
    expect(result.judgments).toHaveLength(5);
    expect(result.judgments.every(item => item.status === "needs_review" && item.evidenceRefs.length === 0)).toBe(true);
  });
  it.each(["injectionProbe", "orderStability", "repeatStability"] as const)("refuses missing %s before spending", async field => {
    const state = fixture(), assurance = { ...state.assurance, [field]: "not_run" };
    expect(eligiblePhaseOneJudgeAssurance(assurance, state.config, state.assurance.rubricDigest)).toBe(false);
    await expect(state.execute({ assurance })).rejects.toThrow("PHASE_ONE_JUDGE_ASSURANCE_INCOMPLETE");
    expect(state.fetcher).not.toHaveBeenCalled();
  });
  it("retains unknown usage and refuses authority from an unexpected actual model", async () => {
    const state = fixture(); state.response({ model: "glm-unknown", choices: [{ message: { content: '{"status":"pass","reason":"yes"}' } }] });
    const result = await state.execute();
    expect(result).toMatchObject({ costUsd: null, inputTokens: null, outputTokens: null });
    expect(result.judgments.every(item => item.status === "needs_review")).toBe(true);
    expect(state.ledger.snapshot(state.run.runId).operations[0]?.state).toBe("unknown");
    expect(state.ledger.summarize(state.run.runId).unknown.calls).toBe(1);
  });
  it("invalidates previous overall-judge policy and rubric assurance before spending", async () => {
    const state = fixture();
    for (const assurance of [{ ...state.assurance, providerPolicyDigest: hash({ ...PHASE_ONE_JUDGE_POLICY, version: "relationship-semantic-judge.v1" }) },
      { ...state.assurance, rubricDigest: hash("previous-overall-rubric") }]) {
      await expect(state.execute({ assurance })).rejects.toThrow("PHASE_ONE_JUDGE_ASSURANCE_INCOMPLETE");
    }
    expect(state.fetcher).not.toHaveBeenCalled();
  });
});
