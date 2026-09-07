import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { digestCanonicalJson, freezePhaseOneComparison, freezePhaseOneDataset, runPhaseOnePairedEvaluation,
  type PhaseOneCase, type PhaseOneEvaluator, type PhaseOneJudgment, type PhaseOneProductRequest } from "@talent-signal/evaluation";
import { createOptimizationProductTaskAdapter, optimizationConfiguration, replayOptimizationProductTask,
  type ProductTaskRecording } from "./optimization/productTask.js";
import { createPhaseOneFixtureFetcher } from "./evaluation/phaseOneFixture.js";
import { runPhaseOneCommand } from "./phaseOneCommand.js";

const hash = digestCanonicalJson;
const time = "2026-09-07T00:00:00.000Z";
const behaviors = ["insufficient_evidence", "ambiguous_identity", "historical_conflict", "clearly_answerable", "provider_failure"] as const;
const network = vi.fn(() => { throw new Error("Behavior fixtures must never contact a provider."); });
let directory: string;
let cases: PhaseOneCase[];
beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "phase-one-behavior-"));
  const controller = join(directory, "controller");
  execFileSync(process.execPath, [fileURLToPath(new URL("../../../evals/contracts/create-phase-one-fixture.mjs", import.meta.url)), controller], { encoding: "utf8" });
  cases = JSON.parse(readFileSync(join(controller, "cases.json"), "utf8"));
  expect(JSON.parse(readFileSync(join(controller, "reviews.json"), "utf8"))).toEqual([]);
  vi.stubGlobal("fetch", network);
});
afterEach(() => expect(network).not.toHaveBeenCalled());
afterAll(() => { vi.unstubAllGlobals(); rmSync(directory, { recursive: true, force: true }); });

interface FixtureAnswer { kind: string; title: string; body: string; citation_ids: string[] }
interface WirePayload { model: string; messages: Array<{ role: string; content: string }>; temperature: number; max_tokens: number; tools?: unknown }
interface FixtureResponse { usage?: unknown; choices: Array<{ message: { content: string } }> }

// These finite assertions describe authored synthetic responses. They are not
// semantic evaluation, human decisions, calibration evidence, or release gold.
function matchesFixtureBehavior(item: PhaseOneCase, answer: FixtureAnswer): boolean {
  const input = item.modelInput as { allowed_citation_ids: string[]; context_blocks: Array<{ summary: string }> };
  switch (item.slices.behavior) {
    case "insufficient_evidence": return answer.kind === "clarification" && answer.citation_ids.length === 0
      && answer.body.includes("source") && answer.body.includes("reference time");
    case "ambiguous_identity": return answer.kind === "clarification" && answer.citation_ids.length === 0
      && answer.body.includes("two contacts") && answer.body.includes("do not merge");
    case "historical_conflict": return answer.kind === "answer" && answer.citation_ids.length === 2
      && answer.body.includes("historical") && answer.body.includes("withdrawal supersedes") && answer.body.includes("Do not schedule");
    case "clearly_answerable": return answer.kind === "answer" && answer.citation_ids[0] === input.allowed_citation_ids[0]
      && answer.body === input.context_blocks[0]!.summary;
    default: return false;
  }
}

async function compare(selected: PhaseOneCase[], options: {
  mutate?: (body: FixtureResponse, request: PhaseOneProductRequest) => void;
  omitBehaviorJudgment?: boolean;
  includeBrevity?: boolean;
} = {}) {
  const dataset = freezePhaseOneDataset({ datasetId: "synthetic-behavior-contract", cases: selected, exposures: [] });
  const comparison = freezePhaseOneComparison({ runId: "synthetic-behavior-proof", generatorActorId: "fixture-generator",
    datasetDigest: dataset.contentDigest, rubricDigest: hash("test-only-finite-response-contract"), environmentDigest: hash("offline-transport"),
    baseline: optimizationConfiguration("glm-4.5", { schemaVersion: "optimization-candidate.v1", taskFragmentId: "baseline", exampleIds: [] }),
    candidate: optimizationConfiguration("glm-4.5", { schemaVersion: "optimization-candidate.v1", taskFragmentId: "concise", exampleIds: [] }), repetitions: 2, seed: 7,
    criteria: [{ criterionId: "fixture.expected_behavior", category: "deterministic_boundary", evaluatorId: "fixture-assertions", evaluatorKind: "deterministic", critical: true },
      ...(options.includeBrevity ? [{ criterionId: "fixture.short_title", category: "deterministic_boundary" as const, evaluatorId: "fixture-assertions", evaluatorKind: "deterministic" as const, critical: false }] : []),
      { criterionId: "quality.unreviewed", category: "semantic_quality", evaluatorId: "human-review-store", evaluatorKind: "human", critical: true }],
  });
  const requests: PhaseOneProductRequest[] = [], recordings: ProductTaskRecording[] = [], payloads: WirePayload[] = [];
  const offline = createPhaseOneFixtureFetcher();
  let active: PhaseOneProductRequest;
  const product = createOptimizationProductTaskAdapter({ model: "glm-4.5", providerKind: "deterministic_fake", onRecording: recording => { recordings.push(recording); },
    fetcher: async (url, init) => {
      payloads.push(JSON.parse(String(init?.body)));
      const response = await offline(url, init);
      if (!options.mutate || !response.ok) return response;
      const body = await response.json() as FixtureResponse;
      options.mutate(body, active);
      return new Response(JSON.stringify(body), { status: response.status });
    } });
  const evaluator: PhaseOneEvaluator = { async evaluate(input) {
    const item = selected.find(item => item.caseId === input.caseId)!;
    return input.criteria.flatMap<PhaseOneJudgment>(criterion => {
      if (criterion.criterionId === "quality.unreviewed") return [{ criterionId: criterion.criterionId, status: "needs_review" as const, evidenceRefs: [] }];
      if (criterion.criterionId === "fixture.expected_behavior" && options.omitBehaviorJudgment) return [];
      const output = input.output as unknown as FixtureAnswer;
      const passed = criterion.criterionId === "fixture.short_title" ? output.title.length <= 8 : matchesFixtureBehavior(item, output);
      return [{ criterionId: criterion.criterionId, status: passed ? "pass" as const : "fail" as const, evidenceRefs: [`synthetic-test:${item.caseId}`] }];
    });
  } };
  const report = await runPhaseOnePairedEvaluation({ dataset, comparison, cases: selected, exposures: [],
    executor: { executorId: "fixture-independent-executor", async execute(request) { active = request; requests.push(request); return product.execute(request); } },
    evaluator, judgeAssurances: [], mode: selected.every(item => item.sourcePartition === "dev") ? "development" : "independent_verification",
    createdAt: time, judgmentContextDigest: hash("no-human-decisions-no-calibration") });
  return { report, requests, recordings, payloads, comparison };
}

describe("five synthetic behaviors through the shared production task", () => {
  // Sixty signed recordings plus sixty replays and SQLite/fsync checkpoints
  // need scheduling headroom on shared CI; product deadlines remain unchanged.
  it("runs the generated five-behavior corpus through the controller and replays its failed and completed receipts", async () => {
    const controller = join(directory, "controller");
    expect(await runPhaseOneCommand(["freeze"], controller)).toMatchObject({ status: "frozen" });
    const verified = await runPhaseOneCommand(["verify"], controller);
    expect(verified).toMatchObject({ status: "recorded", liveCalls: 60, replayedCalls: 0, releaseAuthority: "none",
      categories: { execution_integrity: "fail", release_conditions: "not_run" } });
    const journal = JSON.parse(readFileSync(join(controller, "phase-one-executions.json"), "utf8")) as { records: Array<{ recording: ProductTaskRecording }> };
    expect(journal.records.filter(item => item.recording.receipt.status === "completed")).toHaveLength(48);
    expect(journal.records.filter(item => item.recording.receipt.status === "failed")).toHaveLength(12);
    expect(journal.records.every(item => item.recording.receipt.providerKind === "deterministic_fake")).toBe(true);
    expect(await runPhaseOneCommand(["adjudicate"], controller)).toMatchObject({ liveCalls: 0, replayedCalls: 60, releaseAuthority: "none" });
    expect(await runPhaseOneCommand(["inspect"], controller)).toMatchObject({ status: "verified_signature", releaseAuthority: "none" });
  }, 30_000);

  it.each(behaviors)("records the actual %s serializer/parser result for both configurations", async behavior => {
    const item = cases.find(item => item.sourcePartition === "dev" && item.slices.behavior === behavior)!;
    const result = await compare([item]);
    expect(result.recordings).toHaveLength(4);
    for (const recording of result.recordings) {
      const receipt = recording.receipt;
      expect(receipt.providerKind).toBe("deterministic_fake");
      if (behavior === "provider_failure") {
        expect(receipt).toMatchObject({ status: "failed", output: null, inputTokens: null, outputTokens: null, costUsd: null });
      } else {
        expect(receipt.status).toBe("completed");
        expect(matchesFixtureBehavior(item, receipt.output as unknown as FixtureAnswer)).toBe(true);
        expect(receipt.output).not.toHaveProperty("action_proposals");
        expect(receipt.output).toMatchObject({ provider_id: "zhipu-chat-completions", model: "glm-4.5", usage_reported: true });
      }
    }
    if (behavior === "provider_failure") {
      expect(result.report.categories.execution_integrity).toBe("fail");
      expect(result.report.cost.candidate).toMatchObject({ unknown: 2, value: null });
      expect(result.report.attempts.every(item => item.observations.find(item => item.criterionId === "fixture.expected_behavior")?.status === "not_run")).toBe(true);
    } else expect(result.report.categories.semantic_quality).toBe("needs_review");
    expect(result.report.releaseAuthority).toBe("none");
  });

  it("keeps every partition distinct and pairs frozen input, reference time, seed and actual loaded prompts", async () => {
    expect(cases).toHaveLength(20);
    expect(new Set(cases.flatMap(item => item.sourceIds)).size).toBe(20);
    expect(new Set(cases.map(item => hash(item.modelInput))).size).toBe(20);
    for (const partition of ["dev", "p0", "held_out", "red_team"]) {
      expect(cases.filter(item => item.sourcePartition === partition).map(item => item.slices.behavior).sort()).toEqual([...behaviors].sort());
    }
    expect(() => freezePhaseOneDataset({ datasetId: "all-fixtures", cases, exposures: [] })).not.toThrow();
    const selected = cases.filter(item => item.sourcePartition !== "dev");
    const { report, requests, recordings, payloads, comparison } = await compare(selected);
    expect(requests).toHaveLength(60);
    for (const item of selected) for (const repetition of [1, 2]) {
      const pair = requests.filter(request => request.caseId === item.caseId && request.repetition === repetition);
      expect(pair).toHaveLength(2);
      expect(pair[0]!.modelInput).toEqual(pair[1]!.modelInput);
      expect(pair[0]!.referenceTime).toBe(item.referenceTime);
      expect(pair[1]!.referenceTime).toBe(item.referenceTime);
      expect(pair.map(request => request.seed)).toEqual([7 + repetition - 1, 7 + repetition - 1]);
      expect(pair[0]!.idempotencyKey).not.toBe(pair[1]!.idempotencyKey);
      expect(new Set(pair.map(request => request.configurationDigest))).toEqual(new Set([hash(comparison.baseline), hash(comparison.candidate)]));
      expect(payloads[requests.indexOf(pair[0]!)]!.messages[1]!.content).toBe(payloads[requests.indexOf(pair[1]!)]!.messages[1]!.content);
    }
    for (const [index, request] of requests.entries()) {
      const payload = payloads[index]!, recording = recordings[index]!;
      const context = JSON.parse(payload.messages[1]!.content);
      expect(context.frozen_reference_time).toBe(request.referenceTime);
      expect(context.context_blocks).toEqual((request.modelInput as { context_blocks: unknown }).context_blocks);
      expect(payload).toMatchObject({ temperature: 0, max_tokens: 1600, model: "glm-4.5" });
      expect(payload.tools).toBeUndefined();
      expect(recording.actualPromptDigest).toBe(request.configuration.promptContentDigest);
      expect(replayOptimizationProductTask(recording, request)).toEqual(recording.receipt);
    }
    expect(JSON.stringify(payloads)).not.toContain("expectedBehaviorProposal");
    expect(JSON.stringify(payloads)).not.toContain("synthetic_test_only");
    expect(report.paired.unknown).toBeGreaterThan(0);
    expect(report.categories.semantic_quality).not.toBe("pass");
    expect(report.releaseAuthority).toBe("none");
  });

  it("vetoes task avoidance on an answerable case even when noncritical formatting wins improve the average", async () => {
    const selected = cases.filter(item => item.sourcePartition !== "dev" && item.slices.behavior !== "provider_failure");
    const { report, recordings, requests } = await compare(selected, { includeBrevity: true, mutate(body, request) {
      const candidate = (request.configuration.parameters as { taskFragmentId: string }).taskFragmentId === "concise";
      const answer = JSON.parse(body.choices[0]!.message.content) as FixtureAnswer;
      if (candidate) answer.title = "Brief";
      if (candidate && request.caseId === "synthetic-held_out-clearly_answerable") {
        answer.kind = "clarification"; answer.body = "Please provide the evidence and time."; answer.citation_ids = [];
      }
      body.choices[0]!.message.content = JSON.stringify(answer);
    } });
    expect(report.candidate.value!).toBeGreaterThan(report.baseline.value!);
    expect(report.paired.wins).toBeGreaterThan(report.paired.regressions);
    expect(report.paired.regressions).toBe(2);
    expect(report.metrics.criteria.find(item => item.criterionId === "fixture.expected_behavior")?.paired).toMatchObject({ wins: 0, regressions: 2, unknown: 0 });
    expect(report.safetyVeto).toBe(true);
    expect(report.failures.filter(item => item.variant === "candidate")).toEqual([1, 2].map(repetition => ({
      caseId: "synthetic-held_out-clearly_answerable", variant: "candidate", repetition,
      criterionId: "fixture.expected_behavior", reasonCode: "ATOMIC_CRITERION_RECORDED",
    })));
    const avoided = requests.findIndex(request => request.caseId === "synthetic-held_out-clearly_answerable"
      && (request.configuration.parameters as { taskFragmentId: string }).taskFragmentId === "concise");
    expect(recordings[avoided]!.receipt).toMatchObject({ status: "completed", output: { kind: "clarification" } });
    expect(report.releaseAuthority).toBe("none");
  });

  it("keeps absent atomic judgments and unreported usage unknown instead of inventing success or measured zero", async () => {
    const selected = cases.filter(item => item.sourcePartition === "dev" && item.slices.behavior === "clearly_answerable");
    const { report, recordings } = await compare(selected, { omitBehaviorJudgment: true, mutate(body) { delete body.usage; } });
    expect(recordings.every(item => item.receipt.status === "completed" && item.receipt.inputTokens === null && item.receipt.outputTokens === null)).toBe(true);
    expect(report.attempts.every(item => item.inputTokens === null && item.outputTokens === null
      && item.observations.find(item => item.criterionId === "fixture.expected_behavior")?.status === "not_run")).toBe(true);
    expect(report.candidate.unknown).toBe(4);
    expect(report.paired.unknown).toBe(4);
    expect(report.metrics.criteria.find(item => item.criterionId === "fixture.expected_behavior")).toMatchObject({
      candidate: { numerator: 0, denominator: 2, unknown: 2 }, paired: { wins: 0, regressions: 0, ties: 0, unknown: 2, denominator: 2 },
    });
    expect(report.metrics.usage.candidate.inputTokens).toEqual({ numerator: 0, denominator: 2, unknown: 2, value: null });
    expect(report.metrics.usage.candidate.outputTokens).toEqual({ numerator: 0, denominator: 2, unknown: 2, value: null });
    expect(Object.values(report.metrics.usage.judges).every(item => item.denominator === 0 && item.value === null)).toBe(true);
    expect(report.cost.judges).toEqual({ numerator: 0, denominator: 0, unknown: 0, value: null });
    expect(report.categories.semantic_quality).toBe("needs_review");
  });

  it("records an out-of-scope citation as a parser failure without promoting it to a factual answer", async () => {
    const selected = cases.filter(item => item.sourcePartition === "dev" && item.slices.behavior === "clearly_answerable");
    const { report, recordings } = await compare(selected, { mutate(body) {
      const answer = JSON.parse(body.choices[0]!.message.content) as FixtureAnswer;
      answer.citation_ids = ["different-person-private-source"];
      body.choices[0]!.message.content = JSON.stringify(answer);
    } });
    expect(recordings.every(item => item.receipt.status === "failed" && item.receipt.output === null)).toBe(true);
    expect(report.categories.execution_integrity).toBe("fail");
    expect(report.categories.semantic_quality).toBe("not_run");
    expect(report.safetyVeto).toBe(true);
  });
});
