import {
  canonicalJson,
  DATA_CLASSES,
  digestCanonicalJson,
  EVALUATED_COMPONENTS,
  EXECUTION_MODES,
  GATE_STATUSES,
  SAFE_TRACE_EVENT_KINDS,
  SAFE_TRACE_STATUSES,
  type EvaluationGateResultV1,
  type EvaluationRunManifestV1,
  type EvaluationScenarioV1,
  type EvaluationScoreV1,
  type SafeEvaluationTraceV1,
} from "@talent-signal/evaluation";

import type {
  SafeProjectedScoreV1,
  SafeProjectedTerminalV1,
  SafeProjectionEnvelopeV1,
} from "./contracts.js";

export const SAFE_EXPORT_POLICY_VERSION = "talent-signal-opik-export.v1";

export class ExportPolicyError extends Error {
  readonly reasonCode: string;

  constructor(reasonCode: string, message: string) {
    super(message);
    this.name = "ExportPolicyError";
    this.reasonCode = reasonCode;
  }
}

const FORBIDDEN_KEY =
  /(?:candidate_?name|account_?slug|e-?mail|phone|secret|token|credential|authorization|cookie|raw_?(?:prompt|message|screenshot|resume|payload)|chain_?of_?thought|hidden_?reasoning|absolute_?path)/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE = /(?:\+\d{8,15}\b|\b\d{10,15}\b|\b\d{2,4}[- ().]\d{2,4}[- ().][\d ().-]{3,}\d\b)/;
const ABSOLUTE_PATH = /(?:^|[\s"'])(?:\/[A-Za-z0-9_.-]+\/|[A-Za-z]:\\)/;
const SECRET = /(?:bearer\s+[A-Za-z0-9._~+/=-]+|-----BEGIN [A-Z ]+PRIVATE KEY-----|\b(?:sk|pk|api)[-_][A-Za-z0-9_-]{12,})/i;
const OPAQUE_DIGEST = /^sha256:[a-f0-9]{64}$/;
const OPAQUE_UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const OPAQUE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,199}$/;
const JSON_POINTER = /^(?:\/(?:[A-Za-z0-9_.:~-]+))*$/;
const TERMINAL_STATUSES = ["completed", "cancelled", "timed_out", "crashed", "not_run"] as const;
const EVALUATOR_KINDS = ["deterministic", "human", "model", "outcome"] as const;
const EXPORT_DECISIONS = ["content_allowed", "metadata_only"] as const;

function isMember(value: unknown, values: readonly string[]): value is string {
  return typeof value === "string" && values.includes(value);
}

function assertEnum(value: unknown, values: readonly string[], path: string): asserts value is string {
  if (!isMember(value, values)) throwUnsafe("UNKNOWN_ENUM_VALUE", path);
}

const ALLOWED_TOP_LEVEL_KEYS = new Set<keyof SafeProjectionEnvelopeV1>([
  "schemaVersion",
  "policyVersion",
  "projectName",
  "datasetName",
  "datasetDigest",
  "runId",
  "manifestDigest",
  "scenarioId",
  "scenarioRevision",
  "scenarioDigest",
  "profileId",
  "profileVersion",
  "profileDigest",
  "agentDefinitionId",
  "agentDefinitionVersion",
  "agentDefinitionDigest",
  "attemptId",
  "trialNumber",
  "mode",
  "systemUnderTest",
  "dataClass",
  "exportDecision",
  "terminalStatus",
  "terminalReasonCode",
  "gateStatus",
  "trace",
  "scores",
  "opaqueTraceRef",
]);

export interface SafeExportDecision {
  allowed: boolean;
  mode: "content_allowed" | "metadata_only" | "prohibited";
  reasonCode: string;
}

export function decideExport(
  scenario: EvaluationScenarioV1,
  ownerControlledInstance: boolean,
): SafeExportDecision {
  const { dataClass, projection } = scenario.dataPolicy;
  if (dataClass === "prohibited_export" || projection === "prohibited") {
    return { allowed: false, mode: "prohibited", reasonCode: "PROHIBITED_EXPORT" };
  }
  if (dataClass === "synthetic_shareable") {
    return projection === "synthetic_content_opt_in"
      ? { allowed: true, mode: "content_allowed", reasonCode: "SYNTHETIC_OPT_IN" }
      : { allowed: true, mode: "metadata_only", reasonCode: "METADATA_ONLY" };
  }
  if (dataClass === "synthetic_restricted") {
    return ownerControlledInstance
      ? { allowed: true, mode: "content_allowed", reasonCode: "OWNER_CONTROLLED" }
      : { allowed: false, mode: "prohibited", reasonCode: "OWNER_CONTROL_REQUIRED" };
  }
  return { allowed: true, mode: "metadata_only", reasonCode: "REFERENCE_ONLY" };
}

export function scanSafeExport(value: unknown): void {
  const visit = (candidate: unknown, path: string): void => {
    if (typeof candidate === "string") {
      if (OPAQUE_DIGEST.test(candidate) || OPAQUE_UUID.test(candidate)) return;
      if (EMAIL.test(candidate)) throwUnsafe("IDENTIFIER_EMAIL", path);
      if (PHONE.test(candidate)) throwUnsafe("IDENTIFIER_PHONE", path);
      // A validated JSON Pointer is an artifact-relative locator, not a local
      // filesystem path. Keep the path detector active everywhere else.
      if (!path.endsWith("/jsonPointer") && ABSOLUTE_PATH.test(candidate)) {
        throwUnsafe("ABSOLUTE_LOCAL_PATH", path);
      }
      if (SECRET.test(candidate)) throwUnsafe("SECRET_PATTERN", path);
      return;
    }
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => visit(item, `${path}/${index}`));
      return;
    }
    if (candidate && typeof candidate === "object") {
      for (const [key, item] of Object.entries(candidate)) {
        if (FORBIDDEN_KEY.test(key)) throwUnsafe("FORBIDDEN_FIELD", `${path}/${key}`);
        visit(item, `${path}/${key}`);
      }
    }
  };
  visit(value, "$");
}

function throwUnsafe(reasonCode: string, path: string): never {
  throw new ExportPolicyError(reasonCode, `Unsafe Opik projection field at ${path}`);
}

export function assertSafeOpaqueToken(value: string, path: string): void {
  if (typeof value !== "string" || !OPAQUE_TOKEN.test(value)) {
    throwUnsafe("FREE_FORM_TEXT_NOT_ALLOWED", path);
  }
  scanSafeExport(value);
}

function assertJsonPointer(value: string, path: string): void {
  if (!JSON_POINTER.test(value) || value.length > 500) {
    throwUnsafe("INVALID_EVIDENCE_JSON_POINTER", path);
  }
}

export function projectSafeTrace(trace: SafeEvaluationTraceV1): SafeEvaluationTraceV1 {
  if (trace.schemaVersion !== "safe-evaluation-trace.v1") {
    throwUnsafe("INVALID_TRACE_SCHEMA", "$/schemaVersion");
  }
  assertSafeOpaqueToken(trace.traceId, "$/traceId");
  assertSafeOpaqueToken(trace.attemptId, "$/attemptId");
  assertEnum(trace.eventKind, SAFE_TRACE_EVENT_KINDS, "$/eventKind");
  assertEnum(trace.status, SAFE_TRACE_STATUSES, "$/status");
  assertSafeOpaqueToken(trace.eventKind, "$/eventKind");
  assertSafeOpaqueToken(trace.status, "$/status");
  if (!Number.isInteger(trace.ordinal) || trace.ordinal < 0) {
    throwUnsafe("INVALID_TRACE_ORDINAL", "$/ordinal");
  }
  if (trace.reasonCode !== undefined) assertSafeOpaqueToken(trace.reasonCode, "$/reasonCode");
  if (trace.inputDigest !== undefined && !OPAQUE_DIGEST.test(trace.inputDigest)) {
    throwUnsafe("INVALID_INPUT_DIGEST", "$/inputDigest");
  }
  if (trace.outputDigest !== undefined && !OPAQUE_DIGEST.test(trace.outputDigest)) {
    throwUnsafe("INVALID_OUTPUT_DIGEST", "$/outputDigest");
  }
  if (
    trace.durationMs !== undefined &&
    (!Number.isFinite(trace.durationMs) || trace.durationMs < 0)
  ) {
    throwUnsafe("INVALID_TRACE_DURATION", "$/durationMs");
  }
  const safe = { ...trace };
  scanSafeExport(safe);
  canonicalJson(safe);
  return safe;
}

export function projectSafeScore(score: EvaluationScoreV1): SafeProjectedScoreV1 {
  if (score.schemaVersion !== "evaluation-score.v1") {
    throwUnsafe("INVALID_SCORE_SCHEMA", "$/schemaVersion");
  }
  assertEnum(score.evaluatorKind, EVALUATOR_KINDS, "$/evaluatorKind");
  assertEnum(score.status, GATE_STATUSES, "$/status");
  if (typeof score.gateAuthority !== "boolean" || typeof score.veto !== "boolean") {
    throwUnsafe("INVALID_SCORE_AUTHORITY", "$/gateAuthority");
  }
  if (!Array.isArray(score.evidence)) throwUnsafe("INVALID_SCORE_EVIDENCE", "$/evidence");
  const tokens: Array<[string, string]> = [
    [score.scoreId, "$/scoreId"],
    [score.scenarioId, "$/scenarioId"],
    [score.attemptId, "$/attemptId"],
    [score.capability, "$/capability"],
    [score.criterionId, "$/criterionId"],
    [score.evaluatorId, "$/evaluatorId"],
    [score.evaluatorVersion, "$/evaluatorVersion"],
    [score.evaluatorKind, "$/evaluatorKind"],
    [score.status, "$/status"],
  ];
  for (const [value, path] of tokens) assertSafeOpaqueToken(value, path);
  if (score.reasonCode !== undefined) assertSafeOpaqueToken(score.reasonCode, "$/reasonCode");
  const evidenceLocators = score.evidence.map((locator, index) => {
    assertSafeOpaqueToken(locator.artifactId, `$/evidence/${index}/artifactId`);
    if (locator.sourceRef !== undefined) {
      assertSafeOpaqueToken(locator.sourceRef, `$/evidence/${index}/sourceRef`);
    }
    if (locator.jsonPointer !== undefined) {
      assertJsonPointer(locator.jsonPointer, `$/evidence/${index}/jsonPointer`);
    }
    return {
      artifactId: locator.artifactId,
      ...(locator.jsonPointer === undefined ? {} : { jsonPointer: locator.jsonPointer }),
      ...(locator.sourceRef === undefined ? {} : { sourceRef: locator.sourceRef }),
    };
  });
  const safe: SafeProjectedScoreV1 = {
    scoreId: score.scoreId,
    capability: score.capability,
    criterionId: score.criterionId,
    evaluatorId: score.evaluatorId,
    evaluatorVersion: score.evaluatorVersion,
    evaluatorKind: score.evaluatorKind,
    status: score.status,
    gateAuthority: score.gateAuthority,
    veto: score.veto,
    evidenceLocators,
    semantic: "atomic_criterion",
    aggregateApproval: false,
    ...(score.reasonCode === undefined ? {} : { reasonCode: score.reasonCode }),
  };
  assertSafeProjectedScore(safe);
  return safe;
}

export function assertSafeProjectedScore(score: SafeProjectedScoreV1): void {
  assertEnum(score.evaluatorKind, EVALUATOR_KINDS, "$/evaluatorKind");
  assertEnum(score.status, GATE_STATUSES, "$/status");
  if (typeof score.gateAuthority !== "boolean" || typeof score.veto !== "boolean") {
    throwUnsafe("INVALID_SCORE_AUTHORITY", "$/gateAuthority");
  }
  if (!Array.isArray(score.evidenceLocators)) {
    throwUnsafe("INVALID_SCORE_EVIDENCE", "$/evidenceLocators");
  }
  const tokens: Array<[string, string]> = [
    [score.scoreId, "$/scoreId"],
    [score.capability, "$/capability"],
    [score.criterionId, "$/criterionId"],
    [score.evaluatorId, "$/evaluatorId"],
    [score.evaluatorVersion, "$/evaluatorVersion"],
    [score.evaluatorKind, "$/evaluatorKind"],
    [score.status, "$/status"],
    [score.semantic, "$/semantic"],
  ];
  for (const [value, path] of tokens) assertSafeOpaqueToken(value, path);
  if (score.semantic !== "atomic_criterion" || score.aggregateApproval !== false) {
    throwUnsafe("SCORE_MUST_BE_ATOMIC_NOT_AGGREGATE", "$/semantic");
  }
  if (score.reasonCode !== undefined) assertSafeOpaqueToken(score.reasonCode, "$/reasonCode");
  score.evidenceLocators.forEach((locator, index) => {
    assertSafeOpaqueToken(locator.artifactId, `$/evidenceLocators/${index}/artifactId`);
    if (locator.sourceRef !== undefined) {
      assertSafeOpaqueToken(locator.sourceRef, `$/evidenceLocators/${index}/sourceRef`);
    }
    if (locator.jsonPointer !== undefined) {
      assertJsonPointer(locator.jsonPointer, `$/evidenceLocators/${index}/jsonPointer`);
    }
  });
  scanSafeExport(score);
  canonicalJson(score);
}

export function projectSafeTerminal(terminal: SafeProjectedTerminalV1): SafeProjectedTerminalV1 {
  assertEnum(terminal.status, TERMINAL_STATUSES, "$/status");
  assertEnum(terminal.gateStatus, GATE_STATUSES, "$/gateStatus");
  assertSafeOpaqueToken(terminal.status, "$/status");
  assertSafeOpaqueToken(terminal.reasonCode, "$/reasonCode");
  assertSafeOpaqueToken(terminal.gateStatus, "$/gateStatus");
  return { ...terminal };
}

function assertSafeEnvelope(envelope: SafeProjectionEnvelopeV1): void {
  if (envelope.schemaVersion !== "safe-opik-projection.v1") {
    throwUnsafe("INVALID_ENVELOPE_SCHEMA", "$/schemaVersion");
  }
  assertEnum(envelope.mode, EXECUTION_MODES, "$/mode");
  assertEnum(envelope.dataClass, DATA_CLASSES, "$/dataClass");
  assertEnum(envelope.exportDecision, EXPORT_DECISIONS, "$/exportDecision");
  if (!Array.isArray(envelope.systemUnderTest)) {
    throwUnsafe("INVALID_SYSTEM_UNDER_TEST", "$/systemUnderTest");
  }
  envelope.systemUnderTest.forEach((component, index) =>
    assertEnum(component, EVALUATED_COMPONENTS, `$/systemUnderTest/${index}`),
  );
  if (!Number.isSafeInteger(envelope.trialNumber) || envelope.trialNumber < 1) {
    throwUnsafe("INVALID_TRIAL_NUMBER", "$/trialNumber");
  }
  const tokens = [
    envelope.policyVersion,
    envelope.projectName,
    envelope.datasetName,
    envelope.runId,
    envelope.scenarioId,
    envelope.scenarioRevision,
    envelope.profileId,
    envelope.profileVersion,
    envelope.agentDefinitionId,
    envelope.agentDefinitionVersion,
    envelope.attemptId,
    envelope.mode,
    envelope.dataClass,
    envelope.exportDecision,
    envelope.opaqueTraceRef,
    ...envelope.systemUnderTest,
  ];
  tokens.forEach((value, index) => assertSafeOpaqueToken(value, `$/token/${index}`));
  for (const digest of [
    envelope.datasetDigest,
    envelope.manifestDigest,
    envelope.scenarioDigest,
    envelope.profileDigest,
    envelope.agentDefinitionDigest,
  ]) {
    if (!OPAQUE_DIGEST.test(digest)) throwUnsafe("INVALID_ENVELOPE_DIGEST", "$/digest");
  }
  envelope.trace.forEach(projectSafeTrace);
  envelope.scores.forEach(assertSafeProjectedScore);
  if (envelope.terminalStatus !== undefined) {
    assertEnum(envelope.terminalStatus, TERMINAL_STATUSES, "$/terminalStatus");
    assertSafeOpaqueToken(envelope.terminalStatus, "$/terminalStatus");
  }
  if (envelope.terminalReasonCode !== undefined) {
    assertSafeOpaqueToken(envelope.terminalReasonCode, "$/terminalReasonCode");
  }
  if (envelope.gateStatus !== undefined) {
    assertEnum(envelope.gateStatus, GATE_STATUSES, "$/gateStatus");
    assertSafeOpaqueToken(envelope.gateStatus, "$/gateStatus");
  }
}

export function buildSafeProjectionEnvelope(input: {
  manifest: EvaluationRunManifestV1;
  scenario: EvaluationScenarioV1;
  datasetName: string;
  datasetDigest: `sha256:${string}`;
  projectName: string;
  ownerControlledInstance: boolean;
  trace?: SafeEvaluationTraceV1[];
  gate?: EvaluationGateResultV1;
  terminal?: { status: "completed" | "cancelled" | "timed_out" | "crashed" | "not_run"; reasonCode: string };
}): SafeProjectionEnvelopeV1 {
  const decision = decideExport(input.scenario, input.ownerControlledInstance);
  if (!decision.allowed || decision.mode === "prohibited") {
    throw new ExportPolicyError(decision.reasonCode, "Scenario is not allowed to leave the local evaluation boundary");
  }
  const envelope: SafeProjectionEnvelopeV1 = {
    schemaVersion: "safe-opik-projection.v1",
    policyVersion: SAFE_EXPORT_POLICY_VERSION,
    projectName: input.projectName,
    datasetName: input.datasetName,
    datasetDigest: input.datasetDigest,
    runId: input.manifest.runId,
    manifestDigest: input.manifest.contentDigest,
    scenarioId: input.scenario.scenarioId,
    scenarioRevision: input.scenario.revision,
    scenarioDigest: input.scenario.contentDigest,
    profileId: input.manifest.profile.profileId,
    profileVersion: input.manifest.profile.version,
    profileDigest: input.manifest.profile.contentDigest,
    agentDefinitionId: input.manifest.attempt.agentDefinition.definitionId,
    agentDefinitionVersion: input.manifest.attempt.agentDefinition.version,
    agentDefinitionDigest: input.manifest.attempt.agentDefinition.contentDigest,
    attemptId: input.manifest.attempt.attemptId,
    trialNumber: input.manifest.attempt.trialNumber,
    mode: input.manifest.profile.mode,
    systemUnderTest: [...input.manifest.profile.systemUnderTest],
    dataClass: input.scenario.dataPolicy.dataClass,
    exportDecision: decision.mode,
    trace: input.trace ? input.trace.map(projectSafeTrace) : [],
    scores: input.gate ? input.gate.scores.map(projectSafeScore) : [],
    opaqueTraceRef: `ts-eval:${input.manifest.runId}`,
    ...(input.terminal === undefined
      ? {}
      : {
          terminalStatus: input.terminal.status,
          terminalReasonCode: input.terminal.reasonCode,
        }),
    ...(input.gate === undefined ? {} : { gateStatus: input.gate.status }),
  };
  for (const key of Object.keys(envelope)) {
    if (!ALLOWED_TOP_LEVEL_KEYS.has(key as keyof SafeProjectionEnvelopeV1)) {
      throw new ExportPolicyError("FIELD_NOT_ALLOWLISTED", `Projection field is not allowlisted: ${key}`);
    }
  }
  assertSafeEnvelope(envelope);
  scanSafeExport(envelope);
  canonicalJson(envelope);
  return envelope;
}

export function digestSafeProjection(envelope: SafeProjectionEnvelopeV1) {
  assertSafeEnvelope(envelope);
  scanSafeExport(envelope);
  return digestCanonicalJson(envelope);
}
