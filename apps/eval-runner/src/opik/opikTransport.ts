import {
  Opik,
  OpikSpanType,
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

export interface OpikConnectionOptions {
  apiKey?: string;
  apiUrl?: string;
  projectName: string;
  workspaceName?: string;
  environment: string;
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
  beginProjection(envelope: SafeProjectionEnvelopeV1): Promise<OpikProjectionStart>;
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
  private readonly options: OpikConnectionOptions;

  constructor(options: OpikConnectionOptions) {
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
  }

  async checkConnection(): Promise<{ reachable: boolean; version?: string; reasonCode: string }> {
    try {
      await this.client.api.isAlive({ timeoutInSeconds: 5, maxRetries: 0 });
      return {
        reachable: true,
        reasonCode: "OPIK_REACHABLE",
      };
    } catch {
      return { reachable: false, reasonCode: "NOT_RUN_OPIK_UNREACHABLE" };
    }
  }

  async readDatasetDigest(datasetName: string): Promise<Sha256Digest | undefined> {
    try {
      const dataset = await this.client.getDataset<SafeRemoteDatasetItem>(
        datasetName,
        this.options.projectName,
      );
      const first = (await dataset.getItems(1))[0];
      return first?.dataset_digest;
    } catch {
      return undefined;
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

  async beginProjection(envelope: SafeProjectionEnvelopeV1): Promise<OpikProjectionStart> {
    const dataset = await this.client.getDataset<SafeRemoteDatasetItem>(
      envelope.datasetName,
      envelope.projectName,
    );
    const version = await dataset.getVersionInfo();
    if (!version?.id) throw new Error("OPIK_PINNED_DATASET_VERSION_REQUIRED");
    const remoteDatasetDigest = await this.readDatasetDigest(envelope.datasetName);
    if (remoteDatasetDigest !== envelope.datasetDigest) {
      throw new Error("OPIK_DATASET_DIGEST_MISMATCH");
    }
    const projectionId = stableUuid(envelope.manifestDigest);
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
    // Opik batches trace creation. The experiment-item API requires the trace
    // to exist remotely, so make that ordering explicit instead of relying on
    // a background flush race.
    await this.client.flush({ silent: true });

    const identity = opikExperimentIdentity(envelope);
    const experimentName = identity.name;
    const existing = await this.client.getExperimentsByName(experimentName, envelope.projectName);
    const existingExperiment = existing[0];
    if (existingExperiment) {
      const remoteExperiment = await this.client.api.experiments.getExperimentById(
        existingExperiment.id,
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
    const experiment =
      existingExperiment ??
      (await this.client.createExperiment({
        datasetName: envelope.datasetName,
        datasetVersionId: version.id,
        name: experimentName,
        projectName: envelope.projectName,
        tags: ["talent-signal", envelope.mode],
        experimentConfig: identity.config,
      }));
    let currentLinks = await experiment.getItems({ maxResults: 1_000, truncate: true });
    if (!currentLinks.some((item) => item.traceId === projectionId)) {
      await experiment.insert([
        {
          datasetItemId: stableUuid(envelope.scenarioDigest),
          traceId: projectionId,
          projectName: envelope.projectName,
        },
      ]);
      for (const delayMs of [0, 100, 250, 500]) {
        if (delayMs > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
        }
        currentLinks = await experiment.getItems({ maxResults: 1_000, truncate: true });
        if (currentLinks.some((item) => item.traceId === projectionId)) break;
      }
    }
    const experimentItemId = currentLinks.find((item) => item.traceId === projectionId)?.id;
    if (!experimentItemId) throw new Error("OPIK_EXPERIMENT_LINK_READBACK_MISSING");
    return {
      projectionId,
      externalId: projectionId,
      datasetVersionId: version.id,
      experimentId: experiment.id,
      experimentItemId,
    };
  }

  async recordTrace(projectionId: string, event: SafeEvaluationTraceV1): Promise<void> {
    const safeEvent = projectSafeTrace(event);
    const trace = this.requireTrace(projectionId);
    trace
      .span({
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
      })
      .end();
  }

  async recordScores(projectionId: string, scores: SafeProjectedScoreV1[]): Promise<void> {
    const trace = this.requireTrace(projectionId);
    for (const score of scores) {
      assertSafeProjectedScore(score);
      trace
        .span({
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
        })
        .end();
      trace.score({
        name: `atomic:${score.evaluatorKind}:${score.evaluatorId}:${score.criterionId}`,
        categoryName: score.status,
        value: scoreValue(score.status),
        ...(score.reasonCode === undefined ? {} : { reason: score.reasonCode }),
      });
    }
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
  }

  async deleteProjection(target: OpikProjectionDeletionTarget): Promise<void> {
    try {
      await this.client.api.experiments.deleteExperimentItems({ ids: [target.experimentItemId] });
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    try {
      await this.client.api.traces.deleteTraceById(target.traceId);
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    this.traces.delete(target.traceId);
  }

  async projectionExists(target: OpikProjectionDeletionTarget): Promise<OpikProjectionExistence> {
    let traceExists = false;
    try {
      await this.client.api.traces.getTraceById(target.traceId);
      traceExists = true;
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    let experimentLinkExists = false;
    try {
      const experiment = await this.client.getExperimentById(target.experimentId);
      await experiment.ensureNameLoaded();
      const items = await experiment.getItems({ maxResults: 1_000, truncate: true });
      experimentLinkExists = items.some(
        (item) => item.id === target.experimentItemId || item.traceId === target.traceId,
      );
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    return { traceExists, experimentLinkExists };
  }

  async flush(): Promise<void> {
    await this.client.flush({ silent: true });
  }

  private requireTrace(projectionId: string): Trace {
    const trace = this.traces.get(projectionId);
    if (!trace) throw new Error(`Unknown active Opik projection: ${projectionId}`);
    return trace;
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && /404|not found/i.test(error.message);
}
