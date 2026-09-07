import { chmod, link, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

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

  /** SQLite owns the process lock: a crash releases it without a stale PID lease. */
  async withProjectionLock<T>(projectionId: string, action: () => Promise<T>): Promise<T> {
    const directory = this.projectionDirectory(projectionId);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const path = resolve(directory, "mutation-lock.sqlite");
    const database = new DatabaseSync(path);
    const deadline = Date.now() + 30_000;
    try {
      await chmod(path, 0o600);
      for (;;) {
        try { database.exec("BEGIN IMMEDIATE"); break; }
        catch (error) {
          if (!(error instanceof Error) || !/locked|busy/i.test(error.message)) throw error;
          if (Date.now() >= deadline) throw new Error("OPIK_PROJECTION_BUSY");
          await new Promise<void>((done) => setTimeout(done, 20));
        }
      }
      try { return await action(); }
      finally { database.exec("ROLLBACK"); }
    } finally { database.close(); }
  }

  async requestDeletion(projectionId: string): Promise<void> {
    const directory = this.projectionDirectory(projectionId);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    try {
      await writeFile(resolve(directory, "deletion_requested.json"), JSON.stringify({ projectionId }),
        { flag: "wx", mode: 0o600 });
    } catch (error) { if (!isAlreadyExists(error)) throw error; }
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
    for (;;) {
      const events = await this.readEvents(input.projectionId);
      const sequence = (events.at(-1)?.sequence ?? 0) + 1;
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
        `${String(sequence).padStart(4, "0")}-event.json`,
      );
      const temporaryPath = resolve(directory, `.event-${randomUUID()}.tmp`);
      try {
        await writeFile(temporaryPath, `${JSON.stringify(event, null, 2)}\n`, {
          encoding: "utf8",
          flag: "wx",
          mode: 0o600,
        });
        await link(temporaryPath, outputPath);
      } catch (error) { if (isAlreadyExists(error)) continue; throw error; }
      finally { await rm(temporaryPath, { force: true }); }
      return event;
    }
  }

  async readEvents(projectionId: string): Promise<ProjectionLedgerEventV1[]> {
    const directory = this.projectionDirectory(projectionId);
    let files: string[];
    try {
      files = (await readdir(directory)).filter((name) => /^\d{4,}-.*\.json$/.test(name))
        .sort((left, right) => Number.parseInt(left) - Number.parseInt(right));
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

  async readEnvelope(projectionId: string): Promise<SafeProjectionEnvelopeV1> {
    const envelope = JSON.parse(await readFile(resolve(this.projectionDirectory(projectionId), "envelope.json"), "utf8")) as SafeProjectionEnvelopeV1;
    scanSafeExport(envelope);
    const events = await this.readEvents(projectionId);
    if (events.length === 0 || events.some((event) =>
      event.projectionId !== projectionId || event.envelopeDigest !== digestCanonicalJson(envelope) ||
      event.contentDigest !== digestContentDocument(event))) {
      throw new Error("OPIK_PROJECTION_LEDGER_INTEGRITY_FAILED");
    }
    return envelope;
  }

  async hasDeletionReceipt(projectionId: string): Promise<boolean> {
    return (await readdir(this.projectionDirectory(projectionId))).some((name) => name.startsWith("deletion_"));
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
      const existing = JSON.parse(await readFile(outputPath, "utf8")) as DeletionReceiptV1;
      const { schemaVersion: _schema, receiptId: _id, createdAt: _at, contentDigest: _digest, ...recorded } = existing;
      if (digestCanonicalJson(recorded) !== digestCanonicalJson(input) ||
        existing.contentDigest !== digestContentDocument(existing)) {
        throw new Error("OPIK_DELETION_RECEIPT_INTEGRITY_FAILED");
      }
      return existing;
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
