import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { digestCanonicalJson, withContentDigest } from "./digest.js";
import { assertPhaseOneDatasetCurrent, freezePhaseOneDataset, phaseOneGeneratorInputs, type PhaseOneCase, type PhaseOneExposure } from "./phaseOneDataset.js";
import { freezePhaseOneComparison, runPhaseOnePairedEvaluation, type PhaseOneComparison, type PhaseOneEvaluator,
  type PhaseOneProductExecutor, type PhaseOneProductRequest, type PhaseOneReport } from "./phaseOneEvaluation.js";
import { decidePhaseOneRelease, readPhaseOneRuntime, signPhaseOneVerificationReport, signPhaseOneReleaseDecision, verifyPhaseOneReleaseDecision, signPhaseOneRollbackProof, verifyPhaseOneRollbackProof, verifyPhaseOneDeploymentReadback,
  verifyPhaseOneRollbackReadback, verifyPhaseOneVerificationReport, type PhaseOneReleaseAuthority, type PhaseOneReleaseBinding,
  type PhaseOneRuntimeReadback, type PhaseOneRuntimeReader } from "./phaseOneRelease.js";

const hash = digestCanonicalJson;
const time = "2026-09-07T12:00:00.000Z";
const cases = (): PhaseOneCase[] => (["p0", "held_out", "red_team"] as const).map((sourcePartition, index) => ({
  caseId: `case-${index}`, sourceIds: [`source-${index}`], sourcePartition, purpose: "final_verification", referenceTime: time,
  modelInput: { question: `synthetic-question-${index}` }, oracle: { privateGold: `never-send-${index}` }, slices: { ambiguity: index === 0 ? "yes" : "no" },
}));

function setup() {
  const items = cases(), exposures: PhaseOneExposure[] = [];
  const dataset = freezePhaseOneDataset({ datasetId: "dataset-1", cases: items, exposures });
  const config = { model: "fixture-model", promptRevision: "revision-1", promptContentDigest: hash("prompt"), runtimePolicyDigest: hash("policy"), parameters: {} };
  const comparison = freezePhaseOneComparison({ runId: "run-1", generatorActorId: "generator-1", datasetDigest: dataset.contentDigest,
    rubricDigest: hash("rubric"), environmentDigest: hash("environment"), baseline: { ...config, configurationId: "baseline" },
    candidate: { ...config, configurationId: "candidate" }, repetitions: 2, seed: 7,
    criteria: [{ criterionId: "safety.evidence", category: "deterministic_boundary", evaluatorId: "boundary-1", evaluatorKind: "deterministic", critical: true },
      { criterionId: "quality.correct", category: "semantic_quality", evaluatorId: "review-store", evaluatorKind: "human", critical: true }] });
  const requests: PhaseOneProductRequest[] = [];
  const executor: PhaseOneProductExecutor = { executorId: "executor-1", async execute(request) {
    requests.push(request);
    return { status: "completed", output: { answer: "synthetic-output" }, loadedConfigurationDigest: request.configurationDigest,
      adapterId: "actual-product-adapter", receiptId: `receipt-${requests.length}`, providerKind: "real_model", inputTokens: 10, outputTokens: 5, costUsd: 0.01, durationMs: 50 };
  } };
  const evaluator: PhaseOneEvaluator = { async evaluate(input) { return input.criteria.map((criterion) => ({ criterionId: criterion.criterionId,
    status: "pass", evidenceRefs: [`evidence:${input.caseId}:${criterion.criterionId}`], humanReviewerId: "reviewer-1", humanDecisionRef: "decision-1" })); } };
  const run = (overrides: Partial<Parameters<typeof runPhaseOnePairedEvaluation>[0]> = {}) => runPhaseOnePairedEvaluation({
    comparison, dataset, cases: items, exposures, executor, evaluator, judgeAssurances: [], mode: "independent_verification", createdAt: time, judgmentContextDigest: hash("trusted-review-snapshot"), ...overrides,
  });
  return { items, exposures, dataset, comparison, requests, executor, evaluator, run };
}

const keyPair = generateKeyPairSync("ed25519");
const signer = { keyId: "verification-key", executorId: "executor-1", privateKeyPem: keyPair.privateKey.export({ type: "pkcs8", format: "pem" }).toString() };
const trustedVerifiers = [{ keyId: signer.keyId, executorId: signer.executorId, publicKeyPem: keyPair.publicKey.export({ type: "spki", format: "pem" }).toString() }];

describe("phase one frozen evaluation", () => {
  it("groups partitions by source and exact input and preserves provenance after holdout exposure", () => {
    const state = setup();
    expect(() => freezePhaseOneDataset({ datasetId: "mixed", exposures: [], cases: [state.items[0]!, { ...state.items[1]!, sourceIds: state.items[0]!.sourceIds }] }))
      .toThrow("PHASE_ONE_SOURCE_PARTITION_CONTAMINATION");
    expect(() => freezePhaseOneDataset({ datasetId: "mixed", exposures: [], cases: [state.items[0]!, { ...state.items[1]!, modelInput: state.items[0]!.modelInput }] }))
      .toThrow("PHASE_ONE_INPUT_PARTITION_CONTAMINATION");
    const exposures: PhaseOneExposure[] = [{ sourceIds: ["source-1"], actorId: "generator-1", role: "generator", content: "failure_details", observedAt: time }];
    const changed = freezePhaseOneDataset({ datasetId: state.dataset.datasetId, cases: state.items, exposures });
    expect(changed.cases[1]).toMatchObject({ sourcePartition: "held_out", purpose: "final_verification", currentPurpose: "development" });
    expect(() => assertPhaseOneDatasetCurrent(state.dataset, state.items, exposures)).toThrow("PHASE_ONE_DATASET_OR_EXPOSURE_STALE");
    expect(phaseOneGeneratorInputs(state.items)).toEqual([]);
  });

  it("executes repeatable paired requests with no gold or author identity in product/judge input", async () => {
    const state = setup(), report = await state.run();
    expect(state.requests).toHaveLength(12);
    expect(JSON.stringify(state.requests)).not.toContain("never-send");
    for (const item of state.items) for (const repetition of [1, 2]) {
      const pair = state.requests.filter((request) => request.caseId === item.caseId && request.repetition === repetition);
      expect(pair).toHaveLength(2);
      expect(pair[0]!.seed).toBe(pair[1]!.seed);
      expect(pair[0]!.referenceTime).toBe(pair[1]!.referenceTime);
      expect(pair[0]!.modelInput).toEqual(pair[1]!.modelInput);
      expect(pair[0]!.idempotencyKey).not.toBe(pair[1]!.idempotencyKey);
    }
    expect(report.categories).toEqual({ execution_integrity: "pass", deterministic_boundary: "pass", semantic_quality: "pass", release_conditions: "not_run" });
    expect(report.candidate).toEqual({ numerator: 18, denominator: 18, unknown: 0, value: 1 });
    expect(report.paired).toEqual({ wins: 0, regressions: 0, ties: 18, unknown: 0, denominator: 18 });
    expect(JSON.stringify(report)).not.toContain("synthetic-output");
    expect(JSON.stringify(report)).not.toContain("never-send");
    expect(report.releaseAuthority).toBe("none");
  });

  it("does not hide missing calls, unknown spend or failed safety criteria in aggregate wins", async () => {
    const state = setup();
    const execute = state.executor.execute;
    const executor: PhaseOneProductExecutor = { executorId: "executor-1", async execute(request) {
      if (request.caseId === "case-0" && request.configuration.configurationId === "candidate") throw new Error("private provider payload");
      const receipt = await execute(request);
      return { ...receipt, costUsd: null };
    } };
    const report = await state.run({ executor });
    expect(report.attempts).toHaveLength(12);
    expect(report.categories.execution_integrity).toBe("unavailable");
    expect(report.candidate.unknown).toBe(6);
    expect(report.cost.candidate).toMatchObject({ denominator: 6, unknown: 6, value: null });
    expect(JSON.stringify(report)).not.toContain("private provider payload");
    const unsafe = await state.run({ evaluator: { async evaluate(input) { return input.criteria.map((item) => ({ criterionId: item.criterionId,
      status: item.critical ? "fail" : "pass", evidenceRefs: ["evidence:regression"], humanReviewerId: "reviewer-1", humanDecisionRef: "decision-1" })); } } });
    expect(unsafe.safetyVeto).toBe(true);
    expect(unsafe.categories.deterministic_boundary).toBe("fail");
  });

  it("rejects stale configuration receipts and reused execution receipts", async () => {
    const state = setup();
    const execute = state.executor.execute;
    const report = await state.run({ executor: { executorId: "executor-1", async execute(request) {
      return { ...await execute(request), loadedConfigurationDigest: hash("different-config") };
    } } });
    expect(report.categories.execution_integrity).toBe("fail");
    const replay = await state.run({ executor: { executorId: "executor-1", async execute(request) {
      return { ...await execute(request), receiptId: "same-receipt" };
    } } });
    expect(replay.categories.execution_integrity).toBe("fail");
  });

  it("requires independent final execution and blocks contaminated holdout access", async () => {
    const state = setup();
    await expect(state.run({ executor: { ...state.executor, executorId: "generator-1" } })).rejects.toThrow("PHASE_ONE_EXECUTOR_NOT_INDEPENDENT");
    await expect(state.run({ mode: "development" })).rejects.toThrow("PHASE_ONE_DEVELOPMENT_ACCESS_TO_HOLDOUT");
    const items = state.items.map((item) => ({ ...item, purpose: "development" as const }));
    const dataset = freezePhaseOneDataset({ datasetId: "development", cases: items, exposures: [] });
    const comparison = freezePhaseOneComparison({ ...state.comparison, datasetDigest: dataset.contentDigest });
    await expect(state.run({ cases: items, dataset, comparison })).rejects.toThrow("PHASE_ONE_FINAL_DATA_EXPOSED_OR_DEVELOPMENT");
  });

  it("model passes require trusted calibration and every stability probe", async () => {
    const state = setup();
    const comparison = freezePhaseOneComparison({ ...state.comparison, criteria: state.comparison.criteria.map((item) => item.category === "semantic_quality"
      ? { ...item, evaluatorKind: "model" as const, evaluatorId: "judge-1" } : item) });
    const report = await state.run({ comparison, judgeAssurances: [{ evaluatorId: "judge-1", rubricDigest: comparison.rubricDigest,
      calibrationDigest: hash("calibration"), calibrationEligible: true, injectionProbe: "pass", orderStability: "pass", repeatStability: "pass" }] });
    expect(report.categories.semantic_quality).toBe("pass");
    expect(report.candidate.unknown).toBe(0);
    const noncritical = freezePhaseOneComparison({ ...comparison, criteria: comparison.criteria.map((item) => item.evaluatorKind === "model" ? { ...item, critical: false } : item) });
    for (const instability of ["injectionProbe", "orderStability", "repeatStability"] as const) {
      const result = await state.run({ comparison: noncritical, judgeAssurances: [{ evaluatorId: "judge-1", rubricDigest: comparison.rubricDigest,
        calibrationDigest: hash("calibration"), calibrationEligible: true, injectionProbe: "pass", orderStability: "pass", repeatStability: "pass", [instability]: "fail" }] });
      expect(result.categories.semantic_quality).toBe("needs_review");
    }
  });
});

async function releaseSetup() {
  const state = setup(), report = await state.run();
  const verification = signPhaseOneVerificationReport(report, signer);
  const binding: PhaseOneReleaseBinding = {
    candidateDigest: hash(state.comparison.candidate), baselineDigest: hash(state.comparison.baseline), datasetDigest: state.dataset.contentDigest,
    rubricDigest: state.comparison.rubricDigest, environmentDigest: state.comparison.environmentDigest, exposureDigest: state.dataset.exposureDigest,
    comparisonDigest: state.comparison.contentDigest, verificationReportDigest: report.contentDigest, targetEnvironmentId: "staging", rollbackEnvironmentId: "rehearsal",
    candidateRuntimeDigest: hash("runtime-candidate"), baselineRuntimeDigest: hash("runtime-baseline"),
    candidateApplicationRevision: "candidate-sha", baselineApplicationRevision: "baseline-sha", candidateBuildDigest: hash("candidate-build"), baselineBuildDigest: hash("baseline-build"), deploymentExposureDigest: hash("actual-workspace-scope"),
  };
  const snapshot = (kind: "baseline" | "candidate" | "restored", observedAt: string): PhaseOneRuntimeReadback => ({ targetEnvironmentId: "rehearsal",
    runtimeDigest: kind === "candidate" ? binding.candidateRuntimeDigest : binding.baselineRuntimeDigest,
    taskConfigurationDigest: kind === "candidate" ? binding.candidateDigest : binding.baselineDigest,
    buildSourceDigest: kind === "candidate" ? binding.candidateBuildDigest : binding.baselineBuildDigest, deploymentExposureDigest: binding.deploymentExposureDigest,
    applicationRevision: kind === "candidate" ? "candidate-sha" : "baseline-sha", processInstanceId: `${kind}-process`,
    configurationInitializedAt: observedAt, observedAt });
  const read = (value: PhaseOneRuntimeReadback) => readPhaseOneRuntime("rehearsal", { async readLoadedConfiguration() { return value; } });
  const baseline = await read(snapshot("baseline", "2026-09-07T11:57:00.000Z"));
  const candidate = await read(snapshot("candidate", "2026-09-07T11:58:00.000Z"));
  const restored = await read(snapshot("restored", "2026-09-07T11:59:00.000Z"));
  const rollback = verifyPhaseOneRollbackReadback({ binding, baseline, candidate, restored });
  const authorization = { authorizationId: "human-grant-1", reviewer: { actorId: "codex-release-1", kind: "codex" as const },
    humanDelegatorId: "human-1", bindingDigest: hash(binding), allowedAction: "deploy_candidate" as const,
    grantedAt: "2026-09-07T11:59:00.000Z", expiresAt: "2026-09-07T12:05:00.000Z", revokedAt: null };
  const authority: PhaseOneReleaseAuthority = { async readAuthorization() { return authorization; }, async readExposureDigest() { return binding.exposureDigest; }, async readJudgmentContextDigest() { return report.judgmentContextDigest; } };
  const runtime: PhaseOneRuntimeReader = { async readLoadedConfiguration() { return { ...snapshot("restored", time), targetEnvironmentId: "staging", configurationInitializedAt: restored.configurationInitializedAt }; } };
  const decisionInput = { comparison: state.comparison, dataset: state.dataset, verification, trustedVerifiers, binding, rollback,
    authorizationId: authorization.authorizationId, now: time, authority, runtime };
  return { ...state, report, verification, binding, rollback, authorization, authority, runtime, decisionInput, baseline, candidate, restored, snapshot };
}

describe("phase one independent release", () => {
  it("persists authenticated verification and rejects forged, mutated or unknown-key envelopes", async () => {
    const state = await releaseSetup();
    expect(verifyPhaseOneVerificationReport(JSON.parse(JSON.stringify(state.verification)), trustedVerifiers).contentDigest).toBe(state.report.contentDigest);
    expect(() => signPhaseOneVerificationReport(JSON.parse(JSON.stringify(state.report)), signer)).toThrow("PHASE_ONE_REPORT_NOT_EXECUTED_HERE");
    expect(() => verifyPhaseOneVerificationReport(state.verification, [])).toThrow("PHASE_ONE_VERIFIER_NOT_TRUSTED");
    const report = withContentDigest({ ...state.report, safetyVeto: true }) as PhaseOneReport;
    expect(() => verifyPhaseOneVerificationReport({ ...state.verification, report }, trustedVerifiers)).toThrow("PHASE_ONE_SIGNATURE_INVALID");
  });

  it("uses a separate rehearsal environment and persists only authenticated rollback proof", async () => {
    const state = await releaseSetup();
    expect(() => verifyPhaseOneRollbackReadback({ binding: { ...state.binding, rollbackEnvironmentId: "staging" },
      baseline: state.baseline, candidate: state.candidate, restored: state.restored })).toThrow("PHASE_ONE_REHEARSAL_MUST_BE_ISOLATED");
    const envelope = signPhaseOneRollbackProof(state.rollback, signer);
    const restored = verifyPhaseOneRollbackProof(JSON.parse(JSON.stringify(envelope)), trustedVerifiers);
    expect((await decidePhaseOneRelease({ ...state.decisionInput, rollback: restored })).status).toBe("approved_for_exact_deployment");
    expect(() => verifyPhaseOneRollbackProof(envelope, [])).toThrow("PHASE_ONE_VERIFIER_NOT_TRUSTED");
    expect(() => verifyPhaseOneRollbackProof({ ...envelope, proof: { ...envelope.proof, bindingDigest: hash("other") } }, trustedVerifiers))
      .toThrow("PHASE_ONE_SIGNATURE_INVALID");
  });

  it("requires actual rollback readbacks and explicit scoped human delegation", async () => {
    const state = await releaseSetup();
    expect(() => verifyPhaseOneRollbackReadback({ binding: state.binding, baseline: { ...state.baseline }, candidate: state.candidate, restored: state.restored }))
      .toThrow("PHASE_ONE_RUNTIME_READBACK_NOT_LIVE");
    await expect(decidePhaseOneRelease({ ...state.decisionInput, authority: { ...state.authority, async readAuthorization() { return null; } } }))
      .rejects.toThrow("PHASE_ONE_EXACT_AUTHORIZATION_REQUIRED");
    const decision = await decidePhaseOneRelease(state.decisionInput);
    expect(decision.status).toBe("approved_for_exact_deployment");
    await expect(verifyPhaseOneDeploymentReadback({ decision, datasetId: state.dataset.datasetId, now: time, authority: state.authority, runtime: state.runtime }))
      .rejects.toThrow("PHASE_ONE_DEPLOYMENT_NOT_LOADED");
    const deployed = await verifyPhaseOneDeploymentReadback({ decision, datasetId: state.dataset.datasetId, now: time, authority: state.authority,
      runtime: { async readLoadedConfiguration() { return { ...state.snapshot("candidate", time), targetEnvironmentId: "staging" }; } } });
    expect(deployed.status).toBe("verified_loaded_configuration");
  });

  it("invalidates changed candidate, scope, exposure, revoked approval and self-review", async () => {
    const state = await releaseSetup();
    const changed: PhaseOneComparison = freezePhaseOneComparison({ ...state.comparison, candidate: { ...state.comparison.candidate, parameters: { changed: true } } });
    await expect(decidePhaseOneRelease({ ...state.decisionInput, comparison: changed })).rejects.toThrow("PHASE_ONE_RELEASE_BINDING_STALE");
    await expect(decidePhaseOneRelease({ ...state.decisionInput, binding: { ...state.binding, targetEnvironmentId: "production" } })).rejects.toThrow("PHASE_ONE_VERIFIED_ROLLBACK_REQUIRED");
    await expect(decidePhaseOneRelease({ ...state.decisionInput, authority: { ...state.authority, async readExposureDigest() { return hash("later-exposure"); } } }))
      .rejects.toThrow("PHASE_ONE_EXPOSURE_CHANGED");
    await expect(decidePhaseOneRelease({ ...state.decisionInput, authority: { ...state.authority, async readAuthorization() { return { ...state.authorization, revokedAt: time }; } } }))
      .rejects.toThrow("PHASE_ONE_EXACT_AUTHORIZATION_REQUIRED");
    await expect(decidePhaseOneRelease({ ...state.decisionInput, authority: { ...state.authority, async readAuthorization() { return { ...state.authorization, reviewer: { actorId: "generator-1", kind: "codex" } }; } } }))
      .rejects.toThrow("PHASE_ONE_RELEASE_REVIEWER_NOT_INDEPENDENT");
  });

  it("invalidates withdrawn judgment snapshots and persists exact independent release decisions", async () => {
    const state = await releaseSetup();
    await expect(decidePhaseOneRelease({ ...state.decisionInput, authority: { ...state.authority,
      async readJudgmentContextDigest() { return hash("withdrawn-human-review"); } } })).rejects.toThrow("PHASE_ONE_JUDGMENT_CONTEXT_STALE");
    const decision = await decidePhaseOneRelease(state.decisionInput);
    const releaseSigner = { ...signer, executorId: "codex-release-1" };
    const envelope = signPhaseOneReleaseDecision(decision, releaseSigner);
    const recovered = verifyPhaseOneReleaseDecision(JSON.parse(JSON.stringify(envelope)), [{ ...trustedVerifiers[0]!, executorId: "codex-release-1" }]);
    await expect(verifyPhaseOneDeploymentReadback({ decision: recovered, datasetId: state.dataset.datasetId, now: time,
      authority: { ...state.authority, async readJudgmentContextDigest() { return hash("revoked-after-approval"); } }, runtime: state.runtime }))
      .rejects.toThrow("PHASE_ONE_JUDGMENT_CONTEXT_STALE");
    await expect(verifyPhaseOneDeploymentReadback({ decision: recovered, datasetId: state.dataset.datasetId, now: time,
      authority: state.authority, runtime: { async readLoadedConfiguration() { return { ...state.snapshot("candidate", time), targetEnvironmentId: "staging", taskConfigurationDigest: hash("wrong-model") }; } } }))
      .rejects.toThrow("PHASE_ONE_DEPLOYMENT_NOT_LOADED");
  });

  it("rechecks revocation after awaiting a live runtime response", async () => {
    const state = await releaseSetup(); let revoked = false;
    const authority: PhaseOneReleaseAuthority = { ...state.authority, async readAuthorization() {
      return { ...state.authorization, revokedAt: revoked ? time : null };
    } };
    await expect(decidePhaseOneRelease({ ...state.decisionInput, authority, runtime: { async readLoadedConfiguration() {
      revoked = true; return state.runtime.readLoadedConfiguration("staging");
    } } })).rejects.toThrow("PHASE_ONE_AUTHORIZATION_STALE");
    revoked = false;
    const decision = await decidePhaseOneRelease({ ...state.decisionInput, authority });
    await expect(verifyPhaseOneDeploymentReadback({ decision, datasetId: state.dataset.datasetId, now: time, authority,
      runtime: { async readLoadedConfiguration() { revoked = true; return { ...state.snapshot("candidate", time), targetEnvironmentId: "staging" }; } } }))
      .rejects.toThrow("PHASE_ONE_AUTHORIZATION_STALE");
  });

  it("cannot turn deterministic fixture verification into model release authority", async () => {
    const state = await releaseSetup(), execute = state.executor.execute;
    const report = await state.run({ executor: { executorId: "executor-1", async execute(request) { return { ...await execute(request), providerKind: "deterministic_fake" }; } } });
    const verification = signPhaseOneVerificationReport(report, signer);
    await expect(decidePhaseOneRelease({ ...state.decisionInput, verification,
      binding: { ...state.binding, verificationReportDigest: report.contentDigest } })).rejects.toThrow("PHASE_ONE_RELEASE_GATES_NOT_PASSED");
  });
});
