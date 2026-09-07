import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { digestCanonicalJson } from "@talent-signal/evaluation";
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
    output: { kind: "clarification", body: "Which source?" }, repetition: 1, criteria: [] };
  let response: unknown = { model: "glm-4.5", usage: { prompt_tokens: 10, completion_tokens: 8 },
    choices: [{ message: { content: JSON.stringify({ status: "pass", reason: "The answer explicitly asks for the missing source." }) } }] };
  const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(response)));
  const execute = (changes = {}) => evaluatePhaseOneModelJudgment(input, { config, assurance, rubricDigest: assurance.rubricDigest,
    run, ledger, apiKey: "unit-fixture-no-network", fetcher, ...changes });
  return { ledger, run, config, assurance, input, fetcher, execute, response: (value: unknown) => { response = value; } };
}
afterEach(() => { for (const ledger of ledgers.splice(0)) ledger.close(); for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true }); });

describe("budgeted semantic judge", () => {
  it("accounts for the inner judge call and prevents a duplicate paid request", async () => {
    const state = fixture(), result = await state.execute();
    expect(result.judgment.status).toBe("pass");
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
  it.each(["injectionProbe", "orderStability", "repeatStability"] as const)("refuses missing %s before spending", async field => {
    const state = fixture(), assurance = { ...state.assurance, [field]: "not_run" };
    expect(eligiblePhaseOneJudgeAssurance(assurance, state.config, state.assurance.rubricDigest)).toBe(false);
    await expect(state.execute({ assurance })).rejects.toThrow("PHASE_ONE_JUDGE_ASSURANCE_INCOMPLETE");
    expect(state.fetcher).not.toHaveBeenCalled();
  });
  it("retains unknown usage and refuses authority from an unexpected actual model", async () => {
    const state = fixture(); state.response({ model: "glm-unknown", choices: [{ message: { content: '{"status":"pass","reason":"yes"}' } }] });
    const result = await state.execute();
    expect(result).toMatchObject({ costUsd: null, inputTokens: null, outputTokens: null, judgment: { status: "needs_review" } });
    expect(state.ledger.snapshot(state.run.runId).operations[0]?.state).toBe("unknown");
    expect(state.ledger.summarize(state.run.runId).unknown.calls).toBe(1);
  });
});
