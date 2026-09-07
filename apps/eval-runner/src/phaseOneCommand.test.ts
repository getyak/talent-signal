import { generateKeyPairSync } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { digestCanonicalJson, type PhaseOneCase } from "@talent-signal/evaluation";
import { createPhaseOneHttpRuntimeReader, runPhaseOneCommand } from "./phaseOneCommand.js";

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
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }); });

describe("independent phase one controller process", () => {
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
  });

  it("binds human reviews to exact output and rubric; fixture passes never become model quality", async () => {
    const state = fixture(); await state.command("freeze"); await state.command("verify");
    const frozen = state.read("phase-one-frozen.json"), journal = state.read("phase-one-executions.json");
    // Identical deterministic outputs intentionally deduplicate into one decision per case/repeat.
    state.write("reviews.json", state.cases.slice(1).flatMap(item => [1, 2].flatMap(repetition => [...new Set(journal.records.map((record: any) => hash(record.recording.receipt.output)))].map(outputDigest => ({
      caseId: item.caseId, repetition, outputDigest,
      comparisonDigest: frozen.comparison.contentDigest, rubricDigest: frozen.comparison.rubricDigest,
      reviewerId: "human-1", decisionRef: `review-${item.caseId}-${repetition}`, status: "pass", evidenceRefs: ["source:review"], revokedAt: null,
    })))));
    const result = await state.command("adjudicate") as any;
    expect(result.categories.semantic_quality).toBe("needs_review");
    expect(result.liveCalls).toBe(0);
    expect(state.read("phase-one-verification.json").report.attempts.every((item: any) =>
      item.observations.find((observation: any) => observation.category === "semantic_quality").reasonCode === "FIXTURE_CANNOT_PROVE_MODEL_QUALITY")).toBe(true);
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
