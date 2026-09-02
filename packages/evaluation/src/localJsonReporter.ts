import { mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";

import type {
  DeletionReceiptV1,
  EvaluationGateResultV1,
  EvaluationReporter,
  EvaluationRunManifestV1,
  EvaluationScoreV1,
  ProjectionReceiptV1,
  ProjectionReferenceV1,
  ReporterRunRefV1,
  SafeEvaluationTraceV1,
} from "./contracts.js";
import { canonicalJson } from "./canonicalJson.js";
import { digestCanonicalJson, hasValidSha256Format } from "./digest.js";
import { validateGateDigest } from "./gates.js";
import { createSystemRuntimeDependencies } from "./runtimeDependencies.js";
import type { EvaluationRuntimeDependencies } from "./runtimeDependencies.js";
import { assertValidGate, assertValidRunManifest } from "./validate.js";

export interface LocalJsonReporterOptions {
  outputDirectory: string;
  reporterId?: string;
  runtime?: EvaluationRuntimeDependencies;
}

interface LocalRunArtifactV1 {
  schemaVersion: "evaluation-local-run-artifact.v1";
  manifest: EvaluationRunManifestV1;
  traces: SafeEvaluationTraceV1[];
  recordedScores: EvaluationScoreV1[];
  gate: EvaluationGateResultV1;
}

function digestFileName(digest: string): string {
  return digest.slice("sha256:".length);
}

function assertSafePathSegment(value: string, label: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(value)) {
    throw new Error(`${label} must be a bounded path-safe identifier`);
  }
}

function isAlreadyExists(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "EEXIST";
}

async function writeImmutableJson(filePath: string, value: unknown): Promise<void> {
  const serialized = `${canonicalJson(value)}\n`;
  try {
    const handle = await open(filePath, "wx", 0o600);
    try {
      await handle.writeFile(serialized, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
    const existing = await readFile(filePath, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(existing);
    } catch (parseError) {
      throw new Error(`Immutable artifact ${filePath} already exists with invalid JSON`, { cause: parseError });
    }
    if (canonicalJson(parsed) !== canonicalJson(value)) {
      throw new Error(`Immutable artifact ${filePath} already exists with different content`);
    }
  }
}

export class LocalJsonReporter implements EvaluationReporter {
  readonly #outputDirectory: string;
  readonly #reporterId: string;
  readonly #runtime: EvaluationRuntimeDependencies;
  #manifest?: EvaluationRunManifestV1;
  #runRef?: ReporterRunRefV1;
  readonly #traces = new Map<string, SafeEvaluationTraceV1>();
  readonly #scores = new Map<string, EvaluationScoreV1>();
  #completion?: { gateDigest: string; receipt: ProjectionReceiptV1 };

  public constructor(options: LocalJsonReporterOptions) {
    if (options.outputDirectory.trim().length === 0) throw new Error("LocalJsonReporter outputDirectory is required");
    this.#outputDirectory = path.resolve(options.outputDirectory);
    this.#reporterId = options.reporterId ?? "local-json";
    assertSafePathSegment(this.#reporterId, "reporterId");
    this.#runtime = options.runtime ?? createSystemRuntimeDependencies();
  }

  public async beginRun(manifest: EvaluationRunManifestV1): Promise<ReporterRunRefV1> {
    assertSafePathSegment(manifest.runId, "runId");
    assertValidRunManifest(manifest);
    if (this.#manifest !== undefined) {
      if (
        this.#manifest.runId === manifest.runId &&
        this.#manifest.contentDigest === manifest.contentDigest &&
        this.#runRef !== undefined
      ) {
        return this.#runRef;
      }
      throw new Error("A LocalJsonReporter instance can own only one immutable Run");
    }

    const runDirectory = this.runDirectory(manifest.runId);
    await mkdir(runDirectory, { recursive: true, mode: 0o700 });
    const identity = {
      schemaVersion: "evaluation-local-run-identity.v1",
      runId: manifest.runId,
      manifestDigest: manifest.contentDigest,
    };
    await writeImmutableJson(path.join(runDirectory, "run-identity.json"), identity);
    await writeImmutableJson(
      path.join(runDirectory, `manifest.${digestFileName(manifest.contentDigest)}.json`),
      manifest,
    );
    await writeImmutableJson(path.join(runDirectory, "manifest.json"), manifest);

    const runRef: ReporterRunRefV1 = {
      reporterId: this.#reporterId,
      runId: manifest.runId,
      artifactRef: `local-evaluation-run:${manifest.runId}`,
      manifestDigest: manifest.contentDigest,
    };
    this.#manifest = manifest;
    this.#runRef = runRef;
    return runRef;
  }

  public async recordTrace(trace: SafeEvaluationTraceV1): Promise<void> {
    const manifest = this.requireManifest();
    if (trace.schemaVersion !== "safe-evaluation-trace.v1") throw new Error("Unsupported safe trace schemaVersion");
    if (trace.attemptId !== manifest.attempt.attemptId) throw new Error("Trace belongs to another Attempt");
    assertSafePathSegment(trace.traceId, "traceId");
    if (!Number.isInteger(trace.ordinal) || trace.ordinal < 0) throw new Error("Trace ordinal must be a non-negative integer");
    if (trace.inputDigest !== undefined && !hasValidSha256Format(trace.inputDigest)) throw new Error("Invalid trace inputDigest");
    if (trace.outputDigest !== undefined && !hasValidSha256Format(trace.outputDigest)) throw new Error("Invalid trace outputDigest");
    const existing = this.#traces.get(trace.traceId);
    if (existing !== undefined && canonicalJson(existing) !== canonicalJson(trace)) {
      throw new Error(`Trace ${trace.traceId} is immutable`);
    }
    if (existing === undefined) this.#traces.set(trace.traceId, trace);
  }

  public async recordScores(scores: EvaluationScoreV1[]): Promise<void> {
    const manifest = this.requireManifest();
    for (const score of scores) {
      if (score.schemaVersion !== "evaluation-score.v1") throw new Error("Unsupported score schemaVersion");
      if (score.attemptId !== manifest.attempt.attemptId) throw new Error(`Score ${score.scoreId} belongs to another Attempt`);
      if (score.scenarioId !== manifest.attempt.scenario.identityId) throw new Error(`Score ${score.scoreId} belongs to another Scenario`);
      if (score.status === "fail" && score.evidence.length === 0) throw new Error(`Failed score ${score.scoreId} has no evidence locator`);
      const existing = this.#scores.get(score.scoreId);
      if (existing !== undefined && canonicalJson(existing) !== canonicalJson(score)) {
        throw new Error(`Score ${score.scoreId} is immutable`);
      }
      if (existing === undefined) this.#scores.set(score.scoreId, score);
    }
  }

  public async completeRun(result: EvaluationGateResultV1): Promise<ProjectionReceiptV1> {
    const manifest = this.requireManifest();
    if (result.attemptId !== manifest.attempt.attemptId || result.scenarioId !== manifest.attempt.scenario.identityId) {
      throw new Error("Gate result belongs to another Scenario Attempt");
    }
    assertValidGate(result);
    if (!validateGateDigest(result)) throw new Error("Gate result contentDigest does not match canonical content");
    if (this.#completion !== undefined) {
      if (this.#completion.gateDigest === result.contentDigest) return this.#completion.receipt;
      throw new Error("This Run already has an immutable completion with different content");
    }
    for (const gateScore of result.scores) {
      const recorded = this.#scores.get(gateScore.scoreId);
      if (recorded === undefined || canonicalJson(recorded) !== canonicalJson(gateScore)) {
        throw new Error(`Gate score ${gateScore.scoreId} was not recorded exactly before completion`);
      }
    }

    const artifact: LocalRunArtifactV1 = {
      schemaVersion: "evaluation-local-run-artifact.v1",
      manifest,
      traces: [...this.#traces.values()].sort((left, right) =>
        left.ordinal - right.ordinal || left.traceId.localeCompare(right.traceId)),
      recordedScores: [...this.#scores.values()].sort((left, right) => left.scoreId.localeCompare(right.scoreId)),
      gate: result,
    };
    const artifactDigest = digestCanonicalJson(artifact);
    const runDirectory = this.runDirectory(manifest.runId);
    await writeImmutableJson(
      path.join(runDirectory, `run-artifact.${digestFileName(artifactDigest)}.json`),
      artifact,
    );
    const completionIdentity = {
      schemaVersion: "evaluation-local-completion-identity.v1",
      runId: manifest.runId,
      artifactDigest,
      gateDigest: result.contentDigest,
    };
    await writeImmutableJson(path.join(runDirectory, "completion.json"), completionIdentity);

    const receiptWithoutDigest = {
      schemaVersion: "evaluation-projection-receipt.v1" as const,
      receiptId: this.#runtime.ids.nextId("projection_receipt"),
      projectionId: `local_${manifest.runId}`,
      runId: manifest.runId,
      destination: "local-json",
      status: "succeeded" as const,
      idempotencyKey: `local:${manifest.runId}:${artifactDigest}`,
      attemptNumber: 1,
      localArtifactDigest: artifactDigest,
      createdAt: this.#runtime.clock.nowIso(),
    };
    const receipt: ProjectionReceiptV1 = {
      ...receiptWithoutDigest,
      contentDigest: digestCanonicalJson(receiptWithoutDigest),
    };
    await writeImmutableJson(
      path.join(runDirectory, `projection-receipt.${digestFileName(receipt.contentDigest)}.json`),
      receipt,
    );
    this.#completion = { gateDigest: result.contentDigest, receipt };
    return receipt;
  }

  public async deleteProjection(ref: ProjectionReferenceV1): Promise<DeletionReceiptV1> {
    const manifest = this.requireManifest();
    if (ref.reporterId !== this.#reporterId || ref.runId !== manifest.runId) {
      throw new Error("Projection reference does not belong to this reporter Run");
    }
    assertSafePathSegment(ref.projectionId, "projectionId");
    const withoutDigest = {
      schemaVersion: "evaluation-deletion-receipt.v1" as const,
      receiptId: this.#runtime.ids.nextId("deletion_receipt"),
      projectionId: ref.projectionId,
      status: "deleted" as const,
      deletionScope: "local_projection_tombstone" as const,
      retainedSurfaces: ["immutable_local_authority"],
      readBackVerified: true,
      reasonCode: "projection_tombstoned_local_authority_retained",
      createdAt: this.#runtime.clock.nowIso(),
    };
    const receipt: DeletionReceiptV1 = {
      ...withoutDigest,
      contentDigest: digestCanonicalJson(withoutDigest),
    };
    const filePath = path.join(
      this.runDirectory(manifest.runId),
      `deletion-receipt.${digestFileName(receipt.contentDigest)}.json`,
    );
    await writeImmutableJson(filePath, receipt);
    const readBack = JSON.parse(await readFile(filePath, "utf8")) as DeletionReceiptV1;
    if (canonicalJson(readBack) !== canonicalJson(receipt)) {
      throw new Error("Deletion receipt readback did not match the written receipt");
    }
    return receipt;
  }

  private requireManifest(): EvaluationRunManifestV1 {
    if (this.#manifest === undefined) throw new Error("beginRun must succeed before reporter operations");
    return this.#manifest;
  }

  private runDirectory(runId: string): string {
    return path.join(this.#outputDirectory, "runs", runId);
  }
}
