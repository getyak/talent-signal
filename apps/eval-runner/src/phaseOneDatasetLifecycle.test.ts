import { generateKeyPairSync } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { digestCanonicalJson, type PhaseOneCase } from "@talent-signal/evaluation";
import { runPhaseOneCommand, sweepPhaseOneControllerSources } from "./phaseOneCommand.js";
import { readOwnedPhaseOneDataset, runPhaseOneDatasetLifecycleCommand, type PhaseOneDatasetRequest } from "./phaseOneDatasetLifecycle.js";
import { OPTIMIZATION_SEARCH_EVALUATOR, readOptimizationBudgetController, readOptimizationSearch, runOptimizationControllerCommand } from "./optimization/controller.js";
import { BASELINE_OPTIMIZATION_CANDIDATE, OPTIMIZER_VERSION, optimizationConfiguration } from "./optimization/productTask.js";
import * as files from "./optimization/controllerFiles.js";

const paths: string[] = [], time = "2026-09-07T00:00:00.000Z";
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "phase-one-lifecycle-")); paths.push(directory); chmodSync(directory, 0o700);
  const write = (name: string, value: unknown) => writeFileSync(join(directory, name), JSON.stringify(value), { mode: 0o600 });
  const read = (name: string) => JSON.parse(readFileSync(join(directory, name), "utf8"));
  const key = generateKeyPairSync("ed25519");
  writeFileSync(join(directory, "private.pem"), key.privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  writeFileSync(join(directory, "public.pem"), key.publicKey.export({ type: "spki", format: "pem" }), { mode: 0o600 });
  const config = { schemaVersion: "phase-one-controller.v1", runId: "run-1", datasetId: "study-1", generatorActorId: "generator-1", executorId: "verifier-1",
    model: "glm-4.5", providerKind: "deterministic_fake", keyId: "key-1", privateKeyFile: "private.pem", publicKeyFile: "public.pem",
    casesFile: "cases.json", exposuresFile: "exposures.json", baselineFile: "baseline.json", candidateFile: "candidate.json", examplesFile: "examples.json",
    reviewsFile: "reviews.json", reviewers: ["human-1"], environmentDigest: digestCanonicalJson("fixture"), budgetDatasetDigest: null,
    semanticEvaluation: { kind: "human" }, sourceBindingsFile: null, sourceBackendURL: null, repetitions: 2, seed: 2, expiresAt: "2099-01-01T00:00:00.000Z" };
  const cases: PhaseOneCase[] = (["dev", "p0", "held_out", "red_team"] as const).map((sourcePartition, index) => ({ caseId: `case-${index}`,
    sourceIds: [`source-${index}`], sourcePartition, purpose: sourcePartition === "dev" ? "development" : "final_verification", referenceTime: time,
    modelInput: { schemaVersion: "optimization-relationship-input.v1", dataClass: "synthetic", objective: `Known evidence ${index}?`, context_blocks: [], allowed_citation_ids: [] },
    oracle: index === 0 ? { allowedKinds: ["clarification"], requiredCitationIds: [] } : { secretGold: `FINAL-GOLD-${index}` }, slices: { ambiguity: "unknown" } }));
  write("phase-one-controller.json", config); write("cases.json", cases); write("exposures.json", []); write("examples.json", []); write("reviews.json", []);
  write("baseline.json", BASELINE_OPTIMIZATION_CANDIDATE); write("candidate.json", { ...BASELINE_OPTIMIZATION_CANDIDATE, taskFragmentId: "concise" });
  const search = { schemaVersion: "optimization-search-input.v1", baseline: BASELINE_OPTIMIZATION_CANDIDATE, examples: [], maximumTrials: 2, repetitions: 2, timeoutMs: 5000,
    cases: cases.slice(0, 1).map(({ caseId, sourcePartition, purpose, referenceTime, modelInput, oracle }) => ({ caseId, sourcePartition, purpose, referenceTime, modelInput, oracle })) };
  write("controller.json", { schemaVersion: "optimization-controller.v1", ledgerFile: "budget.sqlite", permitFile: null, bindingsFile: "bindings.json", model: config.model, pricing: null, searchFile: "search.json" });
  write("search.json", search); write("bindings.json", { baselineDigest: digestCanonicalJson(optimizationConfiguration(config.model, search.baseline)), datasetDigest: digestCanonicalJson(search),
    evaluatorVersion: OPTIMIZATION_SEARCH_EVALUATOR, optimizerVersion: OPTIMIZER_VERSION });
  const request = (extra: Partial<PhaseOneDatasetRequest> = {}): PhaseOneDatasetRequest => ({ expectedStudyDigest: readOwnedPhaseOneDataset(directory).universe.contentDigest, actorId: "owner", ...extra });
  const expose = () => runPhaseOneDatasetLifecycleCommand("expose", directory, request({ eventId: "first-read", exposure: { actorId: "developer", role: "developer", content: "input", observedAt: time, sourceIds: ["source-2"] } }));
  const replace = () => runPhaseOneDatasetLifecycleCommand("retire-replace", directory, request({ eventId: "retire-held", groups: [{ retiredCaseIds: ["case-2"], exposureEventIds: ["first-read"], replacementCaseIds: ["fresh-held"] }],
    replacements: [{ ...cases[2]!, caseId: "fresh-held", sourceIds: ["fresh-source"], modelInput: { ...(cases[2]!.modelInput as object), objective: "Fresh independent input" } }] }));
  const readSearch = () => { const budget = readOptimizationBudgetController(directory, "run-1"); try { return readOptimizationSearch(directory, budget.configuration, budget.run.bindings); } finally { budget.ledger.close(); } };
  return { directory, write, read, cases, config, request, expose, replace, readSearch };
}
afterEach(() => { vi.restoreAllMocks(); for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true }); });

describe("owner-controlled dataset lifecycle process", () => {
  it("replenishes through the real CLI, invalidates old final proof, and imports without final gold or paid calls", async () => {
    const f = fixture(), network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network forbidden"));
    await runPhaseOneCommand(["freeze"], f.directory); await runPhaseOneCommand(["verify"], f.directory);
    expect(existsSync(join(f.directory, "phase-one-verification.json"))).toBe(true);
    const child = (command: string, input?: PhaseOneDatasetRequest) => JSON.parse(execFileSync(process.execPath,
      ["--import", "tsx", "src/phaseOneDatasetCommand.ts", command, "--controller-dir", f.directory], { cwd: process.cwd(),
        env: { PATH: process.env.PATH, NODE_NO_WARNINGS: "1" }, input: input ? JSON.stringify(input) : undefined, encoding: "utf8", timeout: 45000 }));
    expect(child("expose", f.request({ eventId: "first-read", exposure: { actorId: "developer", role: "developer", content: "input", observedAt: time, sourceIds: ["source-2"] } })).status).toBe("exposure_recorded");
    expect(existsSync(join(f.directory, "phase-one-verification.json"))).toBe(false);
    await expect(runPhaseOneCommand(["freeze"], f.directory)).rejects.toThrow("PHASE_ONE_FINAL_DATA_EXPOSED_OR_DEVELOPMENT");
    await f.replace(); expect(child("inspect").cases.find((item: any) => item.caseId === "case-2")).toMatchObject({ sourcePartition: "held_out", purpose: "development" });
    expect(child("import-development", f.request({ caseIds: ["case-2"] }))).toMatchObject({ status: "development_imported", paidCalls: 0 });
    const search = f.readSearch(); expect(search.cases[1]).toMatchObject({ sourcePartition: "held_out", purpose: "development" });
    expect(JSON.stringify(search)).not.toContain("FINAL-GOLD");
    expect(search.cases[1]!.oracle).toEqual({ allowedKinds: ["answer", "clarification", "question_set"], requiredCitationIds: [] });
    expect(await runPhaseOneCommand(["freeze"], f.directory)).toMatchObject({ status: "frozen" });
    expect(f.read("phase-one-frozen.json").dataset.cases.map((item: any) => item.caseId)).toEqual(["case-1", "case-3", "fresh-held"]);
    const before = child("inspect"); child("import-development", f.request({ caseIds: ["case-2"] }));
    expect(child("inspect").events.length).toBe(before.events.length + 1); expect(f.readSearch().cases).toHaveLength(2);
    expect(network).not.toHaveBeenCalled();
  }, 120000);

  it("serializes same-revision writes, leaves one authoritative journal, and fences tombstones", async () => {
    const f = fixture(), request = f.request({ exposure: { actorId: "developer", role: "developer", content: "input", observedAt: time, sourceIds: ["source-2"] } });
    const results = await Promise.allSettled(["one", "two"].map(eventId => runPhaseOneDatasetLifecycleCommand("expose", f.directory, { ...request, eventId })));
    expect(results.filter(item => item.status === "fulfilled")).toHaveLength(1); expect(f.read("cases.json").events).toHaveLength(1);
    expect(readdirSync(f.directory).filter(name => name.endsWith(".tmp"))).toEqual([]);
    const damaged = f.read("cases.json"); damaged.cases[0].modelInput.dataClass = "private_business"; f.write("cases.json", damaged);
    f.write("cases.json.1234.tmp", damaged);
    await runPhaseOneCommand(["tombstone"], f.directory);
    expect(f.read("cases.json").schemaVersion).toBe("phase-one-private-copy-tombstone.v1");
    expect(JSON.stringify(f.read("cases.json"))).not.toContain("Known evidence"); expect(existsSync(join(f.directory, "cases.json.1234.tmp"))).toBe(false);
    await expect(runPhaseOneDatasetLifecycleCommand("expose", f.directory, request)).rejects.toThrow("PHASE_ONE_RUN_TOMBSTONED");
  });

  it("records exposure while an executor is active, rejects replacement during execution, and detects a changed anchor", async () => {
    const f = fixture(); f.write("phase-one-executor.lock", { pid: process.pid });
    await f.expose(); await expect(f.replace()).rejects.toThrow("PHASE_ONE_EXECUTOR_ALREADY_RUNNING");
    f.write("exposures.json", [{ actorId: "judge", role: "judge", content: "input", observedAt: time, sourceIds: ["source-2"] }]);
    expect(() => readOwnedPhaseOneDataset(f.directory)).toThrow("PHASE_ONE_LIFECYCLE_ANCHOR_CHANGED");
  });

  it("fails closed after a crash between primary journal and derived bindings, then explicitly repairs the import", async () => {
    const f = fixture(); await f.expose(); await f.replace();
    const original = files.writeControllerArtifact, injected = vi.spyOn(files, "writeControllerArtifact").mockImplementation((directory, name, value) => {
      if (name === "bindings.json") throw new Error("simulated process interruption"); original(directory, name, value);
    });
    await expect(runPhaseOneDatasetLifecycleCommand("import-development", f.directory, f.request({ caseIds: ["case-2"] }))).rejects.toThrow("simulated process interruption");
    expect(() => f.readSearch()).toThrow("OPTIMIZATION_FROZEN_INPUT_MISMATCH"); injected.mockRestore();
    await runPhaseOneDatasetLifecycleCommand("import-development", f.directory, f.request({ caseIds: ["case-2"] }));
    expect(f.readSearch().cases).toHaveLength(2);
  });

  it("invalidates imported proof on any later exposure and rejects forged private conversions", async () => {
    const f = fixture(); await f.expose(); await f.replace();
    await runPhaseOneDatasetLifecycleCommand("import-development", f.directory, f.request({ caseIds: ["case-2"] }));
    await runPhaseOneDatasetLifecycleCommand("expose", f.directory, f.request({ exposure: { actorId: "developer", role: "developer", content: "input", observedAt: time, sourceIds: ["source-2"] } }));
    expect(() => f.readSearch()).toThrow("PHASE_ONE_RETIREMENT_PROVENANCE_STALE");
    await expect(runOptimizationControllerCommand(["start", "--run-id", "run-1"], f.directory)).rejects.toThrow("PHASE_ONE_RETIREMENT_PROVENANCE_STALE");
    const g = fixture(); g.cases[2]!.modelInput = { ...(g.cases[2]!.modelInput as object), dataClass: "private_business" }; g.write("cases.json", g.cases);
    g.write("phase-one-controller.json", { ...g.config, providerKind: "real_model" });
    await expect(g.expose()).rejects.toThrow("PHASE_ONE_PRIVATE_SOURCE_BINDING_REQUIRED"); expect(Array.isArray(g.read("cases.json"))).toBe(true);
  });

  it.each(["stale", "tombstoned"])("cleans expired legacy private search copies even when retirement authority is %s", async state => {
    const f = fixture(); await f.expose(); await f.replace();
    await runPhaseOneDatasetLifecycleCommand("import-development", f.directory, f.request({ caseIds: ["case-2"] }));
    if (state === "stale") await runPhaseOneDatasetLifecycleCommand("expose", f.directory, f.request({ exposure: { actorId: "developer", role: "developer", content: "input", observedAt: time, sourceIds: ["source-2"] } }));
    else await runPhaseOneCommand(["tombstone"], f.directory);
    const search = f.read("search.json"); search.cases[1].modelInput.dataClass = "private_business";
    search.cases[1].modelInput.objective = "EXPIRED-PRIVATE-RETIRED-INPUT";
    search.feedbackSources = [{ target: "case", targetId: "case-2", regressionId: "10000000-0000-4000-8000-000000000001",
      feedbackId: "10000000-0000-4000-8000-000000000002", executionId: "10000000-0000-4000-8000-000000000003", sessionId: "10000000-0000-4000-8000-000000000004", contentHash: "a".repeat(64),
      feedbackRevision: 1, expiresAt: "2020-01-01T00:00:00Z", expectationAuthority: "proposal" }];
    delete search.feedbackSources[0].sessionId;
    f.write("search.json", search);
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network forbidden"));
    await expect(runOptimizationControllerCommand(["source-sweep", "--run-id", "lifecycle"], f.directory)).rejects.toThrow(state === "tombstoned" ? "PHASE_ONE_RUN_TOMBSTONED" : "OPTIMIZATION_FEEDBACK_SOURCE_UNAVAILABLE");
    expect(f.read("search.json").schemaVersion).toBe("optimization-search-tombstone.v1");
    expect(JSON.stringify(f.read("search.json"))).not.toContain("EXPIRED-PRIVATE"); expect(network).not.toHaveBeenCalled();
  });

  it.each(["file", "database", "during-readback"].flatMap(marker => [[marker, false], [marker, true]] as const))
    ("prioritizes known local withdrawal over native 503 (%s, legacy=%s)", async (marker, legacy) => {
    const f = fixture(); await f.expose(); await f.replace();
    await runPhaseOneDatasetLifecycleCommand("import-development", f.directory, f.request({ caseIds: ["case-2"] }));
    if (marker !== "during-readback") {
      await runPhaseOneCommand(["tombstone"], f.directory);
      if (marker === "database") unlinkSync(join(f.directory, "phase-one-tombstone.json"));
    }
    const search = f.read("search.json"); search.cases[1].modelInput.dataClass = "private_business";
    search.cases[1].modelInput.objective = "KNOWN-WITHDRAWN-PRIVATE-INPUT";
    search.feedbackSources = [{ target: "case", targetId: "case-2", regressionId: "10000000-0000-4000-8000-000000000001",
      feedbackId: "10000000-0000-4000-8000-000000000002", executionId: "10000000-0000-4000-8000-000000000003", sessionId: "10000000-0000-4000-8000-000000000004", contentHash: "a".repeat(64),
      feedbackRevision: 1, expiresAt: "2099-01-01T00:00:00Z", expectationAuthority: "proposal" }];
    if (legacy) delete search.feedbackSources[0].sessionId;
    f.write("search.json", search); f.write("controller.json", { ...f.read("controller.json"), sourceBackendURL: "http://127.0.0.1:4329" });
    const readback = vi.fn<typeof fetch>(async () => {
      if (marker === "during-readback") await runPhaseOneCommand(["tombstone"], f.directory);
      return new Response(null, { status: 503 });
    });
    await expect(runOptimizationControllerCommand(["source-sweep", "--run-id", "lifecycle"], f.directory,
      { backendToken: "fixture-only", sourceFetcher: readback })).rejects.toThrow("PHASE_ONE_RUN_TOMBSTONED");
    expect(readback).toHaveBeenCalledTimes(marker === "during-readback" ? 1 : 0);
    expect(f.read("search.json").schemaVersion).toBe("optimization-search-tombstone.v1");
    expect(JSON.stringify(f.read("search.json"))).not.toContain("KNOWN-WITHDRAWN-PRIVATE");
  });

  it("sweeps a private lifecycle copy on native expiry even if its metadata digest is damaged", async () => {
    const f = fixture(); await f.expose(); await f.replace();
    const doc = f.read("cases.json"); doc.cases.find((item: any) => item.caseId === "case-2").modelInput.dataClass = "private_business"; f.write("cases.json", doc);
    f.write("phase-one-controller.json", { ...f.config, sourceBindingsFile: "sources.json" });
    f.write("sources.json", [{ target: "case", targetId: "case-2", regressionId: "10000000-0000-4000-8000-000000000001",
      feedbackId: "10000000-0000-4000-8000-000000000002", executionId: "10000000-0000-4000-8000-000000000003", sessionId: "10000000-0000-4000-8000-000000000004", contentHash: "a".repeat(64),
      feedbackRevision: 1, expiresAt: "2020-01-01T00:00:00Z", expectationAuthority: "proposal" }]);
    expect(await sweepPhaseOneControllerSources(f.directory)).toEqual({ status: "tombstoned" });
    expect(f.read("cases.json").schemaVersion).toBe("phase-one-private-copy-tombstone.v1");
  });
  it.each([404, 410])("cleans an unexpired legacy final source after authenticated native removal (%s)", async status => {
    const f = fixture();
    const cases = f.read("cases.json"); cases[2].modelInput.dataClass = "private_business";
    cases[2].modelInput.objective = "LEGACY-PRIVATE-REMOVED-SOURCE"; f.write("cases.json", cases);
    f.write("phase-one-controller.json", { ...f.config, sourceBindingsFile: "sources.json", sourceBackendURL: "http://127.0.0.1:4329" });
    f.write("sources.json", [{ target: "case", targetId: "case-2", regressionId: "10000000-0000-4000-8000-000000000001",
      feedbackId: "10000000-0000-4000-8000-000000000002", executionId: "10000000-0000-4000-8000-000000000003", contentHash: "a".repeat(64),
      feedbackRevision: 1, expiresAt: "2099-01-01T00:00:00Z", expectationAuthority: "proposal" }]);
    const readback = vi.fn<typeof fetch>(async () => new Response(null, { status }));
    expect(await sweepPhaseOneControllerSources(f.directory, { backendToken: "fixture-only", sourceFetcher: readback })).toEqual({ status: "tombstoned" });
    expect(readback).toHaveBeenCalledTimes(1);
    expect(f.read("cases.json").schemaVersion).toBe("phase-one-private-copy-tombstone.v1");
    expect(JSON.stringify(f.read("cases.json"))).not.toContain("LEGACY-PRIVATE");
  });
});
