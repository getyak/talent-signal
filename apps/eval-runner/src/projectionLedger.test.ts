import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { digestCanonicalJson } from "@talent-signal/evaluation";
import { afterEach, describe, expect, it } from "vitest";

import { ProjectionLedger } from "./projectionLedger.js";

const directories: string[] = [];
async function directory() {
  const path = await mkdtemp(join(tmpdir(), "get13-ledger-")); directories.push(path); return path;
}
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe("projection ledger concurrency", () => {
  it("returns the persisted deletion receipt on a repeated request", async () => {
    let tick = 0;
    const ledger = new ProjectionLedger(await directory(), { now: () => new Date(1_700_000_000_000 + tick++).toISOString() });
    const input = { projectionId: "opik:synthetic", status: "deleted" as const, readBackVerified: true,
      deletionScope: "trace_projection" as const, retainedSurfaces: ["immutable_local_authority"],
      reasonCode: "OPIK_TRACE_AND_EXPERIMENT_LINK_DELETE_VERIFIED" };
    expect(await ledger.writeDeletionReceipt(input)).toEqual(await ledger.writeDeletionReceipt(input));
  });

  it("publishes complete unique sequence files under concurrent appends", async () => {
    const ledger = new ProjectionLedger(await directory());
    const content = digestCanonicalJson({ synthetic: true });
    await Promise.all(Array.from({ length: 24 }, (_, attempt) => ledger.appendEvent({
      projectionId: "opik:synthetic", runId: "synthetic", destination: "opik", idempotencyKey: content,
      attemptNumber: attempt + 1, status: "pending", policyVersion: "test.v1",
      envelopeDigest: content, localArtifactDigest: content,
    })));
    const events = await ledger.readEvents("opik:synthetic");
    expect(events.map((event) => event.sequence)).toEqual(Array.from({ length: 24 }, (_, index) => index + 1));
    expect(new Set(events.map((event) => event.attemptNumber)).size).toBe(24);
  });

  it("recovers a process lock after a writer dies without manual stale-lock deletion", async () => {
    const path = await directory(); const ledger = new ProjectionLedger(path);
    await ledger.withProjectionLock("opik:synthetic", async () => {});
    const child = spawn(process.execPath, ["-e",
      "const {DatabaseSync}=require('node:sqlite'); const db=new DatabaseSync(process.argv[1]); db.exec('BEGIN IMMEDIATE'); process.stdout.write('locked'); setInterval(()=>{},1000);",
      join(path, "opik_synthetic", "mutation-lock.sqlite")], { stdio: ["ignore", "pipe", "ignore"] });
    try {
      await once(child.stdout!, "data");
      const exited = once(child, "exit"); child.kill("SIGKILL"); await exited;
      expect(await ledger.withProjectionLock("opik:synthetic", async () => "recovered")).toBe("recovered");
    } finally { child.kill("SIGKILL"); }
  });
});
