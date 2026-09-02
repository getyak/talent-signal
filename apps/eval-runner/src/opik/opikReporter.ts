import {
  digestCanonicalJson,
  digestContentDocument,
  type DeletionReceiptV1,
  type EvaluationGateResultV1,
  type EvaluationReporter,
  type EvaluationRunManifestV1,
  type EvaluationScenarioV1,
  type EvaluationScoreV1,
  type ProjectionReceiptV1,
  type ProjectionReferenceV1,
  type ReporterRunRefV1,
  type SafeEvaluationTraceV1,
  type Sha256Digest,
} from "@talent-signal/evaluation";

import type { SafeProjectionEnvelopeV1 } from "../contracts.js";
import {
  ProjectionLedger,
  projectionIdempotencyKey,
  type ProjectionLedgerEventV1,
} from "../projectionLedger.js";
import {
  buildSafeProjectionEnvelope,
  ExportPolicyError,
  projectSafeScore,
  projectSafeTerminal,
  projectSafeTrace,
  SAFE_EXPORT_POLICY_VERSION,
} from "../safeExportPolicy.js";
import type {
  OpikProjectionDeletionTarget,
  OpikProjectionTransport,
} from "./opikTransport.js";

export interface OpikReporterOptions {
  projectName: string;
  datasetName: string;
  datasetDigest: Sha256Digest;
  scenario: EvaluationScenarioV1;
  ownerControlledInstance: boolean;
  ledger: ProjectionLedger;
  transport: OpikProjectionTransport;
}

interface ActiveProjection {
  manifest: EvaluationRunManifestV1;
  envelope?: SafeProjectionEnvelopeV1;
  projectionId: string;
  idempotencyKey: string;
  attemptNumber: number;
  externalId?: string;
  remoteDatasetVersionId?: string;
  experimentId?: string;
  experimentItemId?: string;
  localArtifactDigest: Sha256Digest;
  failedReasonCode?: string;
  terminalStatus: "completed" | "cancelled" | "timed_out" | "crashed" | "not_run";
  terminalReasonCode: string;
}

export class OpikReporter implements EvaluationReporter {
  private active: ActiveProjection | null = null;
  private localArtifactDigest: Sha256Digest | undefined;

  constructor(private readonly options: OpikReporterOptions) {}

  setLocalArtifactDigest(digest: Sha256Digest): void {
    if (this.active) throw new Error("Local artifact digest must be bound before Opik beginRun");
    this.localArtifactDigest = digest;
  }

  setTerminal(input: {
    status: ActiveProjection["terminalStatus"];
    reasonCode: string;
  }): void {
    if (!this.active) throw new Error("Opik reporter has no active run");
    this.active.terminalStatus = input.status;
    this.active.terminalReasonCode = input.reasonCode;
  }

  async beginRun(manifest: EvaluationRunManifestV1): Promise<ReporterRunRefV1> {
    if (this.active) throw new Error("Opik reporter instances are single-attempt");
    if (!this.localArtifactDigest) {
      throw new Error("Opik projection requires the completed local artifact digest");
    }
    const provisionalProjectionId = `opik:${manifest.runId}`;
    const idempotencyKey = projectionIdempotencyKey({
      destination: "opik",
      runId: manifest.runId,
      manifestDigest: manifest.contentDigest,
      policyVersion: SAFE_EXPORT_POLICY_VERSION,
    });
    const previous = await this.options.ledger.latestEvent(provisionalProjectionId);
    const attemptNumber = (previous?.attemptNumber ?? 0) + 1;
    this.active = {
      manifest,
      projectionId: provisionalProjectionId,
      idempotencyKey,
      attemptNumber,
      terminalStatus: "not_run",
      terminalReasonCode: "NOT_RUN",
      localArtifactDigest: this.localArtifactDigest,
    };

    try {
      const envelope = buildSafeProjectionEnvelope({
        manifest,
        scenario: this.options.scenario,
        datasetName: this.options.datasetName,
        datasetDigest: this.options.datasetDigest,
        projectName: this.options.projectName,
        ownerControlledInstance: this.options.ownerControlledInstance,
      });
      this.active.envelope = envelope;
      await this.options.ledger.initialize(provisionalProjectionId, envelope);
      await this.append("pending", "PROJECTION_PENDING");
      const started = await this.options.transport.beginProjection(envelope);
      this.active.externalId = started.externalId;
      this.active.remoteDatasetVersionId = started.datasetVersionId;
      this.active.experimentId = started.experimentId;
      this.active.experimentItemId = started.experimentItemId;
      await this.append("succeeded", "PROJECTION_STARTED");
    } catch (error) {
      const reasonCode =
        error instanceof ExportPolicyError ? error.reasonCode : "OPIK_BEGIN_FAILED";
      this.active.failedReasonCode = reasonCode;
      if (this.active.envelope) await this.append("failed", reasonCode);
    }

    return {
      reporterId: "opik",
      runId: manifest.runId,
      artifactRef: `projection-ledger:${provisionalProjectionId}`,
      manifestDigest: manifest.contentDigest,
    };
  }

  async recordTrace(trace: SafeEvaluationTraceV1): Promise<void> {
    const active = this.requireActive();
    if (active.failedReasonCode) return;
    try {
      const safeTrace = projectSafeTrace(trace);
      await this.options.transport.recordTrace(active.externalId ?? active.projectionId, safeTrace);
    } catch {
      active.failedReasonCode = "OPIK_TRACE_FAILED";
      await this.append("failed", active.failedReasonCode);
    }
  }

  async recordScores(scores: EvaluationScoreV1[]): Promise<void> {
    const active = this.requireActive();
    if (active.failedReasonCode) return;
    try {
      const safeScores = scores.map(projectSafeScore);
      await this.options.transport.recordScores(active.externalId ?? active.projectionId, safeScores);
    } catch {
      active.failedReasonCode = "OPIK_SCORE_FAILED";
      await this.append("failed", active.failedReasonCode);
    }
  }

  async completeRun(result: EvaluationGateResultV1): Promise<ProjectionReceiptV1> {
    const active = this.requireActive();
    if (!active.failedReasonCode) {
      try {
        const terminal = projectSafeTerminal({
          status: active.terminalStatus,
          reasonCode: active.terminalReasonCode,
          gateStatus: result.status,
        });
        await this.options.transport.completeProjection(active.externalId ?? active.projectionId, terminal);
        return this.options.ledger.toProjectionReceipt(
          await this.append("succeeded", "PROJECTION_COMPLETE"),
        );
      } catch {
        active.failedReasonCode = "OPIK_COMPLETE_FAILED";
        if (active.envelope) {
          return this.options.ledger.toProjectionReceipt(
            await this.append("failed", active.failedReasonCode),
          );
        }
      }
    }
    if (active.envelope) {
      const latest = await this.options.ledger.latestEvent(active.projectionId);
      if (latest) return this.options.ledger.toProjectionReceipt(latest);
    }
    return localNotRunReceipt(active, active.failedReasonCode ?? "PROJECTION_NOT_RUN");
  }

  async deleteProjection(ref: ProjectionReferenceV1): Promise<DeletionReceiptV1> {
    return deleteOpikProjection({ ref, ledger: this.options.ledger, transport: this.options.transport });
  }

  private requireActive(): ActiveProjection {
    if (!this.active) throw new Error("Opik reporter has no active run");
    return this.active;
  }

  private async append(
    status: ProjectionLedgerEventV1["status"],
    reasonCode: string,
  ): Promise<ProjectionLedgerEventV1> {
    const active = this.requireActive();
    if (!active.envelope) throw new Error("Projection envelope was not accepted by export policy");
    return this.options.ledger.appendEvent({
      projectionId: active.projectionId,
      runId: active.manifest.runId,
      destination: "opik",
      idempotencyKey: active.idempotencyKey,
      attemptNumber: active.attemptNumber,
      status,
      policyVersion: SAFE_EXPORT_POLICY_VERSION,
      envelopeDigest: digestCanonicalJson(active.envelope),
      localArtifactDigest: active.localArtifactDigest,
      ...(active.externalId === undefined ? {} : { externalId: active.externalId }),
      ...(active.remoteDatasetVersionId === undefined
        ? {}
        : { remoteDatasetVersionId: active.remoteDatasetVersionId }),
      ...(active.experimentId === undefined ? {} : { experimentId: active.experimentId }),
      ...(active.experimentItemId === undefined
        ? {}
        : { experimentItemId: active.experimentItemId }),
      reasonCode,
    });
  }
}

export async function deleteOpikProjection(input: {
  ref: ProjectionReferenceV1;
  ledger: ProjectionLedger;
  transport: OpikProjectionTransport;
}): Promise<DeletionReceiptV1> {
  const ledgerEvent = await input.ledger.latestEvent(input.ref.projectionId);
  const remoteTraceId = ledgerEvent?.externalId;
  const experimentId = ledgerEvent?.experimentId;
  const experimentItemId = ledgerEvent?.experimentItemId;
  if (!remoteTraceId || !experimentId || !experimentItemId) {
    return input.ledger.writeDeletionReceipt({
      projectionId: input.ref.projectionId,
      status: "not_found",
      readBackVerified: false,
      deletionScope: "trace_projection",
      retainedSurfaces: ["remote_dataset", "remote_experiment", "immutable_local_authority"],
      reasonCode: "OPIK_REMOTE_DELETION_TARGET_NOT_RECORDED",
    });
  }
  const target: OpikProjectionDeletionTarget = {
    traceId: remoteTraceId,
    experimentId,
    experimentItemId,
  };
  try {
    await input.transport.deleteProjection(target);
    const existence = await input.transport.projectionExists(target);
    if (existence.traceExists || existence.experimentLinkExists) {
      return input.ledger.writeDeletionReceipt({
        projectionId: input.ref.projectionId,
        status: "failed",
        readBackVerified: false,
        deletionScope: "trace_projection",
        retainedSurfaces: ["remote_dataset", "remote_experiment", "immutable_local_authority"],
        reasonCode: "OPIK_TRACE_OR_EXPERIMENT_LINK_STILL_PRESENT",
      });
    }
    return input.ledger.writeDeletionReceipt({
      projectionId: input.ref.projectionId,
      status: "deleted",
      readBackVerified: true,
      deletionScope: "trace_projection",
      retainedSurfaces: ["remote_dataset", "remote_experiment", "immutable_local_authority"],
      reasonCode: "OPIK_TRACE_AND_EXPERIMENT_LINK_DELETE_VERIFIED",
    });
  } catch (error) {
    const missing = error instanceof Error && /404|not found/i.test(error.message);
    return input.ledger.writeDeletionReceipt({
      projectionId: input.ref.projectionId,
      status: missing ? "not_found" : "failed",
      readBackVerified: missing,
      deletionScope: "trace_projection",
      retainedSurfaces: ["remote_dataset", "remote_experiment", "immutable_local_authority"],
      reasonCode: missing ? "OPIK_PROJECTION_NOT_FOUND" : "OPIK_DELETE_FAILED",
    });
  }
}

function localNotRunReceipt(
  active: ActiveProjection,
  reasonCode: string,
): ProjectionReceiptV1 {
  const partial = {
    schemaVersion: "evaluation-projection-receipt.v1" as const,
    receiptId: `receipt:${active.projectionId}:not-run`,
    projectionId: active.projectionId,
    runId: active.manifest.runId,
    destination: "opik",
    status: "not_run" as const,
    idempotencyKey: active.idempotencyKey,
    attemptNumber: active.attemptNumber,
    localArtifactDigest: active.localArtifactDigest,
    reasonCode,
    createdAt: active.manifest.createdAt,
  };
  return { ...partial, contentDigest: digestContentDocument(partial) };
}

export async function checkOpikConfiguration(
  transport: OpikProjectionTransport,
): Promise<{ status: "pass" | "not_run"; reasonCode: string; version?: string }> {
  const result = await transport.checkConnection();
  return {
    status: result.reachable ? "pass" : "not_run",
    reasonCode: result.reasonCode,
    ...(result.version === undefined ? {} : { version: result.version }),
  };
}
