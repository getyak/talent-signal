import { sign, verify } from "node:crypto";
import { canonicalJson } from "./canonicalJson.js";
import type { Sha256Digest } from "./contracts.js";
import { digestCanonicalJson, hasValidSha256Format, withContentDigest } from "./digest.js";
import { assertPhaseOneDigest, phaseOneAssert, phaseOneFreeze, phaseOneId, phaseOneTime, type PhaseOneDataset } from "./phaseOneDataset.js";
import { assertPhaseOneExecutedReport, type PhaseOneComparison, type PhaseOneReport } from "./phaseOneEvaluation.js";

export interface PhaseOneVerificationEnvelope {
  schemaVersion: "phase-one-verification-envelope.v1";
  keyId: string;
  executorId: string;
  report: PhaseOneReport;
  signature: string;
}

/** Keys are host/controller configuration, never read from an experiment artifact. */
export interface PhaseOneTrustedVerifier {
  keyId: string;
  executorId: string;
  publicKeyPem: string;
}

function verificationPayload(envelope: Omit<PhaseOneVerificationEnvelope, "signature">): Buffer {
  return Buffer.from(canonicalJson(envelope), "utf8");
}

/** The isolated executor signs only a report it actually executed. */
export function signPhaseOneVerificationReport(report: PhaseOneReport, signer: {
  keyId: string; executorId: string; privateKeyPem: string;
}): PhaseOneVerificationEnvelope {
  assertPhaseOneExecutedReport(report);
  phaseOneId(signer.keyId); phaseOneId(signer.executorId);
  phaseOneAssert(report.mode === "independent_verification" && report.executorId === signer.executorId, "PHASE_ONE_SIGNER_NOT_EXECUTOR");
  const payload = { schemaVersion: "phase-one-verification-envelope.v1" as const, keyId: signer.keyId, executorId: signer.executorId, report };
  return phaseOneFreeze({ ...payload, signature: sign(null, verificationPayload(payload), signer.privateKeyPem).toString("base64") });
}

/** Supports a durable independent process receipt without trusting file-supplied keys. */
export function verifyPhaseOneVerificationReport(envelope: PhaseOneVerificationEnvelope,
  trustedVerifiers: readonly PhaseOneTrustedVerifier[]): PhaseOneReport {
  const trusted = trustedVerifiers.find((item) => item.keyId === envelope.keyId && item.executorId === envelope.executorId);
  phaseOneAssert(trusted && envelope.schemaVersion === "phase-one-verification-envelope.v1", "PHASE_ONE_VERIFIER_NOT_TRUSTED");
  const { signature, ...payload } = envelope;
  phaseOneAssert(typeof signature === "string" && /^[A-Za-z0-9+/]+={0,2}$/.test(signature), "PHASE_ONE_SIGNATURE_INVALID");
  phaseOneAssert(verify(null, verificationPayload(payload), trusted.publicKeyPem, Buffer.from(signature, "base64")), "PHASE_ONE_SIGNATURE_INVALID");
  assertPhaseOneDigest(envelope.report);
  phaseOneAssert(envelope.report.executorId === trusted.executorId && envelope.report.mode === "independent_verification", "PHASE_ONE_VERIFICATION_MODE_INVALID");
  assertCurrentReportMetrics(envelope.report);
  return phaseOneFreeze(envelope.report);
}

/** A valid old signature cannot supply the atomic metrics required by this release contract. */
function assertCurrentReportMetrics(report: PhaseOneReport): void {
  const fail = "PHASE_ONE_REPORT_METRICS_INVALID";
  phaseOneAssert(report.schemaVersion === "phase-one-report.v1" && report.metrics?.schemaVersion === "phase-one-metrics.v1"
    && Array.isArray(report.metrics.criteria) && Array.isArray(report.attempts) && report.attempts.length > 0, fail);
  const ids = new Set(report.attempts.flatMap(attempt => attempt.observations.map(item => item.criterionId)));
  phaseOneAssert(ids.size > 0 && report.metrics.criteria.length === ids.size
    && new Set(report.metrics.criteria.map(item => item.criterionId)).size === ids.size
    && report.metrics.criteria.every(item => ids.has(item.criterionId)), fail);
  const count = (value: number) => Number.isSafeInteger(value) && value >= 0;
  for (const criterion of report.metrics.criteria) {
    for (const variant of ["baseline", "candidate"] as const) {
      const observations = report.attempts.filter(attempt => attempt.variant === variant)
        .flatMap(attempt => attempt.observations.filter(item => item.criterionId === criterion.criterionId));
      const metric = criterion[variant];
      const passed = observations.filter(item => item.status === "pass").length;
      const unknown = observations.filter(item => !["pass", "fail"].includes(item.status)).length;
      phaseOneAssert(observations.every(item => item.category === criterion.category && item.critical === criterion.critical)
        && metric?.numerator === passed && metric.denominator === observations.length && metric.unknown === unknown
        && metric.value === (observations.length ? passed / observations.length : null), fail);
    }
    const paired = criterion.paired;
    phaseOneAssert(paired && [paired.wins, paired.regressions, paired.ties, paired.unknown, paired.denominator].every(count)
      && paired.denominator === criterion.baseline.denominator
      && paired.wins + paired.regressions + paired.ties + paired.unknown === paired.denominator, fail);
  }
  for (const variant of ["baseline", "candidate", "judges"] as const) {
    const usage = report.metrics.usage?.[variant];
    for (const name of ["inputTokens", "outputTokens", "costUsd", "durationMs"] as const) {
      const metric = usage?.[name];
      phaseOneAssert(metric && Number.isFinite(metric.numerator) && metric.numerator >= 0
        && count(metric.denominator) && count(metric.unknown) && metric.unknown <= metric.denominator
        && (variant === "judges" || metric.denominator === report.attempts.filter(attempt => attempt.variant === variant).length)
        && metric.value === (metric.unknown > 0 || metric.denominator === 0 ? null : metric.numerator), fail);
    }
  }
}

export interface PhaseOneReleaseBinding {
  candidateDigest: Sha256Digest;
  baselineDigest: Sha256Digest;
  datasetDigest: Sha256Digest;
  rubricDigest: Sha256Digest;
  environmentDigest: Sha256Digest;
  exposureDigest: Sha256Digest;
  comparisonDigest: Sha256Digest;
  verificationReportDigest: Sha256Digest;
  targetEnvironmentId: string;
  /** A separate authorized rehearsal environment; target stays on baseline until approved. */
  rollbackEnvironmentId: string;
  /** Digest of the exact candidate catalogue expected from the running product. */
  candidateRuntimeDigest: Sha256Digest;
  baselineRuntimeDigest: Sha256Digest;
  candidateApplicationRevision: string;
  baselineApplicationRevision: string;
  candidateBuildDigest: Sha256Digest;
  baselineBuildDigest: Sha256Digest;
  /** Actual rollout/workspace scope, separate from the dataset access exposure ledger. */
  deploymentExposureDigest: Sha256Digest;
}

export interface PhaseOneRuntimeReadback {
  targetEnvironmentId: string;
  runtimeDigest: Sha256Digest;
  /** Exact evaluated task configuration, derived by the running product from loaded model/prompt/policy. */
  taskConfigurationDigest: Sha256Digest;
  buildSourceDigest: Sha256Digest;
  deploymentExposureDigest: Sha256Digest;
  applicationRevision: string;
  processInstanceId: string;
  configurationInitializedAt: string;
  observedAt: string;
}

export interface PhaseOneRuntimeReader {
  /** Must fetch from the authenticated target; no artifact-file fallback. */
  readLoadedConfiguration(targetEnvironmentId: string): Promise<PhaseOneRuntimeReadback>;
}

export interface PhaseOneRuntimeSnapshot extends PhaseOneRuntimeReadback {
  schemaVersion: "phase-one-runtime-readback.v1";
  contentDigest: Sha256Digest;
}

type RuntimeSnapshot = PhaseOneRuntimeSnapshot;
const liveReadbacks = new WeakSet<RuntimeSnapshot>();

/** Mint readback evidence only from a trusted live product adapter. */
export async function readPhaseOneRuntime(targetEnvironmentId: string, reader: PhaseOneRuntimeReader): Promise<RuntimeSnapshot> {
  phaseOneId(targetEnvironmentId);
  const readback = await reader.readLoadedConfiguration(targetEnvironmentId);
  phaseOneAssert(readback.targetEnvironmentId === targetEnvironmentId, "PHASE_ONE_RUNTIME_TARGET_MISMATCH");
  phaseOneId(readback.applicationRevision); phaseOneId(readback.processInstanceId);
  phaseOneAssert(hasValidSha256Format(readback.runtimeDigest) && hasValidSha256Format(readback.taskConfigurationDigest)
    && hasValidSha256Format(readback.buildSourceDigest) && hasValidSha256Format(readback.deploymentExposureDigest), "PHASE_ONE_RUNTIME_DIGEST_INVALID");
  phaseOneAssert(phaseOneTime(readback.observedAt) >= phaseOneTime(readback.configurationInitializedAt), "PHASE_ONE_RUNTIME_TIME_INVALID");
  const receipt = phaseOneFreeze(withContentDigest({ schemaVersion: "phase-one-runtime-readback.v1" as const, ...readback }));
  liveReadbacks.add(receipt);
  return receipt;
}

export interface PhaseOneRuntimeEnvelope {
  schemaVersion: "phase-one-runtime-envelope.v1";
  keyId: string;
  executorId: string;
  snapshot: PhaseOneRuntimeSnapshot;
  signature: string;
}

export function signPhaseOneRuntimeReadback(snapshot: PhaseOneRuntimeSnapshot, signer: {
  keyId: string; executorId: string; privateKeyPem: string;
}): PhaseOneRuntimeEnvelope {
  phaseOneAssert(liveReadbacks.has(snapshot), "PHASE_ONE_RUNTIME_READBACK_NOT_LIVE");
  const payload = { schemaVersion: "phase-one-runtime-envelope.v1" as const, keyId: signer.keyId, executorId: signer.executorId, snapshot };
  return phaseOneFreeze({ ...payload, signature: sign(null, Buffer.from(canonicalJson(payload)), signer.privateKeyPem).toString("base64") });
}

export function verifyPhaseOneRuntimeReadback(envelope: PhaseOneRuntimeEnvelope, trustedVerifiers: readonly PhaseOneTrustedVerifier[]): PhaseOneRuntimeSnapshot {
  const trusted = trustedVerifiers.find(item => item.keyId === envelope.keyId && item.executorId === envelope.executorId);
  phaseOneAssert(trusted && envelope.schemaVersion === "phase-one-runtime-envelope.v1", "PHASE_ONE_VERIFIER_NOT_TRUSTED");
  const { signature, ...payload } = envelope;
  phaseOneAssert(typeof signature === "string" && verify(null, Buffer.from(canonicalJson(payload)), trusted.publicKeyPem, Buffer.from(signature, "base64")), "PHASE_ONE_SIGNATURE_INVALID");
  assertPhaseOneDigest(envelope.snapshot);
  const snapshot = phaseOneFreeze(envelope.snapshot); liveReadbacks.add(snapshot); return snapshot;
}

export interface PhaseOneRollbackProof {
  schemaVersion: "phase-one-rollback-proof.v1";
  bindingDigest: Sha256Digest;
  baseline: RuntimeSnapshot;
  candidate: RuntimeSnapshot;
  restored: RuntimeSnapshot;
  contentDigest: Sha256Digest;
}

const rollbackProofs = new WeakSet<PhaseOneRollbackProof>();

/** Calls/builds/Opik labels are insufficient: all three states require readback. */
export function verifyPhaseOneRollbackReadback(input: {
  binding: PhaseOneReleaseBinding;
  baseline: RuntimeSnapshot;
  candidate: RuntimeSnapshot;
  restored: RuntimeSnapshot;
}): PhaseOneRollbackProof {
  const { binding, baseline, candidate, restored } = input;
  phaseOneId(binding.targetEnvironmentId); phaseOneId(binding.rollbackEnvironmentId);
  phaseOneAssert(binding.rollbackEnvironmentId !== binding.targetEnvironmentId, "PHASE_ONE_REHEARSAL_MUST_BE_ISOLATED");
  for (const snapshot of [baseline, candidate, restored]) {
    phaseOneAssert(liveReadbacks.has(snapshot), "PHASE_ONE_RUNTIME_READBACK_NOT_LIVE");
    assertPhaseOneDigest(snapshot);
    phaseOneAssert(snapshot.targetEnvironmentId === binding.rollbackEnvironmentId, "PHASE_ONE_ROLLBACK_ENVIRONMENT_MISMATCH");
  }
  phaseOneAssert(baseline.runtimeDigest === binding.baselineRuntimeDigest && candidate.runtimeDigest === binding.candidateRuntimeDigest
    && restored.runtimeDigest === binding.baselineRuntimeDigest, "PHASE_ONE_ROLLBACK_CONFIGURATION_MISMATCH");
  phaseOneAssert(baseline.taskConfigurationDigest === binding.baselineDigest && candidate.taskConfigurationDigest === binding.candidateDigest
    && restored.taskConfigurationDigest === binding.baselineDigest, "PHASE_ONE_ROLLBACK_TASK_CONFIGURATION_MISMATCH");
  phaseOneAssert(baseline.applicationRevision === binding.baselineApplicationRevision && candidate.applicationRevision === binding.candidateApplicationRevision
    && baseline.buildSourceDigest === binding.baselineBuildDigest && candidate.buildSourceDigest === binding.candidateBuildDigest
    && restored.buildSourceDigest === binding.baselineBuildDigest, "PHASE_ONE_ROLLBACK_BUILD_MISMATCH");
  phaseOneAssert(baseline.applicationRevision === restored.applicationRevision, "PHASE_ONE_ROLLBACK_REVISION_MISMATCH");
  phaseOneAssert(phaseOneTime(baseline.observedAt) < phaseOneTime(candidate.observedAt)
    && phaseOneTime(candidate.observedAt) < phaseOneTime(restored.observedAt), "PHASE_ONE_ROLLBACK_ORDER_INVALID");
  phaseOneAssert(new Set([baseline.processInstanceId, candidate.processInstanceId, restored.processInstanceId]).size === 3,
    "PHASE_ONE_ROLLBACK_PROCESS_NOT_RELOADED");
  const proof = phaseOneFreeze(withContentDigest({ schemaVersion: "phase-one-rollback-proof.v1" as const,
    bindingDigest: digestCanonicalJson(binding), baseline, candidate, restored }));
  rollbackProofs.add(proof);
  return proof;
}

export interface PhaseOneRollbackEnvelope {
  schemaVersion: "phase-one-rollback-envelope.v1";
  keyId: string;
  executorId: string;
  proof: PhaseOneRollbackProof;
  signature: string;
}

/** Persist rehearsal proof across processes; keys belong to the independent controller. */
export function signPhaseOneRollbackProof(proof: PhaseOneRollbackProof, signer: {
  keyId: string; executorId: string; privateKeyPem: string;
}): PhaseOneRollbackEnvelope {
  phaseOneAssert(rollbackProofs.has(proof), "PHASE_ONE_VERIFIED_ROLLBACK_REQUIRED");
  assertPhaseOneDigest(proof); phaseOneId(signer.keyId); phaseOneId(signer.executorId);
  const payload = { schemaVersion: "phase-one-rollback-envelope.v1" as const, keyId: signer.keyId, executorId: signer.executorId, proof };
  return phaseOneFreeze({ ...payload, signature: sign(null, Buffer.from(canonicalJson(payload)), signer.privateKeyPem).toString("base64") });
}

export function verifyPhaseOneRollbackProof(envelope: PhaseOneRollbackEnvelope,
  trustedVerifiers: readonly PhaseOneTrustedVerifier[]): PhaseOneRollbackProof {
  const trusted = trustedVerifiers.find((item) => item.keyId === envelope.keyId && item.executorId === envelope.executorId);
  phaseOneAssert(trusted && envelope.schemaVersion === "phase-one-rollback-envelope.v1", "PHASE_ONE_VERIFIER_NOT_TRUSTED");
  const { signature, ...payload } = envelope;
  phaseOneAssert(typeof signature === "string" && /^[A-Za-z0-9+/]+={0,2}$/.test(signature)
    && verify(null, Buffer.from(canonicalJson(payload)), trusted.publicKeyPem, Buffer.from(signature, "base64")), "PHASE_ONE_SIGNATURE_INVALID");
  assertPhaseOneDigest(envelope.proof);
  const proof = phaseOneFreeze(envelope.proof);
  rollbackProofs.add(proof);
  return proof;
}

export interface PhaseOneReleaseAuthorization {
  authorizationId: string;
  /** Actor provenance is supplied by the authenticated controller, not model output. */
  reviewer: { actorId: string; kind: "codex" | "human" };
  humanDelegatorId: string;
  bindingDigest: Sha256Digest;
  allowedAction: "deploy_candidate";
  grantedAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface PhaseOneReleaseAuthority {
  /** Resolve a human decision/delegation in trusted storage; absence fails closed. */
  readAuthorization(authorizationId: string): Promise<PhaseOneReleaseAuthorization | null>;
  /** Read the current access ledger, not the run's historical snapshot. */
  readExposureDigest(datasetId: string): Promise<Sha256Digest>;
  /** Current human decisions / calibrated judge assurance, including withdrawals. */
  readJudgmentContextDigest(): Promise<Sha256Digest>;
}

export interface PhaseOneReleaseDecision {
  schemaVersion: "phase-one-release-decision.v1";
  status: "approved_for_exact_deployment";
  authorizationId: string;
  reviewerId: string;
  binding: PhaseOneReleaseBinding;
  rollbackProofDigest: Sha256Digest;
  judgmentContextDigest: Sha256Digest;
  baselineReadbackDigest: Sha256Digest;
  approvedAt: string;
  expiresAt: string;
  contentDigest: Sha256Digest;
}

const releaseDecisions = new WeakSet<PhaseOneReleaseDecision>();

export interface PhaseOneReleaseDecisionEnvelope {
  schemaVersion: "phase-one-release-decision-envelope.v1";
  keyId: string;
  executorId: string;
  decision: PhaseOneReleaseDecision;
  signature: string;
}

export function signPhaseOneReleaseDecision(decision: PhaseOneReleaseDecision, signer: {
  keyId: string; executorId: string; privateKeyPem: string;
}): PhaseOneReleaseDecisionEnvelope {
  phaseOneAssert(releaseDecisions.has(decision) && signer.executorId === decision.reviewerId, "PHASE_ONE_RELEASE_DECISION_NOT_AUTHENTICATED");
  const payload = { schemaVersion: "phase-one-release-decision-envelope.v1" as const, keyId: signer.keyId, executorId: signer.executorId, decision };
  return phaseOneFreeze({ ...payload, signature: sign(null, Buffer.from(canonicalJson(payload)), signer.privateKeyPem).toString("base64") });
}

export function verifyPhaseOneReleaseDecision(envelope: PhaseOneReleaseDecisionEnvelope, trustedVerifiers: readonly PhaseOneTrustedVerifier[]): PhaseOneReleaseDecision {
  const trusted = trustedVerifiers.find(item => item.keyId === envelope.keyId && item.executorId === envelope.executorId);
  phaseOneAssert(trusted && envelope.schemaVersion === "phase-one-release-decision-envelope.v1", "PHASE_ONE_VERIFIER_NOT_TRUSTED");
  const { signature, ...payload } = envelope;
  phaseOneAssert(typeof signature === "string" && verify(null, Buffer.from(canonicalJson(payload)), trusted.publicKeyPem, Buffer.from(signature, "base64")), "PHASE_ONE_SIGNATURE_INVALID");
  assertPhaseOneDigest(envelope.decision);
  phaseOneAssert(envelope.decision.reviewerId === trusted.executorId, "PHASE_ONE_RELEASE_REVIEWER_NOT_INDEPENDENT");
  const decision = phaseOneFreeze(envelope.decision); releaseDecisions.add(decision); return decision;
}

/**
 * This evaluates existing human authorization; it never manufactures approval.
 * Runtime readers and authority stores are trusted application dependencies.
 */
export async function decidePhaseOneRelease(input: {
  comparison: PhaseOneComparison; dataset: PhaseOneDataset; verification: PhaseOneVerificationEnvelope;
  trustedVerifiers: readonly PhaseOneTrustedVerifier[]; binding: PhaseOneReleaseBinding; rollback: PhaseOneRollbackProof;
  authorizationId: string; now: string; authority: PhaseOneReleaseAuthority; runtime: PhaseOneRuntimeReader;
}): Promise<PhaseOneReleaseDecision> {
  const now = phaseOneTime(input.now), binding = phaseOneFreeze(input.binding);
  assertPhaseOneDigest(input.comparison); assertPhaseOneDigest(input.dataset);
  const report = verifyPhaseOneVerificationReport(input.verification, input.trustedVerifiers);
  const comparison = input.comparison, dataset = input.dataset;
  const expected = { candidateDigest: digestCanonicalJson(comparison.candidate), baselineDigest: digestCanonicalJson(comparison.baseline),
    datasetDigest: dataset.contentDigest, rubricDigest: comparison.rubricDigest, environmentDigest: comparison.environmentDigest,
    exposureDigest: dataset.exposureDigest, comparisonDigest: comparison.contentDigest, verificationReportDigest: report.contentDigest };
  for (const [key, value] of Object.entries(expected)) phaseOneAssert(binding[key as keyof typeof expected] === value, "PHASE_ONE_RELEASE_BINDING_STALE");
  phaseOneAssert(comparison.datasetDigest === dataset.contentDigest && report.comparisonDigest === comparison.contentDigest
    && report.datasetDigest === dataset.contentDigest && report.exposureDigest === dataset.exposureDigest, "PHASE_ONE_VERIFICATION_BINDING_MISMATCH");
  phaseOneAssert(report.executorId !== comparison.generatorActorId && comparison.criteria.every((item) => item.evaluatorId !== report.executorId), "PHASE_ONE_VERIFIER_NOT_INDEPENDENT");
  phaseOneAssert(["p0", "held_out", "red_team"].every((partition) => dataset.cases.some((item) => item.sourcePartition === partition))
    && dataset.cases.every((item) => item.currentPurpose === "final_verification" && item.sourcePartition !== "dev"), "PHASE_ONE_RELEASE_PARTITION_COVERAGE_MISSING");
  phaseOneAssert(comparison.criteria.some((item) => item.category === "deterministic_boundary" && item.critical), "PHASE_ONE_CRITICAL_BOUNDARY_REQUIRED");
  phaseOneAssert(!report.safetyVeto && report.paired.regressions === 0 && report.paired.unknown === 0
    && report.candidate.unknown === 0 && [report.categories.execution_integrity, report.categories.deterministic_boundary, report.categories.semantic_quality].every((status) => status === "pass"),
    "PHASE_ONE_RELEASE_GATES_NOT_PASSED");
  phaseOneAssert(report.attempts.length === dataset.cases.length * comparison.repetitions * 2
    && report.attempts.every((item) => item.providerKind === "real_model"), "PHASE_ONE_REAL_VERIFICATION_REQUIRED");
  phaseOneAssert(rollbackProofs.has(input.rollback) && input.rollback.bindingDigest === digestCanonicalJson(binding), "PHASE_ONE_VERIFIED_ROLLBACK_REQUIRED");
  assertPhaseOneDigest(input.rollback);
  phaseOneAssert(binding.rollbackEnvironmentId !== binding.targetEnvironmentId
    && [input.rollback.baseline, input.rollback.candidate, input.rollback.restored].every((item) => item.targetEnvironmentId === binding.rollbackEnvironmentId),
    "PHASE_ONE_REHEARSAL_MUST_BE_ISOLATED");
  const authorization = await input.authority.readAuthorization(input.authorizationId);
  phaseOneAssert(authorization && authorization.authorizationId === input.authorizationId && authorization.allowedAction === "deploy_candidate"
    && authorization.bindingDigest === digestCanonicalJson(binding) && authorization.revokedAt === null, "PHASE_ONE_EXACT_AUTHORIZATION_REQUIRED");
  phaseOneId(authorization.humanDelegatorId); phaseOneId(authorization.reviewer.actorId);
  phaseOneAssert(["codex", "human"].includes(authorization.reviewer.kind) && authorization.reviewer.actorId !== comparison.generatorActorId
    && comparison.criteria.every((item) => item.evaluatorId !== authorization.reviewer.actorId)
    && authorization.reviewer.actorId !== report.executorId, "PHASE_ONE_RELEASE_REVIEWER_NOT_INDEPENDENT");
  phaseOneAssert(phaseOneTime(authorization.grantedAt) <= now && phaseOneTime(authorization.expiresAt) > now, "PHASE_ONE_AUTHORIZATION_EXPIRED");
  phaseOneAssert(await input.authority.readExposureDigest(dataset.datasetId) === dataset.exposureDigest, "PHASE_ONE_EXPOSURE_CHANGED");
  phaseOneAssert(await input.authority.readJudgmentContextDigest() === report.judgmentContextDigest, "PHASE_ONE_JUDGMENT_CONTEXT_STALE");
  const baseline = await readPhaseOneRuntime(binding.targetEnvironmentId, input.runtime);
  phaseOneAssert(baseline.runtimeDigest === binding.baselineRuntimeDigest && baseline.taskConfigurationDigest === binding.baselineDigest
    && baseline.applicationRevision === binding.baselineApplicationRevision && baseline.buildSourceDigest === binding.baselineBuildDigest
    && baseline.deploymentExposureDigest === binding.deploymentExposureDigest
    && baseline.applicationRevision === input.rollback.restored.applicationRevision, "PHASE_ONE_DEPLOYMENT_BASELINE_CHANGED");
  phaseOneAssert(Math.abs(phaseOneTime(baseline.observedAt) - now) <= 60_000, "PHASE_ONE_RUNTIME_READBACK_STALE");
  phaseOneAssert(digestCanonicalJson(await input.authority.readAuthorization(input.authorizationId)) === digestCanonicalJson(authorization)
    && phaseOneTime(authorization.expiresAt) > phaseOneTime(baseline.observedAt), "PHASE_ONE_AUTHORIZATION_STALE");
  phaseOneAssert(await input.authority.readExposureDigest(dataset.datasetId) === dataset.exposureDigest, "PHASE_ONE_EXPOSURE_CHANGED");
  phaseOneAssert(await input.authority.readJudgmentContextDigest() === report.judgmentContextDigest, "PHASE_ONE_JUDGMENT_CONTEXT_STALE");
  const decision = phaseOneFreeze(withContentDigest({ schemaVersion: "phase-one-release-decision.v1" as const,
    status: "approved_for_exact_deployment" as const, authorizationId: authorization.authorizationId, reviewerId: authorization.reviewer.actorId,
    binding, rollbackProofDigest: input.rollback.contentDigest, judgmentContextDigest: report.judgmentContextDigest, baselineReadbackDigest: baseline.contentDigest,
    approvedAt: input.now, expiresAt: authorization.expiresAt }));
  releaseDecisions.add(decision);
  return decision;
}

/** Readback is a separate outcome: authorization does not mean deployment ran. */
export async function verifyPhaseOneDeploymentReadback(input: {
  decision: PhaseOneReleaseDecision; datasetId: string; now: string; authority: PhaseOneReleaseAuthority; runtime: PhaseOneRuntimeReader;
}) {
  phaseOneAssert(releaseDecisions.has(input.decision), "PHASE_ONE_RELEASE_DECISION_NOT_AUTHENTICATED");
  assertPhaseOneDigest(input.decision);
  const authorization = await input.authority.readAuthorization(input.decision.authorizationId);
  phaseOneAssert(authorization?.revokedAt === null && authorization.bindingDigest === digestCanonicalJson(input.decision.binding)
    && phaseOneTime(authorization.expiresAt) > phaseOneTime(input.now), "PHASE_ONE_AUTHORIZATION_STALE");
  phaseOneAssert(await input.authority.readExposureDigest(input.datasetId) === input.decision.binding.exposureDigest, "PHASE_ONE_EXPOSURE_CHANGED");
  phaseOneAssert(await input.authority.readJudgmentContextDigest() === input.decision.judgmentContextDigest, "PHASE_ONE_JUDGMENT_CONTEXT_STALE");
  const readback = await readPhaseOneRuntime(input.decision.binding.targetEnvironmentId, input.runtime);
  phaseOneAssert(readback.runtimeDigest === input.decision.binding.candidateRuntimeDigest
    && readback.taskConfigurationDigest === input.decision.binding.candidateDigest
    && readback.applicationRevision === input.decision.binding.candidateApplicationRevision && readback.buildSourceDigest === input.decision.binding.candidateBuildDigest
    && readback.deploymentExposureDigest === input.decision.binding.deploymentExposureDigest, "PHASE_ONE_DEPLOYMENT_NOT_LOADED");
  phaseOneAssert(phaseOneTime(readback.configurationInitializedAt) >= phaseOneTime(input.decision.approvedAt)
    && Math.abs(phaseOneTime(readback.observedAt) - phaseOneTime(input.now)) <= 60_000, "PHASE_ONE_DEPLOYMENT_READBACK_STALE");
  phaseOneAssert(digestCanonicalJson(await input.authority.readAuthorization(input.decision.authorizationId)) === digestCanonicalJson(authorization)
    && phaseOneTime(authorization.expiresAt) > phaseOneTime(readback.observedAt), "PHASE_ONE_AUTHORIZATION_STALE");
  phaseOneAssert(await input.authority.readExposureDigest(input.datasetId) === input.decision.binding.exposureDigest, "PHASE_ONE_EXPOSURE_CHANGED");
  phaseOneAssert(await input.authority.readJudgmentContextDigest() === input.decision.judgmentContextDigest, "PHASE_ONE_JUDGMENT_CONTEXT_STALE");
  return phaseOneFreeze(withContentDigest({ schemaVersion: "phase-one-deployment-receipt.v1" as const,
    status: "verified_loaded_configuration" as const, decisionDigest: input.decision.contentDigest, readback }));
}
