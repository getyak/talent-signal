import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  digestContentDocument,
  digestCanonicalJson,
  type DeletionReceiptV1,
  type ProjectionReceiptV1,
  type SafeEvaluationTraceV1,
  type Sha256Digest,
} from "@talent-signal/evaluation";

import type { SafeProjectionEnvelopeV1 } from "./contracts.js";
import { scanSafeExport } from "./safeExportPolicy.js";

export interface ProjectionLedgerEventV1 {
  schemaVersion: "evaluation-projection-ledger-event.v1";
  eventId: string;
  sequence: number;
  projectionId: string;
  runId: string;
  destination: string;
  idempotencyKey: string;
  attemptNumber: number;
  status: "pending" | "succeeded" | "failed" | "deleted" | "not_run";
  policyVersion: string;
  envelopeDigest: Sha256Digest;
  localArtifactDigest: Sha256Digest;
  externalId?: string;
  remoteDatasetVersionId?: string;
  experimentId?: string;
  experimentItemId?: string;
  reasonCode?: string;
  recordedAt: string;
  contentDigest: Sha256Digest;
}

export interface ProjectionLedgerSnapshotV1 {
  envelope: SafeProjectionEnvelopeV1;
  events: ProjectionLedgerEventV1[];
  traces: SafeEvaluationTraceV1[];
}

export interface ProjectionLedgerClock {
  now(): string;
}

const SYSTEM_CLOCK: ProjectionLedgerClock = {
  now: () => new Date().toISOString(),
};

function fileSafe(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, "_");
}

export function projectionIdempotencyKey(input: {
  destination: string;
  runId: string;
  manifestDigest: Sha256Digest;
  policyVersion: string;
}): string {
  return digestCanonicalJson(input);
}

export class ProjectionLedger {
  constructor(
    private readonly rootDirectory: string,
    private readonly clock: ProjectionLedgerClock = SYSTEM_CLOCK,
  ) {}

  private projectionDirectory(projectionId: string): string {
    return resolve(this.rootDirectory, fileSafe(projectionId));
  }

  async initialize(
    projectionId: string,
    envelope: SafeProjectionEnvelopeV1,
  ): Promise<void> {
    scanSafeExport(envelope);
    const directory = this.projectionDirectory(projectionId);
    await mkdir(directory, { recursive: true });
    const envelopePath = resolve(directory, "envelope.json");
    try {
      await writeFile(envelopePath, `${JSON.stringify(envelope, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
      });
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
      const current = JSON.parse(await readFile(envelopePath, "utf8")) as unknown;
      if (digestCanonicalJson(current) !== digestCanonicalJson(envelope)) {
        throw new Error(`Projection ledger envelope conflict: ${projectionId}`);
      }
    }
  }

  async appendEvent(
    input: Omit<ProjectionLedgerEventV1, "schemaVersion" | "eventId" | "sequence" | "recordedAt" | "contentDigest">,
  ): Promise<ProjectionLedgerEventV1> {
    const directory = this.projectionDirectory(input.projectionId);
    await mkdir(directory, { recursive: true });
    const events = await this.readEvents(input.projectionId);
    const sequence = events.length + 1;
    const partial = {
      schemaVersion: "evaluation-projection-ledger-event.v1" as const,
      eventId: `${input.projectionId}:event:${sequence}`,
      sequence,
      ...input,
      recordedAt: this.clock.now(),
    };
    const event: ProjectionLedgerEventV1 = {
      ...partial,
      contentDigest: digestContentDocument(partial),
    };
    const outputPath = resolve(
      directory,
      `${String(sequence).padStart(4, "0")}-${event.status}-${event.contentDigest.slice(7, 19)}.json`,
    );
    await writeFile(outputPath, `${JSON.stringify(event, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    return event;
  }

  async readEvents(projectionId: string): Promise<ProjectionLedgerEventV1[]> {
    const directory = this.projectionDirectory(projectionId);
    let files: string[];
    try {
      files = (await readdir(directory)).filter((name) => /^\d{4}-.*\.json$/.test(name)).sort();
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    return Promise.all(
      files.map(async (name) =>
        JSON.parse(await readFile(resolve(directory, name), "utf8")) as ProjectionLedgerEventV1,
      ),
    );
  }

  async latestEvent(projectionId: string): Promise<ProjectionLedgerEventV1 | null> {
    return (await this.readEvents(projectionId)).at(-1) ?? null;
  }

  toProjectionReceipt(event: ProjectionLedgerEventV1): ProjectionReceiptV1 {
    const partial = {
      schemaVersion: "evaluation-projection-receipt.v1" as const,
      receiptId: `receipt:${event.eventId}`,
      projectionId: event.projectionId,
      runId: event.runId,
      destination: event.destination,
      status: event.status,
      idempotencyKey: event.idempotencyKey,
      attemptNumber: event.attemptNumber,
      localArtifactDigest: event.localArtifactDigest,
      ...(event.externalId === undefined ? {} : { externalId: event.externalId }),
      ...(event.reasonCode === undefined ? {} : { reasonCode: event.reasonCode }),
      createdAt: event.recordedAt,
    };
    return { ...partial, contentDigest: digestContentDocument(partial) };
  }

  async writeDeletionReceipt(
    input: Omit<DeletionReceiptV1, "schemaVersion" | "receiptId" | "createdAt" | "contentDigest">,
  ): Promise<DeletionReceiptV1> {
    const partial = {
      schemaVersion: "evaluation-deletion-receipt.v1" as const,
      receiptId: `deletion:${input.projectionId}:${digestCanonicalJson(input).slice(7, 19)}`,
      ...input,
      createdAt: this.clock.now(),
    };
    const receipt: DeletionReceiptV1 = {
      ...partial,
      contentDigest: digestContentDocument(partial),
    };
    const directory = this.projectionDirectory(input.projectionId);
    await mkdir(directory, { recursive: true });
    const outputPath = resolve(directory, `${fileSafe(receipt.receiptId)}.json`);
    try {
      await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
      });
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
    }
    return receipt;
  }
}

function isAlreadyExists(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
