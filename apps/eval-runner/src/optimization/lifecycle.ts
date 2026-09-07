import { randomUUID } from "node:crypto";
import { watch, type FSWatcher } from "node:fs";
import type { FileOptimizationBudgetLedger } from "./budget.js";
import { readControllerJson, writeControllerArtifact } from "./controllerFiles.js";

export interface OptimizationLifecycleHeartbeat {
  schemaVersion: "optimization-lifecycle-heartbeat.v1";
  owner: string;
  pid: number;
  state: "active" | "unavailable" | "stopped" | "swept_once";
  observedAt: string;
  datasetDigest: string | null;
  nextSweepWithinMs: 30000;
}
/** Fresh successful maintenance by a still-live owner is required for private paid work. */
export function assertOptimizationLifecycleCurrent(directory: string, datasetDigest?: string): void {
  let value: OptimizationLifecycleHeartbeat;
  try { value = readControllerJson(directory, "lifecycle.json") as OptimizationLifecycleHeartbeat; }
  catch { throw new Error("OPTIMIZATION_SOURCE_MAINTENANCE_REQUIRED"); }
  const age = Date.now() - Date.parse(value.observedAt);
  let alive = false;
  if (Number.isSafeInteger(value.pid) && value.pid > 0) { try { process.kill(value.pid, 0); alive = true; } catch { /* No active owner. */ } }
  if (value.schemaVersion !== "optimization-lifecycle-heartbeat.v1" || value.state !== "active" || !alive
    || !Number.isFinite(age) || age < 0 || age > 60000 || (datasetDigest !== undefined && value.datasetDigest !== datasetDigest)) throw new Error("OPTIMIZATION_SOURCE_MAINTENANCE_REQUIRED");
}
export async function runOptimizationLifecycle(input: {
  directory: string;
  ledger: FileOptimizationBudgetLedger;
  signal?: AbortSignal;
  once?: boolean;
  watchedFiles?: readonly string[];
  sweep: () => Promise<string | null>;
}): Promise<OptimizationLifecycleHeartbeat> {
  const owner = randomUUID();
  input.ledger.acquireMaintenanceController(owner);
  let value: OptimizationLifecycleHeartbeat = { schemaVersion: "optimization-lifecycle-heartbeat.v1", owner, pid: process.pid,
    state: "unavailable", observedAt: new Date().toISOString(), datasetDigest: null, nextSweepWithinMs: 30000 };
  const persist = () => writeControllerArtifact(input.directory, "lifecycle.json", value);
  try {
    do {
      try {
        const datasetDigest = await input.sweep();
        value = { ...value, state: input.once ? "swept_once" : "active", observedAt: new Date().toISOString(), datasetDigest };
      } catch {
        value = { ...value, state: "unavailable", observedAt: new Date().toISOString(), datasetDigest: null };
      }
      persist();
      if (input.once || input.signal?.aborted) break;
      await new Promise<void>((resolve, reject) => {
        let watcher: FSWatcher | undefined;
        const end = () => { clearTimeout(timer); watcher?.close(); input.signal?.removeEventListener("abort", end); resolve(); };
        const timer = setTimeout(end, 30000);
        try { watcher = watch(input.directory, (_event, filename) => { if (filename && input.watchedFiles?.includes(filename.toString())) end(); }); }
        catch (error) { clearTimeout(timer); reject(error); return; }
        input.signal?.addEventListener("abort", end, { once: true });
        if (input.signal?.aborted) end();
      });
    } while (!input.signal?.aborted);
    return value;
  } finally {
    try { if (!input.once) { value = { ...value, state: "stopped", observedAt: new Date().toISOString() }; persist(); } }
    finally { input.ledger.releaseRunController("controller-maintenance", owner); }
  }
}
