import {
  Opik,
  OpikSpanType,
  disableLogger,
  type Trace,
} from "opik";
import type {
  SafeEvaluationTraceV1,
  Sha256Digest,
} from "@talent-signal/evaluation";
import { digestCanonicalJson } from "@talent-signal/evaluation";

import type {
  DatasetSyncPlanV1,
  SafeProjectedScoreV1,
  SafeProjectedTerminalV1,
  SafeProjectionEnvelopeV1,
} from "../contracts.js";
import {
  assertSafeOpaqueToken,
  assertSafeProjectedScore,
  projectSafeTerminal,
  projectSafeTrace,
} from "../safeExportPolicy.js";

const REQUEST_OPTIONS = { timeoutInSeconds: 5, maxRetries: 0 };
// ClickHouse deletion waits for its mutation; the existing private service
// took 17.7 seconds in the GET-11 readback proof. Keep this bounded, without retries.
const DELETE_REQUEST_OPTIONS = { timeoutInSeconds: 30, maxRetries: 0 };
const streamRequestOptions = () => ({ ...REQUEST_OPTIONS, abortSignal: AbortSignal.timeout(5_000) });

async function readStreamRows(stream: ReadableStream<Uint8Array>, maximumRows: number): Promise<Record<string, unknown>[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let content = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      content += decoder.decode(chunk.value, { stream: true });
      if (content.length > 8_000_000) throw new OpikTransportError("OPIK_READBACK_LIMIT_EXCEEDED");
    }
    const rows = content.split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line) as unknown);
    if (rows.length > maximumRows || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
      throw new OpikTransportError("OPIK_READBACK_INVALID");
    }
    return rows as Record<string, unknown>[];
  } finally { await reader.cancel(); }
}

export interface OpikConnectionOptions {
  apiKey?: string;
  apiUrl?: string;
  projectName: string;
  workspaceName?: string;
  environment: string;
}

export class OpikTransportError extends Error {
  constructor(readonly reasonCode: string) {
    super(reasonCode);
    this.name = "OpikTransportError";
  }
}

/** Preserve operational states without returning provider bodies or credentials. */
export function opikFailureReason(error: unknown, fallback: string): string {
  if (error instanceof OpikTransportError) return error.reasonCode;
  const status = typeof error === "object" && error !== null && "statusCode" in error
    ? error.statusCode : undefined;
  if (status === 401 || status === 403) return "OPIK_AUTHENTICATION_FAILED";
  if (status === 429 || (typeof status === "number" && status >= 500)) return "OPIK_UNAVAILABLE";
  if (error instanceof Error && /fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|timed? ?out|timeout|network|offline/i.test(error.message)) {
    return "OPIK_UNAVAILABLE";
  }
  return fallback;
}

export interface OpikDatasetSyncReceipt {
  datasetId: string;
  datasetVersionId: string;
  datasetVersionName?: string;
  datasetDigest: Sha256Digest;
  itemCount: number;
  operation: DatasetSyncPlanV1["operation"];
}

export interface OpikProjectionStart {
  projectionId: string;
  externalId: string;
  datasetVersionId: string;
  experimentId: string;
  experimentItemId: string;
}

export interface OpikProjectionDeletionTarget {
  traceId: string;
  experimentId: string;
  experimentItemId: string;
}

export interface OpikProjectionExistence {
  traceExists: boolean;
  experimentLinkExists: boolean;
}

export interface OpikProjectionTransport {
  checkConnection(): Promise<{ reachable: boolean; version?: string; reasonCode: string }>;
  readDatasetDigest(datasetName: string): Promise<Sha256Digest | undefined>;
  syncDataset(plan: DatasetSyncPlanV1): Promise<OpikDatasetSyncReceipt>;
  beginProjection(envelope: SafeProjectionEnvelopeV1,
    onTarget?: (target: OpikProjectionStart) => Promise<void>): Promise<OpikProjectionStart>;
  recordTrace(projectionId: string, trace: SafeEvaluationTraceV1): Promise<void>;
  recordScores(projectionId: string, scores: SafeProjectedScoreV1[]): Promise<void>;
  completeProjection(
    projectionId: string,
    terminal: SafeProjectedTerminalV1,
  ): Promise<void>;
  deleteProjection(target: OpikProjectionDeletionTarget): Promise<void>;
  projectionExists(target: OpikProjectionDeletionTarget): Promise<OpikProjectionExistence>;
  flush(): Promise<void>;
}

interface SafeRemoteDatasetItem {
  [key: string]: string | string[] | Record<string, string>;
  id: string;
  scenario_id: string;
  revision: string;
  scenario_digest: Sha256Digest;
  suite_ids: string[];
  risk_tier: string;
  lifecycle: string;
  adjudication: string;
  partition: string;
  data_class: string;
  slices: Record<string, string>;
  dataset_digest: Sha256Digest;
}

function stableUuid(value: string): string {
  const hex = value.startsWith("sha256:") ? value.slice(7) : value.replace(/[^a-f0-9]/gi, "");
  const padded = hex.padEnd(32, "0").slice(0, 32).toLowerCase().split("");
  // Opik 2.2.x validates user-supplied entity IDs as UUIDv7. The remaining
  // bits stay content-derived so a retry reuses the same remote identity.
  padded[12] = "7";
  padded[16] = ["8", "9", "a", "b"][Number.parseInt(padded[16] ?? "0", 16) % 4]!;
  const normalized = padded.join("");
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20)}`;
}

function scoreValue(status: SafeProjectedScoreV1["status"]): number {
  if (status === "pass") return 1;
  if (status === "needs_review") return 0.5;
  return 0;
}

export function opikExperimentIdentity(envelope: SafeProjectionEnvelopeV1): {
  name: string;
  config: Record<string, string>;
} {
  const name = [
    envelope.datasetName,
    envelope.mode,
    envelope.agentDefinitionId,
    envelope.agentDefinitionVersion,
    `ad${envelope.agentDefinitionDigest.slice(7, 19)}`,
    `pd${envelope.profileDigest.slice(7, 19)}`,
    `trial-${envelope.trialNumber}`,
  ].join("-");
  assertSafeOpaqueToken(name, "$/experimentName");
  return {
    name,
    config: {
      profile_id: envelope.profileId,
      profile_version: envelope.profileVersion,
      profile_digest: envelope.profileDigest,
      agent_definition_id: envelope.agentDefinitionId,
      agent_definition_version: envelope.agentDefinitionVersion,
      agent_definition_digest: envelope.agentDefinitionDigest,
      trial_number: String(envelope.trialNumber),
      policy_version: envelope.policyVersion,
    },
  };
}

export class SdkOpikTransport implements OpikProjectionTransport {
  private readonly client: Opik;
  private readonly traces = new Map<string, Trace>();
  private readonly expectedSpans = new Map<string, Map<string, { output: unknown; metadata: unknown }>>();
  private readonly expectedScores = new Map<string, SafeProjectedScoreV1[]>();
  private readonly options: OpikConnectionOptions;

  constructor(options: OpikConnectionOptions) {
    // The SDK logger writes provider bodies to stdout even for silent flush.
    // Operational failures are exposed only through our typed safe receipts.
    disableLogger();
    this.options = options;
    assertSafeOpaqueToken(options.projectName, "$/projectName");
    assertSafeOpaqueToken(options.environment, "$/environment");
    if (options.workspaceName !== undefined) {
      assertSafeOpaqueToken(options.workspaceName, "$/workspaceName");
    }
    this.client = new Opik({
      projectName: options.projectName,
      ...(options.workspaceName === undefined ? {} : { workspaceName: options.workspaceName }),
      ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
      ...(options.apiUrl === undefined ? {} : { apiUrl: options.apiUrl }),
      holdUntilFlush: true,
      requestOptions: { timeoutInSeconds: 5, maxRetries: 0 },
    });
    // This SDK version reads requestOptions from api for batched writes.
    this.client.api.requestOptions = REQUEST_OPTIONS;
  }

  async checkConnection(): Promise<{ reachable: boolean; version?: string; reasonCode: string }> {
    try {
      await this.client.api.isAlive({ timeoutInSeconds: 5, maxRetries: 0 });
      return {
        reachable: true,
        reasonCode: "OPIK_REACHABLE",
      };
    } catch (error) {
      return { reachable: false, reasonCode: opikFailureReason(error, "OPIK_UNAVAILABLE") };
    }
  }

  async readDatasetDigest(datasetName: string): Promise<Sha256Digest | undefined> {
    try {
      await this.client.api.datasets.getDatasetByIdentifier({
        datasetName, projectName: this.options.projectName,
      }, REQUEST_OPTIONS);
      const stream = await this.client.api.datasets.streamDatasetItems({
        datasetName, projectName: this.options.projectName, steamLimit: 1,
      }, streamRequestOptions());
      const [item] = await readStreamRows(stream, 1) as Array<{ data?: { dataset_digest?: unknown } }>;
      if (!item) return undefined;
      const digest = item.data?.dataset_digest;
      if (typeof digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(digest)) {
        throw new OpikTransportError("OPIK_DATASET_DIGEST_CONFLICT");
      }
      return digest as Sha256Digest;
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw new OpikTransportError(opikFailureReason(error, "OPIK_DATASET_READ_FAILED"));
    }
  }

  async syncDataset(plan: DatasetSyncPlanV1): Promise<OpikDatasetSyncReceipt> {
    const dataset = await this.client.getOrCreateDataset<SafeRemoteDatasetItem>(
      plan.datasetName,
      `Talent Signal repository suite ${plan.suiteId}; local digest remains authoritative`,
      plan.projectName,
    );
    if (!plan.dryRun && plan.operation !== "noop") {
      const desired = plan.items.map((item) => ({
        id: stableUuid(item.scenarioDigest),
        scenario_id: item.scenarioId,
        revision: item.revision,
        scenario_digest: item.scenarioDigest,
        suite_ids: item.suiteIds,
        risk_tier: item.riskTier,
        lifecycle: item.lifecycle,
        adjudication: item.adjudication,
        partition: item.partition,
        data_class: item.dataClass,
        slices: item.slices,
        dataset_digest: plan.desiredDatasetDigest,
      }));
      const current = await dataset.getItems();
      const desiredIds = new Set(desired.map((item) => item.id));
      const currentIds = new Set(current.map((item) => item.id));
      const insert = desired.filter((item) => !currentIds.has(item.id));
      const update = desired.filter((item) => currentIds.has(item.id));
      const remove = current.filter((item) => !desiredIds.has(item.id)).map((item) => item.id);
      if (insert.length > 0) await dataset.insert(insert);
      if (update.length > 0) await dataset.update(update);
      if (remove.length > 0) await dataset.delete(remove);
      await this.client.flush({ silent: true });
    }
    const version = await dataset.getVersionInfo();
    const versionId = version?.id;
    if (!versionId) throw new Error("OPIK_DATASET_VERSION_UNAVAILABLE");
    return {
      datasetId: dataset.id,
      datasetVersionId: versionId,
      ...(version.versionName === undefined ? {} : { datasetVersionName: version.versionName }),
      datasetDigest: plan.desiredDatasetDigest,
      itemCount: plan.itemCount,
      operation: plan.operation,
    };
  }

  async beginProjection(envelope: SafeProjectionEnvelopeV1,
    onTarget?: (target: OpikProjectionStart) => Promise<void>): Promise<OpikProjectionStart> {
    const remoteDatasetDigest = await this.readDatasetDigest(envelope.datasetName);
    if (remoteDatasetDigest === undefined) {
      throw new OpikTransportError("OPIK_DATASET_NOT_SYNCED");
    }
    if (remoteDatasetDigest !== envelope.datasetDigest) {
      throw new OpikTransportError("OPIK_DATASET_DIGEST_CONFLICT");
    }
    const dataset = await this.client.api.datasets.getDatasetByIdentifier({
      datasetName: envelope.datasetName, projectName: envelope.projectName,
    }, REQUEST_OPTIONS);
    if (!dataset.id) throw new OpikTransportError("OPIK_READBACK_INVALID");
    const version = (await this.client.api.datasets.listDatasetVersions(dataset.id,
      { page: 1, size: 1 }, REQUEST_OPTIONS)).content?.[0];
    if (!version?.id) throw new Error("OPIK_PINNED_DATASET_VERSION_REQUIRED");
    const projectionId = stableUuid(envelope.manifestDigest);
    const identity = opikExperimentIdentity(envelope);
    const experimentName = identity.name;
    const existing = await readStreamRows(await this.client.api.experiments.streamExperiments({
      name: experimentName, projectName: envelope.projectName, limit: 2,
    }, streamRequestOptions()), 2);
    if (existing.length > 1) throw new OpikTransportError("OPIK_EXPERIMENT_IDENTITY_CONFLICT");
    const existingExperiment = existing[0];
    if (existingExperiment && typeof existingExperiment.id !== "string") {
      throw new OpikTransportError("OPIK_READBACK_INVALID");
    }
    if (existingExperiment) {
      const remoteExperiment = await this.client.api.experiments.getExperimentById(
        existingExperiment.id as string, {}, REQUEST_OPTIONS,
      );
      if (remoteExperiment.datasetVersionId !== version.id) {
        throw new Error("OPIK_EXPERIMENT_DATASET_VERSION_MISMATCH");
      }
      const metadata = remoteExperiment.metadata;
      if (
        !metadata ||
        typeof metadata !== "object" ||
        Array.isArray(metadata) ||
        metadata.agent_definition_digest !== identity.config.agent_definition_digest ||
        metadata.profile_digest !== identity.config.profile_digest
      ) {
        throw new Error("OPIK_EXPERIMENT_IDENTITY_MISMATCH");
      }
    }
    const deterministicExperimentId = stableUuid(digestCanonicalJson({
      projectName: envelope.projectName, name: experimentName, datasetVersionId: version.id,
    }));
    const experimentId = existingExperiment?.id as string | undefined ?? deterministicExperimentId;
    let currentLink = existingExperiment ? await this.findExperimentLink(experimentName, projectionId) : undefined;
    const reservedExperimentItemId = currentLink?.id ??
      stableUuid(digestCanonicalJson({ experimentId, traceId: projectionId }));
    // Persist all cleanup identities before the first queued remote mutation.
    await onTarget?.({ projectionId, externalId: projectionId, datasetVersionId: version.id,
      experimentId, experimentItemId: reservedExperimentItemId });
    const trace = this.client.trace({
      id: projectionId,
      name: `evaluation:${envelope.scenarioId}`,
      input: {
        run_id: envelope.runId,
        scenario_id: envelope.scenarioId,
        scenario_revision: envelope.scenarioRevision,
        scenario_digest: envelope.scenarioDigest,
        profile_id: envelope.profileId,
        profile_version: envelope.profileVersion,
        agent_definition_id: envelope.agentDefinitionId,
        agent_definition_version: envelope.agentDefinitionVersion,
        agent_definition_digest: envelope.agentDefinitionDigest,
        attempt_id: envelope.attemptId,
        trial_number: envelope.trialNumber,
        mode: envelope.mode,
        system_under_test: envelope.systemUnderTest,
      },
      metadata: {
        policy_version: envelope.policyVersion,
        manifest_digest: envelope.manifestDigest,
        dataset_digest: envelope.datasetDigest,
        data_class: envelope.dataClass,
        export_decision: envelope.exportDecision,
        opaque_trace_ref: envelope.opaqueTraceRef,
      },
      tags: ["talent-signal", "evaluation", envelope.mode],
      environment: this.options.environment,
    });
    this.traces.set(projectionId, trace);
    this.expectedSpans.set(projectionId, new Map());
    this.expectedScores.set(projectionId, []);
    // The link endpoint needs a remotely visible trace, not a queued SDK object.
    await this.client.flush({ silent: true });
    await this.client.api.traces.getTraceById(projectionId, {}, REQUEST_OPTIONS);
    if (!existingExperiment) {
      await this.client.api.experiments.createExperiment({
        id: deterministicExperimentId,
        datasetName: envelope.datasetName,
        datasetVersionId: version.id,
        name: experimentName,
        projectName: envelope.projectName,
        tags: ["talent-signal", envelope.mode],
        metadata: identity.config,
      }, REQUEST_OPTIONS);
    }
    if (!currentLink) {
      await this.client.api.experiments.createExperimentItems({ experimentItems: [
        { id: reservedExperimentItemId,
          experimentId,
          datasetItemId: stableUuid(envelope.scenarioDigest),
          traceId: projectionId,
          projectName: envelope.projectName,
        },
      ] }, REQUEST_OPTIONS);
      for (const delayMs of [0, 100, 250, 500]) {
        if (delayMs > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
        }
        currentLink = await this.findExperimentLink(experimentName, projectionId);
        if (currentLink) break;
      }
    }
    const experimentItemId = currentLink?.id;
    if (!experimentItemId) throw new Error("OPIK_EXPERIMENT_LINK_READBACK_MISSING");
    return {
      projectionId,
      externalId: projectionId,
      datasetVersionId: version.id,
      experimentId,
      experimentItemId,
    };
  }

  async recordTrace(projectionId: string, event: SafeEvaluationTraceV1): Promise<void> {
    const safeEvent = projectSafeTrace(event);
    const trace = this.requireTrace(projectionId);
    const span = trace.span({
        id: stableUuid(
          digestCanonicalJson({
            projectionId,
            kind: "trace_event",
            traceId: safeEvent.traceId,
            ordinal: safeEvent.ordinal,
          }),
        ),
        name: `${String(safeEvent.ordinal).padStart(4, "0")}:${safeEvent.eventKind}`,
        type: OpikSpanType.General,
        input: {
          attempt_id: safeEvent.attemptId,
          event_kind: safeEvent.eventKind,
          ...(safeEvent.inputDigest === undefined ? {} : { input_digest: safeEvent.inputDigest }),
        },
        output: {
          status: safeEvent.status,
          ...(safeEvent.outputDigest === undefined ? {} : { output_digest: safeEvent.outputDigest }),
          ...(safeEvent.reasonCode === undefined ? {} : { reason_code: safeEvent.reasonCode }),
        },
        metadata: { ordinal: safeEvent.ordinal },
        ...(safeEvent.durationMs === undefined ? {} : { duration: safeEvent.durationMs }),
      }).end();
    this.expectedSpans.get(projectionId)?.set(span.data.id, { output: span.data.output, metadata: span.data.metadata });
  }

  async recordScores(projectionId: string, scores: SafeProjectedScoreV1[]): Promise<void> {
    const trace = this.requireTrace(projectionId);
    for (const score of scores) {
      assertSafeProjectedScore(score);
      const span = trace.span({
          id: stableUuid(
            digestCanonicalJson({
              projectionId,
              kind: "atomic_score",
              scoreId: score.scoreId,
            }),
          ),
          name: `criterion:${score.evaluatorId}:${score.criterionId}`,
          type: OpikSpanType.General,
          output: { status: score.status, reason_code: score.reasonCode ?? "NO_REASON_CODE" },
          metadata: {
            semantic: score.semantic,
            aggregate_approval: score.aggregateApproval,
            capability: score.capability,
            evaluator_id: score.evaluatorId,
            evaluator_version: score.evaluatorVersion,
            evaluator_kind: score.evaluatorKind,
            criterion_id: score.criterionId,
            gate_authority: score.gateAuthority,
            veto: score.veto,
            evidence_locators: score.evidenceLocators,
          },
        }).end();
      this.expectedSpans.get(projectionId)?.set(span.data.id, { output: span.data.output, metadata: span.data.metadata });
      trace.score({
        name: `atomic:${score.evaluatorKind}:${score.evaluatorId}:${score.criterionId}`,
        categoryName: score.status,
        value: scoreValue(score.status),
        ...(score.reasonCode === undefined ? {} : { reason: score.reasonCode }),
      });
    }
    this.expectedScores.set(projectionId, scores);
  }

  async completeProjection(
    projectionId: string,
    terminal: SafeProjectedTerminalV1,
  ): Promise<void> {
    const safeTerminal = projectSafeTerminal(terminal);
    const trace = this.requireTrace(projectionId);
    trace.update({
      output: {
        terminal_status: safeTerminal.status,
        terminal_reason_code: safeTerminal.reasonCode,
        local_gate_status: safeTerminal.gateStatus,
      },
    });
    trace.end();
    await this.flush();
    // SDK flush logs batch errors without rejecting. Only destination readback
    // can establish that the completed trace, every span and every score exist.
    const remote = await this.client.api.traces.getTraceById(projectionId, {}, REQUEST_OPTIONS);
    if (!remote.endTime || digestCanonicalJson(remote.output) !== digestCanonicalJson(trace.data.output)) {
      throw new OpikTransportError("OPIK_COMPLETION_READBACK_MISMATCH");
    }
    for (const [spanId, expected] of this.expectedSpans.get(projectionId) ?? []) {
      const span = await this.client.api.spans.getSpanById(spanId, {}, REQUEST_OPTIONS);
      if (!span.endTime || span.traceId !== projectionId ||
        digestCanonicalJson(span.output) !== digestCanonicalJson(expected.output) ||
        digestCanonicalJson(span.metadata) !== digestCanonicalJson(expected.metadata)) {
        throw new OpikTransportError("OPIK_SPAN_READBACK_MISMATCH");
      }
    }
    for (const score of this.expectedScores.get(projectionId) ?? []) {
      const name = `atomic:${score.evaluatorKind}:${score.evaluatorId}:${score.criterionId}`;
      if (!remote.feedbackScores?.some((item) => item.name === name && item.value === scoreValue(score.status) && item.categoryName === score.status)) {
        throw new OpikTransportError("OPIK_SCORE_READBACK_MISMATCH");
      }
    }
  }

  async deleteProjection(target: OpikProjectionDeletionTarget): Promise<void> {
    const existing = await this.projectionExists(target);
    if (existing.experimentLinkExists) try {
      await this.client.api.experiments.deleteExperimentItems({ ids: [target.experimentItemId] }, DELETE_REQUEST_OPTIONS);
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    if (existing.traceExists) try {
      await this.client.api.traces.deleteTraceById(target.traceId, {}, DELETE_REQUEST_OPTIONS);
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    this.traces.delete(target.traceId);
  }

  async projectionExists(target: OpikProjectionDeletionTarget): Promise<OpikProjectionExistence> {
    let traceExists = false;
    try {
      await this.client.api.traces.getTraceById(target.traceId, {}, REQUEST_OPTIONS);
      traceExists = true;
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    let experimentLinkExists = false;
    try {
      const experiment = await this.client.api.experiments.getExperimentById(target.experimentId, {}, REQUEST_OPTIONS);
      if (!experiment.name) throw new OpikTransportError("OPIK_READBACK_INVALID");
      experimentLinkExists = Boolean(await this.findExperimentLink(experiment.name, target.traceId, target.experimentItemId));
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    return { traceExists, experimentLinkExists };
  }

  async flush(): Promise<void> {
    await this.client.flush({ silent: true });
  }

  private async findExperimentLink(name: string, traceId: string, itemId?: string): Promise<{ id: string } | undefined> {
    let cursor: string | undefined;
    for (let page = 0; page < 50; page++) {
      const rows = await readStreamRows(await this.client.api.experiments.streamExperimentItems({
        experimentName: name, projectName: this.options.projectName, limit: 200, truncate: true,
        ...(cursor === undefined ? {} : { lastRetrievedId: cursor }),
      }, streamRequestOptions()), 200);
      if (rows.length === 0) return undefined;
      const row = rows.find((item) => item.trace_id === traceId || item.id === itemId);
      if (row) {
        if (typeof row.id !== "string") throw new OpikTransportError("OPIK_READBACK_INVALID");
        return { id: row.id };
      }
      const next = rows.at(-1)?.id;
      if (typeof next !== "string" || next === cursor) throw new OpikTransportError("OPIK_READBACK_INVALID");
      cursor = next;
    }
    throw new OpikTransportError("OPIK_EXPERIMENT_LINK_SCAN_LIMIT");
  }

  private requireTrace(projectionId: string): Trace {
    const trace = this.traces.get(projectionId);
    if (!trace) throw new Error(`Unknown active Opik projection: ${projectionId}`);
    return trace;
  }
}

function isNotFound(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "statusCode" in error) {
    return error.statusCode === 404;
  }
  return error instanceof Error && /not found/i.test(error.message);
}
