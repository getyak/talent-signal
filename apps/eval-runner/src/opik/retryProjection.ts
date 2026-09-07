import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  assertValidRunManifest,
  assertValidGate,
  digestCanonicalJson,
  digestContentDocument,
  type EvaluationGateResultV1,
  type EvaluationRunManifestV1,
  type EvaluationScoreV1,
  type SafeEvaluationTraceV1,
} from "@talent-signal/evaluation";

import { ProjectionLedger, type ProjectionLedgerEventV1 } from "../projectionLedger.js";
import { projectSafeScore, projectSafeTerminal, projectSafeTrace, SAFE_EXPORT_POLICY_VERSION } from "../safeExportPolicy.js";
import { opikFailureReason, type OpikProjectionTransport } from "./opikTransport.js";

/** Export only the captured completion. There is deliberately no dispatcher or repository loader here. */
export async function retryOpikProjection(input: {
  runId: string;
  artifactDirectory: string;
  projectName: string;
  ownerControlledInstance: boolean;
  ledger: ProjectionLedger;
  transport: OpikProjectionTransport;
}) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(input.runId)) throw new Error("INVALID_RUN_ID");
  return input.ledger.withProjectionLock(`opik:${input.runId}`, () => retryUnlocked(input));
}

async function retryUnlocked(input: Parameters<typeof retryOpikProjection>[0]) {
  const projectionId = `opik:${input.runId}`;
  const envelope = await input.ledger.readEnvelope(projectionId);
  const previous = await input.ledger.latestEvent(projectionId);
  if (!previous || envelope.runId !== input.runId || envelope.projectName !== input.projectName ||
    envelope.policyVersion !== SAFE_EXPORT_POLICY_VERSION) throw new Error("OPIK_RETRY_IDENTITY_MISMATCH");
  if (envelope.dataClass === "prohibited_export" ||
    (envelope.dataClass === "synthetic_restricted" && !input.ownerControlledInstance)) {
    throw new Error("OPIK_RETRY_EXPORT_NOT_AUTHORIZED");
  }
  const runDirectory = resolve(input.artifactDirectory, "runs", input.runId);
  const completion = JSON.parse(await readFile(resolve(runDirectory, "completion.json"), "utf8")) as {
    runId: string; artifactDigest: string; gateDigest: string;
  };
  if (completion.runId !== input.runId || completion.artifactDigest !== previous.localArtifactDigest) {
    throw new Error("OPIK_RETRY_LOCAL_ARTIFACT_MISMATCH");
  }
  const artifact = JSON.parse(await readFile(resolve(runDirectory,
    `run-artifact.${previous.localArtifactDigest.slice(7)}.json`), "utf8")) as {
      manifest: EvaluationRunManifestV1; gate: EvaluationGateResultV1;
      traces: SafeEvaluationTraceV1[]; recordedScores: EvaluationScoreV1[];
    };
  assertValidRunManifest(artifact.manifest);
  assertValidGate(artifact.gate);
  const expectedTraces = artifact.traces.map(projectSafeTrace);
  const expectedScores = artifact.gate.scores.map(projectSafeScore);
  if (digestCanonicalJson(artifact) !== previous.localArtifactDigest ||
    artifact.manifest.contentDigest !== envelope.manifestDigest ||
    artifact.manifest.contentDigest !== digestContentDocument(artifact.manifest) ||
    artifact.gate.contentDigest !== completion.gateDigest ||
    artifact.gate.contentDigest !== digestContentDocument(artifact.gate) ||
    artifact.gate.status !== envelope.gateStatus ||
    digestCanonicalJson(expectedTraces) !== digestCanonicalJson(envelope.trace) ||
    digestCanonicalJson(expectedScores) !== digestCanonicalJson(envelope.scores)) {
    throw new Error("OPIK_RETRY_LOCAL_ARTIFACT_MISMATCH");
  }
  if (!envelope.terminalStatus || !envelope.terminalReasonCode || !envelope.gateStatus) {
    throw new Error("OPIK_RETRY_COMPLETED_ENVELOPE_REQUIRED");
  }
  const terminal = projectSafeTerminal({
    status: envelope.terminalStatus, reasonCode: envelope.terminalReasonCode, gateStatus: envelope.gateStatus,
  });
  if (await input.ledger.hasDeletionReceipt(projectionId)) throw new Error("OPIK_RETRY_DELETED_PROJECTION");
  if (previous.status === "succeeded" && previous.reasonCode === "PROJECTION_COMPLETE") {
    return { receipt: input.ledger.toProjectionReceipt(previous), newModelCalls: 0, reusedCompletion: true };
  }
  let eventInput = {
    projectionId, runId: input.runId, destination: "opik", idempotencyKey: previous.idempotencyKey,
    attemptNumber: previous.attemptNumber + 1, policyVersion: previous.policyVersion,
    envelopeDigest: previous.envelopeDigest, localArtifactDigest: previous.localArtifactDigest,
  } as Omit<ProjectionLedgerEventV1, "schemaVersion" | "eventId" | "sequence" | "recordedAt" | "contentDigest" | "status" | "reasonCode">;
  await input.ledger.appendEvent({ ...eventInput, status: "pending", reasonCode: "PROJECTION_RETRY_PENDING" });
  let event: ProjectionLedgerEventV1;
  try {
    const started = await input.transport.beginProjection(envelope, async (target) => {
      eventInput = { ...eventInput, externalId: target.externalId, remoteDatasetVersionId: target.datasetVersionId,
        experimentId: target.experimentId, experimentItemId: target.experimentItemId };
      await input.ledger.appendEvent({ ...eventInput, status: "pending", reasonCode: "PROJECTION_TARGET_RESERVED" });
    });
    eventInput = { ...eventInput, externalId: started.externalId, remoteDatasetVersionId: started.datasetVersionId,
      experimentId: started.experimentId, experimentItemId: started.experimentItemId };
    await input.ledger.appendEvent({ ...eventInput, status: "pending", reasonCode: "PROJECTION_STARTED" });
    for (const trace of envelope.trace) await input.transport.recordTrace(started.externalId, trace);
    await input.transport.recordScores(started.externalId, envelope.scores);
    await input.transport.completeProjection(started.externalId, terminal);
    event = await input.ledger.appendEvent({ ...eventInput, status: "succeeded", reasonCode: "PROJECTION_COMPLETE" });
  } catch (error) {
    event = await input.ledger.appendEvent({ ...eventInput, status: "failed", reasonCode: opikFailureReason(error, "OPIK_EXPORT_FAILED") });
  }
  return { receipt: input.ledger.toProjectionReceipt(event), newModelCalls: 0, reusedCompletion: false };
}
