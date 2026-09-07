import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { digestCanonicalJson, type PhaseOneProductRequest } from "@talent-signal/evaluation";
import type { LabRegressionExport } from "@talent-signal/contracts";
import { assertGlobalRelationshipTaskSelection, loadedRelationshipTaskConfiguration, loadedRelationshipTaskPrompt, renderRelationshipTaskSelectionModule,
  RuntimeObservationOutbox, RuntimeObserver, type RuntimeObservation, type RuntimeObservationPolicy } from "@talent-signal/agent";
import { FileOptimizationBudgetLedger, type OptimizationBudgetPermit } from "./budget.js";
import { OPTIMIZATION_SEARCH_EVALUATOR, readOptimizationBudgetController, runOptimizationControllerCommand, type OptimizationSearchInput } from "./controller.js";
import { readControllerJson, writeControllerArtifact } from "./controllerFiles.js";
import { feedbackBindingFromBundle, optimizationDemonstrationFromFeedback } from "./feedbackSource.js";
import { ZhipuChatAnswerProvider } from "@talent-signal/agent/chat-answer-provider";
import { replayOptimizerSearch, runOptimizerSearch } from "./optimizer.js";
import { BASELINE_OPTIMIZATION_CANDIDATE, OPTIMIZER_VERSION, createOptimizationProductTaskAdapter, optimizationConfiguration, optimizationPrompt,
  replayOptimizationProductTask, type ProductTaskRecording } from "./productTask.js";

const directories: string[] = [];
const maintainers: Array<{ directory: string; abort: AbortController; work: Promise<unknown> }> = [];
const model = "glm-4.5-flash";
function fixture(withPermit = true) {
  const directory = mkdtempSync(join(tmpdir(), "get11-controller-")); directories.push(directory);
  const search: OptimizationSearchInput = { schemaVersion: "optimization-search-input.v1", baseline: BASELINE_OPTIMIZATION_CANDIDATE,
    examples: [], maximumTrials: 3, repetitions: 2, timeoutMs: 5000,
    cases: [{ caseId: "synthetic-boundary", sourcePartition: "dev", purpose: "development", referenceTime: "2026-09-07T00:00:00Z",
      modelInput: { schemaVersion: "optimization-relationship-input.v1", dataClass: "synthetic", objective: "What do we know?", context_blocks: [{
        block_id: "block-1", block_key: "evidence", type: "evidence", status: "confirmed", headline: "One fact", summary: "Available after Monday.",
        items: [], evidence_fragment_ids: ["evidence-1"] }], allowed_citation_ids: ["evidence-1"] },
      oracle: { allowedKinds: ["answer"], requiredCitationIds: ["evidence-1"] } }] };
  const bindings = { baselineDigest: digestCanonicalJson(optimizationConfiguration(model, search.baseline)), datasetDigest: digestCanonicalJson(search),
    evaluatorVersion: OPTIMIZATION_SEARCH_EVALUATOR, optimizerVersion: OPTIMIZER_VERSION };
  const permit: OptimizationBudgetPermit = { permitId: "permit-1", budgetScopeId: "shared-billing", status: "active", currency: "USD",
    issuedAt: new Date(Date.now() - 10000).toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(),
    runLimits: { amountMicros: 10000000, calls: 30, tokens: 2000000, elapsedMs: 600000, candidateCount: 3, concurrency: 2 },
    monthlyLimits: { amountMicros: 10000000, calls: 30, tokens: 2000000, elapsedMs: 600000, candidateCount: 3, concurrency: 2 },
    finalValidationReserve: { amountMicros: 1000000, calls: 2, tokens: 100000, elapsedMs: 60000, candidateCount: 0 } };
  const configuration = { schemaVersion: "optimization-controller.v1", ledgerFile: "budget.sqlite", bindingsFile: "bindings.json", permitFile: withPermit ? "permit.json" : null,
    model, pricing: { currency: "USD", inputMicrosPerMillionTokens: 1000000, outputMicrosPerMillionTokens: 1000000 }, searchFile: "search.json" };
  const write = (name: string, value: unknown) => writeFileSync(join(directory, name), JSON.stringify(value));
  write("controller.json", configuration); write("search.json", search); write("bindings.json", bindings); write("permit.json", permit);
  const command = (name: string, options: Parameters<typeof runOptimizationControllerCommand>[2] = {}, runId = "run-1") => runOptimizationControllerCommand([name, "--run-id", runId], directory, options);
  return { directory, search, bindings, permit, configuration, write, command };
}
function providerReply(init?: RequestInit, options: { usage?: boolean; malicious?: boolean } = {}) {
  return Response.json({ model, id: "fixture-request", ...(options.usage === false ? {} : { usage: { prompt_tokens: 20, completion_tokens: 10 } }),
    choices: [{ message: { content: JSON.stringify({ kind: "answer", title: "Known", body: "Available after Monday.", citation_ids: options.malicious ? ["unowned"] : ["evidence-1"] }) } }] });
}
function feedbackBundle(): LabRegressionExport {
  const f = fixture(), uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const now = new Date().toISOString(), expires = new Date(Date.now() + 3600000).toISOString();
  const { schemaVersion: _, dataClass: __, ...rawInput } = f.search.cases[0]!.modelInput;
  const input = { ...rawInput, objective: "PRIVATE-EXECUTION-INPUT", reference_time: now };
  const hash = (value: unknown) => digestCanonicalJson(value).slice(7);
  const sample = { task: "relationship_text" as const, id: "feedback-source", title: "Private feedback", revision: hash(input), partition: "development" as const,
    input_json: JSON.stringify(input), input_hash: hash(input), expected: "EXPECTED-PROPOSAL-ONLY" };
  const snapshot: LabRegressionExport["snapshot"] = { schema_version: "lab-regression.v1", data_class: "private_business", task: "relationship_text",
    feedback_source: { feedback_id: uuid(3), feedback_revision: 1, execution_id: uuid(4), original_task_id: uuid(5), original_output_hash: hash("old-answer"), expectation_authority: "proposal", execution_authority: "none" },
    source_job_id: uuid(5), source_definition_hash: hash(input), source_attempt: { id: uuid(4), ordinal: 0, case_id: sample.id, configuration_index: 0, repetition: 1,
      status: "completed", started_at: now, finished_at: now, requested_model: model, actual_model: model, prompt_revision: "original", actual_prompt_revision: "original",
      provider_request_id: "fixture", duration_ms: 1, input_tokens: 1, output_tokens: 1, title: "Known", answer: "Original answer", citation_ids: ["evidence-1"], error_code: null, checks: [] },
    case: sample, configurations: [{ model, prompt_preset: "baseline", prompt_revision: "original" }], reference_time: now, backend_revision: "fixture", instrument_revision: "feedback.v1",
    failure_categories: ["unsupported_claim"], expected_behavior: "EXPECTED-PROPOSAL-ONLY", review_note: "Proposal awaiting adjudication", reviewer_id: uuid(6), reviewed_at: now };
  return { schema_version: "lab-regression-bundle.v1", execution_authority: "none", id: uuid(2), content_hash: hash(snapshot), snapshot, created_at: now, expires_at: expires };
}
async function maintain(f: ReturnType<typeof fixture>, sources: Parameters<typeof runOptimizationControllerCommand>[2]) {
  if (!maintainers.some(task => task.directory === f.directory)) {
    const abort = new AbortController();
    const work = f.command("maintain", { ...sources, signal: abort.signal });
    maintainers.push({ directory: f.directory, abort, work });
  }
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const beat = readControllerJson(f.directory, "lifecycle.json") as { state: string; datasetDigest: string };
      if (beat.state === "active" && beat.datasetDigest === digestCanonicalJson(readControllerJson(f.directory, "search.json"))) return;
    } catch { /* Await first sweep. */ }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("maintenance did not become active");
}
async function stopMaintainer(f: ReturnType<typeof fixture>) {
  const index = maintainers.findIndex(task => task.directory === f.directory);
  const task = index < 0 ? undefined : maintainers.splice(index, 1)[0];
  if (task) { task.abort.abort(); await task.work; }
}
afterEach(async () => {
  for (const task of maintainers.splice(0)) { task.abort.abort(); await task.work; }
  vi.unstubAllGlobals(); for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("optimization controller", () => {
  it("imports exact authenticated feedback input without promoting expectation prose, then retracts every derived private artifact when withdrawn", async () => {
    const f = fixture(), bundle = feedbackBundle(); let withdrawn = false;
    f.write("controller.json", { ...f.configuration, sourceBackendURL: "http://127.0.0.1:4329" });
    const sourceFetcher = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toBe("http://127.0.0.1:4329/v1/lab/regressions/" + bundle.id + "/export");
      expect(init?.headers).toEqual({ authorization: "Bearer scoped-backend-token" }); expect(init?.redirect).toBe("error");
      return withdrawn ? new Response(null, { status: 410 }) : Response.json(bundle);
    });
    const sources = { backendToken: "scoped-backend-token", sourceFetcher };
    await maintain(f, sources);
    const imported = await runOptimizationControllerCommand(["import-feedback", "--run-id", "run-1", "--regression-id", bundle.id], f.directory, sources);
    expect(imported.status).toBe("imported");
    const search = readControllerJson(f.directory, "search.json") as OptimizationSearchInput;
    expect(search.feedbackProposals?.[0]).toMatchObject({ expectationAuthority: "proposal", text: "EXPECTED-PROPOSAL-ONLY" });
    expect(search.cases[1]!.modelInput.objective).toBe("PRIVATE-EXECUTION-INPUT");
    expect(JSON.stringify(search.cases[1]!.oracle)).not.toContain("EXPECTED-PROPOSAL-ONLY");
    const modelFetcher = vi.fn<typeof fetch>(async (_url, init) => { expect(String(init?.body)).not.toContain("EXPECTED-PROPOSAL-ONLY"); return providerReply(init); });
    await f.command("start", sources); await maintain(f, sources); await f.command("run", { ...sources, offlineFetcher: modelFetcher });
    expect(modelFetcher).toHaveBeenCalledTimes(12);
    withdrawn = true;
    await expect(f.command("replay", sources)).rejects.toThrow("READBACK_410");
    expect(readdirSync(join(f.directory, "runs"))).toHaveLength(0);
    expect(readFileSync(join(f.directory, "search.json"), "utf8")).not.toContain("PRIVATE-EXECUTION-INPUT");
    expect((await f.command("status")).status).toBe("tombstoned");
  });
  it("rechecks feedback after a paid response and deletes it before recording if the source changed in flight", async () => {
    const f = fixture(), bundle = feedbackBundle(); let withdrawn = false;
    f.write("controller.json", { ...f.configuration, sourceBackendURL: "http://127.0.0.1:4329" });
    const sources = { backendToken: "scoped", sourceFetcher: vi.fn<typeof fetch>(async () => withdrawn ? new Response(null, { status: 404 }) : Response.json(bundle)) };
    await maintain(f, sources);
    await runOptimizationControllerCommand(["import-feedback", "--run-id", "run-1", "--regression-id", bundle.id], f.directory, sources);
    await f.command("start", sources);
    await maintain(f, sources);
    const network = vi.fn<typeof fetch>(async (_url, init) => { withdrawn = true; return providerReply(init); }); vi.stubGlobal("fetch", network);
    const result = await f.command("run", { ...sources, apiKey: "fixture-key" });
    expect(result.status).toBe("tombstoned"); expect(network).toHaveBeenCalledTimes(1);
    expect(readdirSync(join(f.directory, "runs"))).toHaveLength(0);
    expect(readFileSync(join(f.directory, "search.json"), "utf8")).not.toContain("EXPECTED-PROPOSAL-ONLY");
    expect((await f.command("status")).details).toMatchObject({ spent: { calls: 1 } });
  });
  it("keeps private copies on a temporary backend outage and requires a live maintenance owner before dispatch", async () => {
    const f = fixture(), bundle = feedbackBundle(); let outage = false;
    f.write("controller.json", { ...f.configuration, sourceBackendURL: "http://127.0.0.1:4329" });
    const sources = { backendToken: "scoped", sourceFetcher: vi.fn<typeof fetch>(async () => outage ? new Response(null, { status: 503 }) : Response.json(bundle)) };
    await maintain(f, sources);
    await runOptimizationControllerCommand(["import-feedback", "--run-id", "run-1", "--regression-id", bundle.id], f.directory, sources);
    await f.command("start", sources);
    await stopMaintainer(f);
    const modelFetcher = vi.fn<typeof fetch>(async (_url, init) => providerReply(init));
    await f.command("run", { ...sources, offlineFetcher: modelFetcher });
    expect(modelFetcher).not.toHaveBeenCalled();
    expect(readFileSync(join(f.directory, "search.json"), "utf8")).toContain("PRIVATE-EXECUTION-INPUT");
    outage = true;
    await expect(f.command("resume", sources)).rejects.toThrow("READBACK_503");
    expect(readFileSync(join(f.directory, "search.json"), "utf8")).toContain("PRIVATE-EXECUTION-INPUT");
    expect((await f.command("status")).status).toBe("checkpointed");
    outage = false; await maintain(f, sources); await f.command("resume", sources);
    await f.command("run", { ...sources, offlineFetcher: modelFetcher });
    expect(modelFetcher).toHaveBeenCalledTimes(12);
  });
  it("sweeps idle expired input even while backend is offline and the input/bindings write was interrupted", async () => {
    const f = fixture(), bundle = feedbackBundle();
    f.write("controller.json", { ...f.configuration, sourceBackendURL: "http://127.0.0.1:4329" });
    const sources = { backendToken: "scoped", sourceFetcher: vi.fn<typeof fetch>(async () => Response.json(bundle)) };
    await maintain(f, sources);
    await runOptimizationControllerCommand(["import-feedback", "--run-id", "run-1", "--regression-id", bundle.id], f.directory, sources);
    await f.command("start", sources);
    await stopMaintainer(f);
    const search = readControllerJson(f.directory, "search.json") as OptimizationSearchInput;
    search.feedbackSources![0]!.expiresAt = new Date(Date.now() - 1).toISOString();
    f.write("search.json", search); // Interrupted writer did not update bindings.json.
    const unreachable = vi.fn<typeof fetch>(async () => { throw new Error("offline"); });
    const result = await runOptimizationControllerCommand(["maintain", "--run-id", "lifecycle", "--once"], f.directory, { backendToken: "scoped", sourceFetcher: unreachable });
    expect(result.status).toBe("unavailable");
    expect(unreachable).not.toHaveBeenCalled();
    expect(readFileSync(join(f.directory, "search.json"), "utf8")).not.toContain("PRIVATE-EXECUTION-INPUT");
    expect(readdirSync(join(f.directory, "runs"))).toHaveLength(0);
    expect((await f.command("status")).status).toBe("tombstoned");
  });
  it("binds private demonstrations on synthetic cases to the real source before retaining or retrying observations", async () => {
    const f = fixture(), bundle = feedbackBundle(); let withdrawn = false;
    const demonstration = optimizationDemonstrationFromFeedback(bundle);
    f.search.examples = [{ exampleId: "private-dev", partition: "dev", dataClass: "private_business", demonstration, contentDigest: digestCanonicalJson(demonstration) }];
    f.search.feedbackSources = [feedbackBindingFromBundle(bundle, "private-dev", "example")];
    f.search.maximumTrials = 4; f.permit.runLimits.candidateCount = 4; f.permit.monthlyLimits.candidateCount = 4;
    f.write("permit.json", f.permit); f.write("search.json", f.search);
    f.write("bindings.json", { ...f.bindings, datasetDigest: digestCanonicalJson(f.search) });
    f.write("controller.json", { ...f.configuration, sourceBackendURL: "http://127.0.0.1:4329", observationScope: { workspaceId: "workspace-1", authorizationScope: "optimization" } });
    const policy: RuntimeObservationPolicy = { version: "private_full_content.v1", mode: "private_full_content", endpoint: "http://127.0.0.1:5173/api",
      workspace: "fixture", project: "fixture", source_workspace_ids: ["workspace-1"], authorization_scopes: ["optimization"], retention_days: 1, max_content_bytes: 1000000 };
    const seen: RuntimeObservation[] = [];
    const outbox = new RuntimeObservationOutbox(join(f.directory, "observer"), policy, { retain: async value => { seen.push(value); throw new Error("offline-opik"); }, remove: async () => {} });
    const observer = new RuntimeObserver(outbox);
    const sources = { backendToken: "scoped", sourceFetcher: vi.fn<typeof fetch>(async () => withdrawn ? new Response(null, { status: 410 }) : Response.json(bundle)), observer };
    await f.command("start", sources); await maintain(f, sources);
    await f.command("run", { ...sources, offlineFetcher: async (_url, init) => providerReply(init) });
    await outbox.flush();
    const containingPrivateDemo = seen.filter(value => JSON.stringify(value.spans).includes("PRIVATE-EXECUTION-INPUT"));
    expect(containingPrivateDemo.length).toBeGreaterThan(0);
    expect(containingPrivateDemo.every(value => value.source_refs.kind === "product" && value.source_regression_ids.includes(bundle.id))).toBe(true);
    const privateAttemptsBefore = containingPrivateDemo.length; withdrawn = true;
    await outbox.flush();
    expect(seen.filter(value => JSON.stringify(value.spans).includes("PRIVATE-EXECUTION-INPUT"))).toHaveLength(privateAttemptsBefore);
    await expect(f.command("source-sweep", sources)).rejects.toThrow("READBACK_410");
    expect(readFileSync(join(f.directory, "search.json"), "utf8")).not.toContain("PRIVATE-EXECUTION-INPUT");
    observer.dispose();
  });
  it("blocks paid work without money authorization, and reports no release or semantic authority", async () => {
    const f = fixture(false), network = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", network);
    expect((await f.command("start")).status).toBe("unconfigured");
    expect(await f.command("run", { apiKey: "test-key" })).toMatchObject({ status: "unconfigured", releaseAuthority: "none", semanticQuality: "not_run" });
    expect(network).not.toHaveBeenCalled();
  });
  it("runs Python candidates through actual product serialization with a shared paid ledger, and replays without any requests", async () => {
    const f = fixture(), payloads: string[] = [];
    const network = vi.fn<typeof fetch>(async (_url, init) => { payloads.push(String(init?.body)); return providerReply(init); }); vi.stubGlobal("fetch", network);
    await f.command("start");
    const result = await f.command("run", { apiKey: "test-key" });
    expect(result.status).toBe("checkpointed");
    expect(network).toHaveBeenCalledTimes(6);
    for (const payload of payloads) { expect(payload).not.toContain("requiredCitationIds"); expect(payload).not.toContain("allowedKinds"); }
    const replay = await f.command("replay");
    expect(replay.status).toBe("recorded_replay"); expect(network).toHaveBeenCalledTimes(6);
    const owned = readOptimizationBudgetController(f.directory, "run-1");
    try {
      expect(owned.ledger.summarize("run-1").spent).toMatchObject({ candidateCount: 3, calls: 6, tokens: 180 });
      expect(owned.ledger.summarize("run-1").finalValidationHeld.calls).toBe(2);
    } finally { owned.ledger.close(); }
    await f.command("resume");
    expect((await f.command("run", { apiKey: "test-key" })).status).toBe("recorded_replay");
    expect(network).toHaveBeenCalledTimes(6);
    await f.command("start", {}, "run-2");
    await f.command("run", { apiKey: "test-key" }, "run-2");
    expect(network).toHaveBeenCalledTimes(6); // The month limit is shared across runs.
  });
  it("counts candidate admissions atomically even when calls are free offline plumbing", async () => {
    const f = fixture(); f.permit.runLimits.candidateCount = 1; f.permit.monthlyLimits.candidateCount = 1; f.write("permit.json", f.permit);
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => providerReply(init));
    await f.command("start"); await f.command("run", { offlineFetcher: fetcher });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const owned = readOptimizationBudgetController(f.directory, "run-1");
    try { expect(owned.ledger.summarize("run-1").spent.candidateCount).toBe(1); } finally { owned.ledger.close(); }
    await f.command("resume"); await f.command("run", { offlineFetcher: fetcher });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("preserves issued unknown spend across restart and refuses a second paid attempt", async () => {
    const f = fixture(); const network = vi.fn<typeof fetch>(async () => { throw new Error("network-lost-after-send"); }); vi.stubGlobal("fetch", network);
    await f.command("start"); await f.command("run", { apiKey: "test-key" });
    expect(network).toHaveBeenCalledTimes(1);
    const owned = readOptimizationBudgetController(f.directory, "run-1");
    try { expect(owned.ledger.summarize("run-1").unknown.calls).toBe(1); } finally { owned.ledger.close(); }
    await f.command("resume"); await f.command("run", { apiKey: "test-key" });
    expect(network).toHaveBeenCalledTimes(1);
  });
  it("rejects modified inputs, heldout cases, path overrides and symlinked controller inputs", async () => {
    const f = fixture(); await f.command("start"); f.search.cases[0]!.modelInput.objective = "Changed"; f.write("search.json", f.search);
    await expect(f.command("run", { apiKey: "test-key" })).rejects.toThrow("FROZEN_INPUT_MISMATCH");
    f.search.cases[0]!.sourcePartition = "held_out" as "dev"; f.write("search.json", f.search);
    await expect(f.command("run", { apiKey: "test-key" })).rejects.toThrow("DEVELOPMENT_CASE_REQUIRED");
    await expect(runOptimizationControllerCommand(["run", "--run-id", "../other"], f.directory)).rejects.toThrow("COMMAND_INVALID");
    symlinkSync(join(f.directory, "search.json"), join(f.directory, "alias.json"));
    expect(() => readControllerJson(f.directory, "alias.json")).toThrow();
  });
  it("pins controller pricing across resume and serializes concurrent executors without blocking stop", async () => {
    const f = fixture(); await f.command("start");
    let entered!: () => void;
    const called = new Promise<void>(resolve => { entered = resolve; });
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => { entered(); return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("cancelled")), { once: true })); });
    const running = f.command("run", { offlineFetcher: fetcher }); await called;
    await expect(f.command("run", { offlineFetcher: fetcher })).rejects.toThrow("run_controller_active");
    await f.command("stop"); await running;
    expect(fetcher).toHaveBeenCalledTimes(1);
    f.configuration.pricing.inputMicrosPerMillionTokens = 1; f.write("controller.json", f.configuration);
    await expect(f.command("resume")).rejects.toThrow("CONTROLLER_BINDING_CHANGED");
  });
  it("supports stop/resume/revoke and lets a tombstone beat late artifact writes", async () => {
    const f = fixture(); await f.command("start"); expect((await f.command("stop")).status).toBe("checkpointed");
    expect((await f.command("resume")).status).toBe("running");
    await f.command("run", { offlineFetcher: async (_url, init) => providerReply(init) });
    expect(readdirSync(join(f.directory, "runs"))).toHaveLength(1);
    await f.command("tombstone"); expect(readdirSync(join(f.directory, "runs"))).toHaveLength(0);
    const owned = readOptimizationBudgetController(f.directory, "run-1");
    try { expect(() => owned.ledger.withRunArtifactWrite("run-1", () => { throw new Error("must not execute"); })).toThrow("run_tombstoned"); }
    finally { owned.ledger.close(); }
    expect((await f.command("run")).status).toBe("tombstoned");
    const other = fixture(); await other.command("start"); await other.command("revoke");
    await expect(other.command("resume")).rejects.toThrow("permit_revoked");
  });
  it("deletes active run artifacts and rejects output arriving after the tombstone", async () => {
    const f = fixture(); await f.command("start");
    let entered!: () => void, finish!: (response: Response) => void;
    const called = new Promise<void>(resolve => { entered = resolve; });
    const fetcher: typeof fetch = async () => { entered(); return new Promise<Response>(resolve => { finish = resolve; }); };
    const running = f.command("run", { offlineFetcher: fetcher }); await called;
    await f.command("tombstone"); finish(providerReply()); await running;
    expect(readdirSync(join(f.directory, "runs"))).toHaveLength(0);
    expect((await f.command("status")).status).toBe("tombstoned");
  });
  it("removes temporary private output when final rename fails", () => {
    const f = fixture(); mkdirSync(join(f.directory, "occupied.json"));
    expect(() => writeControllerArtifact(f.directory, "occupied.json", { privateContent: "scoped synthetic fixture" })).toThrow();
    expect(readdirSync(f.directory).filter(name => name.endsWith(".tmp"))).toEqual([]);
  });
});

describe("shared product configuration and recordings", () => {
  it.each([["glm-4.7", undefined], ["glm-5.2", "low"]] as const)("sends only model-supported reasoning controls for %s and freezes actual reference time", async (pinnedModel, effort) => {
    const f = fixture(), configuration = optimizationConfiguration(pinnedModel, BASELINE_OPTIMIZATION_CANDIDATE);
    const adapter = createOptimizationProductTaskAdapter({ model: pinnedModel, providerKind: "deterministic_fake", fetcher: async (_url, init) => {
      const payload = JSON.parse(String(init?.body));
      expect(payload.reasoning_effort).toBe(effort);
      expect(payload.max_tokens).toBe(1600);
      expect(JSON.parse(payload.messages[1].content).frozen_reference_time).toBe("2026-09-07T00:00:00Z");
      return Response.json({ model: pinnedModel, choices: [{ message: { content: JSON.stringify({ kind: "answer", title: "Known", body: "Known fact", citation_ids: ["evidence-1"] }) } }] });
    } });
    const receipt = await adapter.execute({ caseId: "case", modelInput: f.search.cases[0]!.modelInput as never, referenceTime: "2026-09-07T00:00:00Z",
      configuration, configurationDigest: digestCanonicalJson(configuration), repetition: 1, seed: 0, idempotencyKey: "model-controls" });
    expect(receipt.status).toBe("completed");
  });
  it("uses actual production timeout in the loaded runtime digest", () => {
    const short = new ZhipuChatAnswerProvider({ model, apiKey: "offline", timeoutMs: 1000 });
    expect(short.loadedTaskConfiguration.taskConfigurationDigest).toBe(digestCanonicalJson(optimizationConfiguration(model, BASELINE_OPTIMIZATION_CANDIDATE, [], 1000)));
    expect(short.loadedTaskConfiguration.taskConfigurationDigest).not.toBe(loadedRelationshipTaskConfiguration(model).taskConfigurationDigest);
    const standard = new ZhipuChatAnswerProvider({ model, apiKey: "offline" });
    expect(standard.loadedTaskConfiguration.taskConfigurationDigest).toBe(loadedRelationshipTaskConfiguration(model).taskConfigurationDigest);
  });
  it("reports exactly the bundled task configuration and generates reviewable candidate source", () => {
    expect(loadedRelationshipTaskConfiguration(model)).toEqual({ configuration: optimizationConfiguration(model, BASELINE_OPTIMIZATION_CANDIDATE),
      taskConfigurationDigest: digestCanonicalJson(optimizationConfiguration(model, BASELINE_OPTIMIZATION_CANDIDATE)) });
    expect(loadedRelationshipTaskPrompt().text).toBe(optimizationPrompt(BASELINE_OPTIMIZATION_CANDIDATE));
    expect(renderRelationshipTaskSelectionModule({ ...BASELINE_OPTIMIZATION_CANDIDATE, taskFragmentId: "concise" })).toContain('"taskFragmentId": "concise"');
    expect(() => optimizationConfiguration(model, { ...BASELINE_OPTIMIZATION_CANDIDATE, model: "forbidden" } as never)).toThrow("FORBIDDEN_MUTATION");
  });
  it("admits private examples to the scoped evaluation but rejects globally bundled private demonstration content", () => {
    const demo = "Private account context";
    const examples = [{ exampleId: "private-dev", partition: "dev" as const, dataClass: "private_business" as const, demonstration: demo, contentDigest: digestCanonicalJson(demo) }];
    const candidate = { ...BASELINE_OPTIMIZATION_CANDIDATE, exampleIds: ["private-dev"] };
    expect(optimizationPrompt(candidate, examples)).toContain(demo);
    expect(() => renderRelationshipTaskSelectionModule(candidate, examples)).toThrow("PRIVATE_DEMONSTRATION_GLOBAL_RELEASE_FORBIDDEN");
    expect(() => assertGlobalRelationshipTaskSelection(candidate, examples)).toThrow("PRIVATE_DEMONSTRATION_GLOBAL_RELEASE_FORBIDDEN");
    expect(renderRelationshipTaskSelectionModule(BASELINE_OPTIMIZATION_CANDIDATE, examples)).not.toContain(demo);
  });
  it("detects wrong loaded configuration and tampered immutable recordings without dispatch", async () => {
    const f = fixture(), configuration = optimizationConfiguration(model, BASELINE_OPTIMIZATION_CANDIDATE);
    const request: PhaseOneProductRequest = { caseId: "case-1", modelInput: f.search.cases[0]!.modelInput as never, referenceTime: "2026-09-07T00:00:00Z",
      configuration, configurationDigest: digestCanonicalJson(configuration), repetition: 1, seed: 0, idempotencyKey: "first" };
    let recording: ProductTaskRecording | undefined;
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => providerReply(init));
    const adapter = createOptimizationProductTaskAdapter({ model, providerKind: "deterministic_fake", fetcher, onRecording: value => { recording = value; } });
    const receipt = await adapter.execute(request);
    expect(receipt.status).toBe("completed"); expect(replayOptimizationProductTask(recording!, request)).toEqual(receipt);
    expect(() => replayOptimizationProductTask({ ...recording!, receipt: { ...receipt, status: "failed" } }, request)).toThrow("RECORDING_MISMATCH");
    await expect(adapter.execute({ ...request, configurationDigest: `sha256:${"0".repeat(64)}` })).rejects.toThrow("CONFIGURATION_MISMATCH");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("keeps baseline on no improvement and resumes only the missing Python trial prefix", async () => {
    const f = fixture(), evaluate = vi.fn(async () => ({ score: 1, hardGate: true, receiptDigests: [digestCanonicalJson("receipt")] }));
    const options = { baseline: f.search.baseline, examples: [], bindings: f.bindings, maximumTrials: 3, evaluate };
    const report = await runOptimizerSearch(options); expect(report.improved).toBe(false); expect(report.best).toEqual(f.search.baseline);
    expect(replayOptimizerSearch(report)).toEqual(report); expect(evaluate).toHaveBeenCalledTimes(3);
    await runOptimizerSearch({ ...options, resume: report }); expect(evaluate).toHaveBeenCalledTimes(3);
    const { reportDigest: _, ...payload } = report; const changed = { ...payload, best: { ...report.best, taskFragmentId: "concise" as const } };
    expect(() => replayOptimizerSearch({ ...changed, reportDigest: digestCanonicalJson(changed) })).toThrow("SELECTION_MISMATCH");
  });
});
