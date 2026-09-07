import { generateKeyPairSync } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { digestCanonicalJson, PHASE_ONE_SEMANTIC_DIMENSIONS, type PhaseOneCase } from "@talent-signal/evaluation";
import { createPhaseOneHttpRuntimeReader, runPhaseOneCommand, sweepPhaseOneControllerSources } from "./phaseOneCommand.js";
import { FileOptimizationBudgetLedger, type OptimizationBudgetPermit } from "./optimization/budget.js";
import { loadedRelationshipTaskConfiguration } from "@talent-signal/agent";
import * as phaseOneCI from "./phaseOneCI.js";

const directories: string[] = [];
const hash = digestCanonicalJson;
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "phase-one-controller-")); directories.push(directory); chmodSync(directory, 0o700);
  const write = (name: string, value: unknown) => writeFileSync(join(directory, name), JSON.stringify(value), { mode: 0o600 });
  const read = (name: string) => JSON.parse(readFileSync(join(directory, name), "utf8"));
  const key = generateKeyPairSync("ed25519");
  writeFileSync(join(directory, "private.pem"), key.privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  writeFileSync(join(directory, "public.pem"), key.publicKey.export({ type: "spki", format: "pem" }), { mode: 0o600 });
  const config = { schemaVersion: "phase-one-controller.v1", runId: "run-1", datasetId: "study-1", generatorActorId: "generator-1", executorId: "verifier-1",
    model: "glm-4.5", providerKind: "deterministic_fake", keyId: "key-1", privateKeyFile: "private.pem", publicKeyFile: "public.pem",
    casesFile: "cases.json", exposuresFile: "exposures.json", baselineFile: "baseline.json", candidateFile: "candidate.json", examplesFile: "examples.json",
    reviewsFile: "reviews.json", reviewers: ["human-1"], environmentDigest: hash("fixture-environment"), budgetDatasetDigest: null, semanticEvaluation: { kind: "human" }, sourceBindingsFile: null, sourceBackendURL: null,
    repetitions: 2, seed: 2, expiresAt: "2099-01-01T00:00:00.000Z" };
  write("phase-one-controller.json", config);
  const cases: PhaseOneCase[] = (["dev", "p0", "held_out", "red_team"] as const).map((sourcePartition, index) => ({
    caseId: `case-${index}`, sourceIds: [`source-${index}`], sourcePartition, purpose: sourcePartition === "dev" ? "development" : "final_verification",
    referenceTime: "2026-09-07T00:00:00.000Z", modelInput: { schemaVersion: "optimization-relationship-input.v1", dataClass: "synthetic",
      objective: `Which known evidence supports case ${index}?`, context_blocks: [], allowed_citation_ids: [] },
    oracle: { expected: "Clarify source and time" }, slices: { ambiguity: "unknown_time" },
  }));
  write("cases.json", cases); write("exposures.json", []); write("examples.json", []); write("reviews.json", []);
  write("baseline.json", { schemaVersion: "optimization-candidate.v1", taskFragmentId: "baseline", exampleIds: [] });
  write("candidate.json", { schemaVersion: "optimization-candidate.v1", taskFragmentId: "concise", exampleIds: [] });
  const command = (name: string) => runPhaseOneCommand([name], directory);
  return { directory, write, read, config, cases, command };
}
function runningBudget(state: ReturnType<typeof fixture>) {
  const bindings = { baselineDigest: hash("baseline"), datasetDigest: hash("dataset"), evaluatorVersion: "1", optimizerVersion: "1" };
  const permit: OptimizationBudgetPermit = {
    permitId: "permit-1", budgetScopeId: "scope-1", status: "active", currency: "USD",
    issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(),
    runLimits: { amountMicros: 1000, calls: 10, tokens: 1000, elapsedMs: 100000, candidateCount: 10, concurrency: 3 },
    monthlyLimits: { amountMicros: 3000, calls: 30, tokens: 3000, elapsedMs: 300000, candidateCount: 30, concurrency: 9 },
    finalValidationReserve: { amountMicros: 100, calls: 1, tokens: 100, elapsedMs: 1000, candidateCount: 0 },
  };
  state.write("phase-one-controller.json", { ...state.config, providerKind: "real_model" });
  state.write("controller.json", { schemaVersion: "optimization-controller.v1", ledgerFile: "budget.sqlite", permitFile: "permit.json",
    bindingsFile: "bindings.json", model: "glm-4.5", pricing: null, searchFile: "search.json" });
  state.write("bindings.json", bindings); state.write("permit.json", permit);
  const path = join(state.directory, "budget.sqlite"), ledger = new FileOptimizationBudgetLedger({ path });
  try { expect(ledger.startRun({ runId: state.config.runId, bindings, permit }).status).toBe("running"); }
  finally { ledger.close(); }
  return () => {
    const reopened = new FileOptimizationBudgetLedger({ path });
    try { return reopened.snapshot(state.config.runId).status; }
    finally { reopened.close(); }
  };
}
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }); });

describe("independent phase one controller process", () => {
  it.each(["legacy", "null", "object", "string", "invalid-entry", "same-session"] as const)(
    "rejects %s historical feedback sources before resuming a checkpoint for direct paid verification", async shape => {
      const state = fixture(), sessionId = "10000000-0000-4000-8000-000000000001";
      const binding = { target: "example", targetId: "removed-private-example", regressionId: "10000000-0000-4000-8000-000000000002",
        contentHash: "a".repeat(64), feedbackId: "10000000-0000-4000-8000-000000000003", feedbackRevision: 1,
        executionId: "10000000-0000-4000-8000-000000000004", sessionId, expiresAt: state.config.expiresAt, expectationAuthority: "proposal" };
      const { sessionId: _sessionId, ...legacyBinding } = binding;
      const sources = shape === "legacy" ? [legacyBinding] : shape === "null" ? null : shape === "object" ? {} : shape === "string" ? "invalid"
        : shape === "invalid-entry" ? [null] : [binding];
      // The search used a private example that the final candidate no longer contains.
      // The final case has a different feedback/execution identity from the same Session.
      state.cases[0]!.oracle = { allowedKinds: ["answer"], requiredCitationIds: [] };
      state.cases[2]!.sourceIds.push(`session:${sessionId}`, "feedback:10000000-0000-4000-8000-000000000005", "execution:10000000-0000-4000-8000-000000000006");
      state.write("cases.json", state.cases);
      state.write("baseline.json", state.read("candidate.json"));
      const demonstration = "Disposable historical private example fixture";
      const search = { schemaVersion: "optimization-search-input.v1", baseline: state.read("baseline.json"), cases: [state.cases[0]],
        examples: [{ exampleId: binding.targetId, partition: "dev", dataClass: "private_business", demonstration, contentDigest: hash(demonstration) }],
        maximumTrials: 1, repetitions: 1, timeoutMs: 5000, feedbackSources: sources };
      state.write("search.json", search);
      state.write("phase-one-controller.json", { ...state.config, providerKind: "real_model", budgetDatasetDigest: hash(search) });
      state.write("candidate.json", loadedRelationshipTaskConfiguration(state.config.model).configuration.parameters);
      // CI attestation is an independent boundary; only its verification is stubbed.
      // Controller freeze, checkpoint persistence, strict source admission and resume remain real.
      const proof: phaseOneCI.PhaseOneCIProof = { schemaVersion: "phase-one-ci-proof.v1", applicationRevision: "a".repeat(40),
        sourceDigest: hash("fixture-source"), runtimeBuildDigest: hash("fixture-build"), checkPolicyDigest: hash("fixture-checks"), checks: [],
        verifiedAt: new Date().toISOString(), keyId: state.config.keyId, executorId: state.config.executorId,
        semanticQuality: "not_run", releaseAuthority: "none", signature: "fixture" };
      state.write("phase-one-ci-proof.json", proof);
      const ci = vi.spyOn(phaseOneCI, "verifyPhaseOneCIProof").mockImplementation(value => value);
      const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("UNEXPECTED_FIXTURE_NETWORK"));
      try {
        await state.command("freeze");
        const bindings = { baselineDigest: hash(state.read("phase-one-frozen.json").comparison.baseline), datasetDigest: hash(search), evaluatorVersion: "1", optimizerVersion: "1" };
        const permit: OptimizationBudgetPermit = { permitId: "permit-1", budgetScopeId: "scope-1", status: "active", currency: "USD",
          issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(),
          runLimits: { amountMicros: 1000, calls: 10, tokens: 1000, elapsedMs: 100000, candidateCount: 10, concurrency: 3 },
          monthlyLimits: { amountMicros: 3000, calls: 30, tokens: 3000, elapsedMs: 300000, candidateCount: 30, concurrency: 9 },
          finalValidationReserve: { amountMicros: 100, calls: 1, tokens: 100, elapsedMs: 1000, candidateCount: 0 } };
        const configuration = { schemaVersion: "optimization-controller.v1", ledgerFile: "budget.sqlite", permitFile: "permit.json", bindingsFile: "bindings.json",
          model: state.config.model, pricing: { currency: "USD", inputMicrosPerMillionTokens: 1, outputMicrosPerMillionTokens: 1 }, searchFile: "search.json" };
        state.write("bindings.json", bindings); state.write("permit.json", permit); state.write("controller.json", configuration);
        const runDirectory = `runs/${hash(state.config.runId).slice(7)}`;
        mkdirSync(join(state.directory, runDirectory), { recursive: true, mode: 0o700 });
        state.write(`${runDirectory}/run-control.json`, { schemaVersion: "optimization-run-control.v1", runId: state.config.runId,
          controllerDigest: hash({ configuration, bindings, permit }) });
        const ledger = new FileOptimizationBudgetLedger({ path: join(state.directory, "budget.sqlite") });
        try { ledger.startRun({ runId: state.config.runId, bindings, permit }); ledger.checkpoint(state.config.runId, "search_finished_pending_independent_validation"); }
        finally { ledger.close(); }
        await expect(state.command("verify")).rejects.toThrow(shape === "same-session" ? "PHASE_ONE_SOURCE_PARTITION_CONTAMINATION" : "OPTIMIZATION_FEEDBACK_BINDING_INVALID");
        const persisted = new FileOptimizationBudgetLedger({ path: join(state.directory, "budget.sqlite") });
        try { expect(persisted.snapshot(state.config.runId)).toMatchObject({ status: "checkpointed", reason: "search_finished_pending_independent_validation", operations: [] }); }
        finally { persisted.close(); }
        expect(network).not.toHaveBeenCalled();
        expect(existsSync(join(state.directory, "phase-one-executions.json"))).toBe(false);
        expect(existsSync(join(state.directory, "phase-one-verification.json"))).toBe(false);
      } finally { ci.mockRestore(); network.mockRestore(); }
    });

  it("executes the real product serializer/parser in another process and preserves layered uncertainty", async () => {
    const state = fixture();
    const child = (command: string) => JSON.parse(execFileSync(process.execPath,
      ["--import", "tsx", "src/phaseOneProcess.ts", command, "--controller-dir", state.directory], {
        cwd: process.cwd(), env: { PATH: process.env.PATH, NODE_NO_WARNINGS: "1" }, encoding: "utf8", timeout: 15000,
      }));
    expect(child("freeze").status).toBe("frozen");
    const result = child("verify");
    expect(result).toMatchObject({ status: "recorded", liveCalls: 12, replayedCalls: 0, releaseAuthority: "none",
      categories: { execution_integrity: "pass", deterministic_boundary: "pass", semantic_quality: "needs_review", release_conditions: "not_run" } });
    const journal = state.read("phase-one-executions.json");
    expect(journal.records).toHaveLength(12);
    expect(journal.records.every((item: any) => item.recording.receipt.providerKind === "deterministic_fake")).toBe(true);
    expect(JSON.stringify(state.read("phase-one-verification.json"))).not.toContain("Which source and reference time");
    expect(child("adjudicate")).toMatchObject({ liveCalls: 0, replayedCalls: 12 });
    expect(child("inspect")).toMatchObject({ status: "verified_signature", releaseAuthority: "none" });
  }, 60_000);

  it("binds human reviews to exact output and rubric; fixture passes never become model quality", async () => {
    const state = fixture(); await state.command("freeze"); await state.command("verify");
    const frozen = state.read("phase-one-frozen.json"), journal = state.read("phase-one-executions.json");
    // Identical deterministic outputs intentionally deduplicate into one decision per case/repeat.
    state.write("reviews.json", state.cases.slice(1).flatMap(item => [1, 2].flatMap(repetition => [...new Set(journal.records.map((record: any) => hash(record.recording.receipt.output)))].flatMap(outputDigest => PHASE_ONE_SEMANTIC_DIMENSIONS.map(dimension => ({
      schemaVersion: "phase-one-human-review.v2", criterionId: dimension.criterionId, caseId: item.caseId, repetition, outputDigest,
      comparisonDigest: frozen.comparison.contentDigest, rubricDigest: frozen.comparison.rubricDigest,
      reviewerId: "human-1", decisionRef: `review-${item.caseId}-${repetition}-${dimension.criterionId}`, status: "pass", evidenceRefs: ["source:review"], revokedAt: null,
    }))))));
    const result = await state.command("adjudicate") as any;
    expect(result.categories.semantic_quality).toBe("needs_review");
    expect(result.liveCalls).toBe(0);
    const report = state.read("phase-one-verification.json").report;
    expect(report.attempts.every((item: any) => item.observations.filter((observation: any) => observation.category === "semantic_quality")
      .every((observation: any) => observation.reasonCode === "FIXTURE_CANNOT_PROVE_MODEL_QUALITY"))).toBe(true);
    expect(report.metrics.criteria.filter((item: any) => item.category === "semantic_quality")).toHaveLength(5);
    expect(result.metrics.usage.candidate.inputTokens).toMatchObject({ numerator: 60, denominator: 6, unknown: 0 });
  });

  it("keeps legacy, missing and duplicate human dimension reviews unknown while retaining valid per-dimension failures", async () => {
    const state = fixture(); await state.command("freeze"); await state.command("verify");
    const frozen = state.read("phase-one-frozen.json"), journal = state.read("phase-one-executions.json");
    const common = { caseId: "case-1", repetition: 1, outputDigest: hash(journal.records[0].recording.receipt.output),
      comparisonDigest: frozen.comparison.contentDigest, rubricDigest: frozen.comparison.rubricDigest,
      reviewerId: "human-1", decisionRef: "review-1", status: "fail", evidenceRefs: ["source:review"], revokedAt: null };
    const evidence = { ...common, schemaVersion: "phase-one-human-review.v2", criterionId: "relationship.evidence_support" };
    state.write("reviews.json", [
      { ...common, status: "pass" }, // Old blanket reviews do not apply to any new dimension.
      evidence,
      { ...evidence, criterionId: "relationship.ambiguity_handling" },
      { ...evidence, criterionId: "relationship.ambiguity_handling", decisionRef: "conflicting-review" },
      { ...evidence, criterionId: "relationship.temporal_correctness", revokedAt: new Date().toISOString() },
    ]);
    await state.command("adjudicate");
    const report = state.read("phase-one-verification.json").report;
    const attempt = report.attempts.find((item: any) => item.caseId === "case-1" && item.repetition === 1 && item.variant === "candidate");
    expect(attempt.observations.find((item: any) => item.criterionId === "relationship.output_boundary").status).toBe("pass");
    expect(attempt.observations.find((item: any) => item.criterionId === "relationship.evidence_support").status).toBe("fail");
    for (const dimension of PHASE_ONE_SEMANTIC_DIMENSIONS.slice(1)) {
      expect(attempt.observations.find((item: any) => item.criterionId === dimension.criterionId).status).toBe("needs_review");
    }
    expect(report.safetyVeto).toBe(true);
  });

  it("rejects changed input, global source overlap, exposed holdouts and forged execution journals", async () => {
    const state = fixture(); await state.command("freeze"); await state.command("verify");
    const journal = state.read("phase-one-executions.json");
    journal.records[0].recording.receipt.providerKind = "real_model"; state.write("phase-one-executions.json", journal);
    await expect(state.command("adjudicate")).rejects.toThrow("PHASE_ONE_EXECUTION_JOURNAL_INVALID");
    state.write("exposures.json", [{ sourceIds: ["source-2"], actorId: "generator-1", role: "generator", content: "input", observedAt: "2026-09-07T00:00:00Z" }]);
    await expect(state.command("inspect")).rejects.toThrow("PHASE_ONE_FINAL_DATA_EXPOSED_OR_DEVELOPMENT");
    state.write("exposures.json", []);
    state.cases[0]!.sourceIds = ["source-2"]; state.write("cases.json", state.cases);
    await expect(state.command("freeze")).rejects.toThrow("PHASE_ONE_SOURCE_PARTITION_CONTAMINATION");
  });

  it("fences concurrent execution, recovers a dead process lease, and prevents resurrection after deletion", async () => {
    const state = fixture(); await state.command("freeze");
    state.write("phase-one-executor.lock", { pid: process.pid });
    await expect(state.command("verify")).rejects.toThrow("PHASE_ONE_EXECUTOR_ALREADY_RUNNING");
    state.write("phase-one-executor.lock", { pid: 2147483647 });
    await state.command("verify");
    expect(existsSync(join(state.directory, "phase-one-executor.lock"))).toBe(false);
    state.write("phase-one-executions.json.11111111-1111-4111-8111-111111111111.tmp", { privateOutput: "orphan-private-sentinel" });
    await state.command("tombstone");
    expect(existsSync(join(state.directory, "phase-one-executions.json"))).toBe(false);
    expect(existsSync(join(state.directory, "phase-one-executions.json.11111111-1111-4111-8111-111111111111.tmp"))).toBe(false);
    await expect(state.command("verify")).rejects.toThrow("PHASE_ONE_RUN_TOMBSTONED");
    await expect(state.command("freeze")).rejects.toThrow("PHASE_ONE_RUN_TOMBSTONED");
  });

  it("rejects private inputs without native lineage and erases controller copies on tombstone", async () => {
    const state = fixture();
    state.write("phase-one-controller.json", { ...state.config, providerKind: "real_model" });
    state.write("cases.json", state.cases.map(item => ({ ...item, modelInput: { ...item.modelInput as object, dataClass: "private_business", objective: "private-copy-sentinel" } })));
    await expect(state.command("freeze")).rejects.toThrow("PHASE_ONE_PRIVATE_SOURCE_BINDING_REQUIRED");
    state.write("cases.json.11111111-1111-4111-8111-111111111111.tmp", { private: "private-copy-sentinel" });
    await state.command("tombstone");
    expect(state.read("cases.json").schemaVersion).toBe("phase-one-private-copy-tombstone.v1");
    expect(readFileSync(join(state.directory, "cases.json"), "utf8")).not.toContain("private-copy-sentinel");
    expect(existsSync(join(state.directory, "cases.json.11111111-1111-4111-8111-111111111111.tmp"))).toBe(false);
  });

  it("resumes partial erasure and budget stopping in a fresh process after the deleting process dies", async () => {
    const state = fixture(), budgetStatus = runningBudget(state);
    state.write("cases.json", [{ modelInput: { dataClass: "private_business", objective: "private-case-sentinel" } }]);
    state.write("examples.json", [{ dataClass: "private_business", input: "private-example-sentinel" }]);
    state.write("reviews.json", [{ evidence: "private-review-sentinel" }]);
    const pendingFiles = ["phase-one-executions.json", "phase-one-verification.json",
      "examples.json.11111111-1111-4111-8111-111111111111.tmp"];
    for (const name of pendingFiles) state.write(name, { value: "private-output-sentinel" });
    const crashed = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", `
      import fs from "node:fs";
      import { syncBuiltinESMExports } from "node:module";
      import { join } from "node:path";
      const rename = fs.renameSync;
      fs.renameSync = (from, to) => {
        rename(from, to);
        if (to === join(process.argv[1], "cases.json")) process.kill(process.pid, "SIGKILL");
      };
      syncBuiltinESMExports();
      const { runPhaseOneCommand } = await import("./src/phaseOneCommand.ts");
      await runPhaseOneCommand(["tombstone"], process.argv[1]);
    `, state.directory], { cwd: process.cwd(), env: { PATH: process.env.PATH, NODE_NO_WARNINGS: "1" }, encoding: "utf8", timeout: 15000 });
    expect(crashed.error).toBeUndefined(); expect(crashed.signal).toBe("SIGKILL");
    expect(existsSync(join(state.directory, "phase-one-tombstone.json"))).toBe(true);
    const originalTombstone = state.read("phase-one-tombstone.json");
    expect(state.read("cases.json").schemaVersion).toBe("phase-one-private-copy-tombstone.v1");
    expect(state.read("examples.json")[0].input).toBe("private-example-sentinel");
    expect(state.read("reviews.json")[0].evidence).toBe("private-review-sentinel");
    expect(budgetStatus()).toBe("running");
    const recovered = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", `
      import { sweepPhaseOneControllerSources } from "./src/phaseOneCommand.ts";
      console.log(JSON.stringify(await sweepPhaseOneControllerSources(process.argv[1])));
    `, state.directory], { cwd: process.cwd(), env: { PATH: process.env.PATH, NODE_NO_WARNINGS: "1" }, encoding: "utf8", timeout: 15000 }));
    expect(recovered).toEqual({ status: "tombstoned" });
    expect(state.read("examples.json").schemaVersion).toBe("phase-one-private-copy-tombstone.v1");
    expect(state.read("reviews.json")).toEqual([]);
    for (const name of pendingFiles) expect(existsSync(join(state.directory, name))).toBe(false);
    expect(budgetStatus()).toBe("tombstoned");
    // A missing already-erased input must not prevent another idempotent sweep.
    unlinkSync(join(state.directory, "cases.json"));
    expect(await sweepPhaseOneControllerSources(state.directory)).toEqual({ status: "tombstoned" });
    expect(budgetStatus()).toBe("tombstoned");
    expect(state.read("phase-one-tombstone.json")).toEqual(originalTombstone);
  });

  it("stops the original budget even when private file erasure fails, and retries the remaining erasure", async () => {
    const state = fixture(), budgetStatus = runningBudget(state);
    state.write("examples.json", [{ dataClass: "private_business", input: "private-example-sentinel" }]);
    chmodSync(join(state.directory, "examples.json"), 0o644);
    await expect(state.command("tombstone")).rejects.toThrow("PHASE_ONE_CONTROLLER_FILE_PERMISSIONS_REQUIRED");
    expect(budgetStatus()).toBe("tombstoned");
    await expect(sweepPhaseOneControllerSources(state.directory)).rejects.toThrow("PHASE_ONE_CONTROLLER_FILE_PERMISSIONS_REQUIRED");
    chmodSync(join(state.directory, "examples.json"), 0o600);
    expect(await sweepPhaseOneControllerSources(state.directory)).toEqual({ status: "tombstoned" });
    expect(state.read("examples.json").schemaVersion).toBe("phase-one-private-copy-tombstone.v1");
  });

  it("propagates tombstone read errors instead of treating them as completed deletion", async () => {
    const state = fixture();
    symlinkSync(join(state.directory, "reviews.json"), join(state.directory, "phase-one-tombstone.json"));
    await expect(sweepPhaseOneControllerSources(state.directory)).rejects.toMatchObject({ code: "ELOOP" });
  });

  it("does not report completion when an existing budget configuration cannot be loaded", async () => {
    const state = fixture(), budgetStatus = runningBudget(state), bindings = state.read("bindings.json");
    unlinkSync(join(state.directory, "bindings.json"));
    await expect(state.command("tombstone")).rejects.toMatchObject({ code: "ENOENT" });
    expect(budgetStatus()).toBe("running");
    await expect(sweepPhaseOneControllerSources(state.directory)).rejects.toMatchObject({ code: "ENOENT" });
    state.write("bindings.json", bindings);
    expect(await sweepPhaseOneControllerSources(state.directory)).toEqual({ status: "tombstoned" });
    expect(budgetStatus()).toBe("tombstoned");
  });

  it("invalidates a signed report when the human review store is changed or withdrawn", async () => {
    const state = fixture(); await state.command("freeze"); await state.command("verify");
    state.write("reviews.json", [{ revokedAt: new Date().toISOString() }]);
    await expect(state.command("inspect")).rejects.toThrow("PHASE_ONE_JUDGMENT_CONTEXT_STALE");
    expect(await state.command("adjudicate")).toMatchObject({ liveCalls: 0, replayedCalls: 12 });
    expect(await state.command("inspect")).toMatchObject({ status: "verified_signature" });
  });

  it("rejects reusing the actual human semantic reviewer as the release reviewer", async () => {
    const state = fixture(); await state.command("freeze");
    state.write("phase-one-release-controller.json", { schemaVersion: "phase-one-release-controller.v1", executorId: "human-1", keyId: "other-key" });
    await expect(state.command("release-review")).rejects.toThrow("PHASE_ONE_RELEASE_REVIEWER_NOT_INDEPENDENT");
  });

  it("requires protected controller files, separate actors and pinned immutable inputs", async () => {
    const state = fixture();
    chmodSync(join(state.directory, "phase-one-controller.json"), 0o644);
    await expect(state.command("freeze")).rejects.toThrow("PHASE_ONE_CONTROLLER_FILE_PERMISSIONS_REQUIRED");
    chmodSync(join(state.directory, "phase-one-controller.json"), 0o600);
    await state.command("freeze");
    state.write("candidate.json", { schemaVersion: "optimization-candidate.v1", taskFragmentId: "evidence_first", exampleIds: [] });
    await expect(state.command("freeze")).rejects.toThrow("PHASE_ONE_FROZEN_STUDY_IMMUTABLE");
  });
});

describe("authenticated runtime configuration readback", () => {
  it("requires the actual full task configuration and exact deployment identity", async () => {
    const exposure = { schemaVersion: "phase-one-deployment-exposure.v1", workspaceIds: ["10000000-0000-4000-8000-000000000001"], percentage: 100 };
    const base = { build_source_digest: hash("actual-build"), deployment_exposure: exposure, deployment_exposure_digest: hash(exposure), schema_version: "loaded-runtime-configuration.v1", deployment_id: "actual-deployment", revision: "revision-1",
      loading_policy: "bundled_at_startup", in_flight_policy: "retain_captured_snapshot", prompt_catalogue_digest: hash("catalogue"),
      relationship_task: { taskConfigurationDigest: hash("actual-model-prompt-policy") }, process_instance_id: "process-1", configuration_initialized_at: "2026-09-07T00:00:00Z" };
    let response: unknown = base;
    const fetcher = vi.fn(async () => new Response(JSON.stringify(response)));
    const reader = createPhaseOneHttpRuntimeReader({ environments: { test: { origin: "http://127.0.0.1:3001", deploymentId: "actual-deployment" } }, bearerToken: "private-token", fetcher });
    expect(await reader.readLoadedConfiguration("test")).toMatchObject({ taskConfigurationDigest: hash("actual-model-prompt-policy") });
    expect(fetcher.mock.calls[0]?.length).toBe(2);
    response = { ...base, relationship_task: null };
    await expect(reader.readLoadedConfiguration("test")).rejects.toThrow("PHASE_ONE_CONTROLLER_INVALID");
    response = { ...base, deployment_id: "different" };
    await expect(reader.readLoadedConfiguration("test")).rejects.toThrow("PHASE_ONE_RUNTIME_TARGET_MISMATCH");
    await expect(reader.readLoadedConfiguration("unknown")).rejects.toThrow("PHASE_ONE_RUNTIME_CONFIGURATION_UNAVAILABLE");
  });
});
