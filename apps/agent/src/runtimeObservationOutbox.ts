import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import {
  RuntimeObservationPolicySchema, RuntimeObservationSchema, RuntimeObservationSession,
  observationHash, observationID, type RuntimeObservation, type RuntimeObservationContext, type RuntimeObservationPolicy,
} from "./runtimeObservation.js";

export interface RuntimeObservationReceipt {
  schema_version: "runtime-observation-receipt.v1";
  trace_id: string;
  endpoint: string;
  workspace: string;
  project: string;
  state: "pending" | "retained" | "deletion_pending" | "deleted";
  attempts: number;
  updated_at: string;
  retention_expires_at: string;
  retained_span_ids: string[];
  deleted_span_ids: string[];
  content_states: Record<string, number>;
  error_code: string | null;
}
interface Entry {
  observation: RuntimeObservation | null;
  previous_observations?: RuntimeObservation[];
  receipt: RuntimeObservationReceipt;
}
interface Tombstone { trace_id: string; span_ids: string[]; created_at: string; policy_digest: string; }
export interface RuntimeObservationTransport {
  retain(observation: RuntimeObservation): Promise<void>;
  remove(traceID: string, spanIDs: readonly string[]): Promise<void>;
}
export class PrivateOpikRuntimeTransport implements RuntimeObservationTransport {
  readonly policy: RuntimeObservationPolicy;
  constructor(policy: RuntimeObservationPolicy, private readonly apiKey?: string, private readonly fetcher: typeof fetch = fetch) {
    this.policy = RuntimeObservationPolicySchema.parse(policy);
  }
  usesCredential(apiKey: string | undefined): boolean { return this.apiKey === apiKey; }
  private async request(path: string, method = "GET", body?: unknown): Promise<unknown> {
    const response = await this.fetcher(`${this.policy.endpoint.replace(/\/$/u, "")}/v1/private/${path}`, {
      method, redirect: "error", signal: AbortSignal.timeout(10_000),
      headers: { "content-type": "application/json", "Comet-Workspace": this.policy.workspace,
        ...(this.apiKey ? { authorization: this.apiKey } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 404 && method === "GET") return null;
    if (response.status === 404 && method === "DELETE") return null;
    if (!response.ok) throw new Error(`OPIK_RUNTIME_HTTP_${response.status}`);
    return response.status === 204 ? null : response.json().catch(() => null);
  }
  async retain(observation: RuntimeObservation): Promise<void> {
    if (observationHash(observation.policy) !== observationHash(this.policy)) throw new Error("OPIK_RUNTIME_TARGET_MISMATCH");
    const digest = observationHash(observation);
    const root = observation.spans.filter((span) => span.parent_span_id === null).at(-1)!;
    const metadata = { schema_version: observation.schema_version, policy_version: observation.policy.version,
      observation_digest: digest, source_workspace_id: observation.source_workspace_id,
      authorization_scope: observation.authorization_scope, run_id: observation.run_id,
      source_session_id: observation.source_session_id,
      source_product_run_id: observation.source_product_run_id,
      source_product_run_generation: observation.source_product_run_generation,
      source_lab_job_id: observation.source_lab_job_id,
      source_regression_id: observation.source_regression_id,
      source_regression_ids: observation.source_regression_ids,
      source_refs: observation.source_refs,
      attempt_id: observation.attempt_id, native_trace_id: observation.native_trace_id,
      retention_expires_at: observation.retention_expires_at };
    // Official REST API: https://www.comet.com/docs/opik/reference/rest-api/traces/create-trace
    const traceBody = { project_name: this.policy.project,
      name: `runtime:${observation.authorization_scope}`, start_time: root.started_at, end_time: root.ended_at,
      input: root.input, output: root.output, metadata, tags: ["talent-signal", "private_full_content.v1"] };
    await this.request("traces", "POST", { id: observation.id, ...traceBody });
    // POST is create-only on Opik 2.2.x. A resumed run keeps its trace identity
    // while PATCH advances the root to the newest completed attempt.
    const { start_time: _originalStart, ...traceUpdate } = traceBody;
    await this.request(`traces/${observation.id}`, "PATCH", traceUpdate);
    for (const span of observation.spans) {
      await this.request("spans", "POST", { id: span.id, trace_id: observation.id,
        project_name: this.policy.project, ...(span.parent_span_id ? { parent_span_id: span.parent_span_id } : {}),
        name: span.name, type: span.kind, start_time: span.started_at, end_time: span.ended_at,
        input: span.input, output: span.output, ...(span.model ? { model: span.model } : {}),
        ...(span.provider ? { provider: span.provider } : {}),
        metadata: { ...metadata, span_digest: observationHash(span), operation_id: span.operation_id,
          attempt: span.attempt, retry_of: span.retry_of, prompt_revision: span.prompt_revision,
          status: span.status, error_code: span.error_code, measurement: span.usage },
        // Parent/aggregate spans never own tokens; absent provider usage remains unknown.
        ...(span.usage.accounting === "leaf" && span.usage.source === "provider"
          && span.usage.input_tokens !== null && span.usage.output_tokens !== null
          ? { usage: { prompt_tokens: span.usage.input_tokens, completion_tokens: span.usage.output_tokens,
              total_tokens: span.usage.input_tokens + span.usage.output_tokens } } : {}),
        ...(span.usage.accounting === "leaf" && span.usage.cost_usd !== null && span.usage.cost_source !== "unavailable"
          ? { total_estimated_cost: span.usage.cost_usd } : {}),
      });
    }
    const trace = await this.request(`traces/${observation.id}`) as Record<string, unknown> | null;
    if (!trace || trace.id !== observation.id || observationHash(trace.input) !== observationHash(root.input)
      || observationHash(trace.output) !== observationHash(root.output)
      || (trace.metadata as Record<string, unknown> | undefined)?.observation_digest !== digest) throw new Error("OPIK_RUNTIME_TRACE_READBACK_MISMATCH");
    for (const span of observation.spans) {
      const remote = await this.request(`spans/${span.id}`) as Record<string, unknown> | null;
      if (!remote || remote.id !== span.id || remote.trace_id !== observation.id
        || (remote.parent_span_id ?? null) !== span.parent_span_id
        || (remote.metadata as Record<string, unknown> | undefined)?.span_digest !== observationHash(span)
        || observationHash((remote.metadata as Record<string, unknown> | undefined)?.measurement) !== observationHash(span.usage)
        || remote.name !== span.name || remote.type !== span.kind
        || observationHash(remote.input) !== observationHash(span.input)
        || observationHash(remote.output) !== observationHash(span.output)) throw new Error("OPIK_RUNTIME_SPAN_READBACK_MISMATCH");
    }
  }
  async remove(traceID: string, spanIDs: readonly string[]): Promise<void> {
    // Opik 2.2.45 returns 501 for individual span deletion. Delete the owned
    // trace and verify its cascade for every locally recorded child explicitly.
    await this.request(`traces/${traceID}`, "DELETE");
    if (await this.request(`traces/${traceID}`) !== null) throw new Error("OPIK_RUNTIME_DELETE_UNVERIFIED");
    for (const id of spanIDs) if (await this.request(`spans/${id}`) !== null) throw new Error("OPIK_RUNTIME_DELETE_UNVERIFIED");
  }
}

async function readJSON<T>(path: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(path, "utf8")) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
async function atomicJSON(path: string, value: unknown): Promise<void> {
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    const handle = await fs.open(temp, "wx", 0o600);
    try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); }
    finally { await handle.close(); }
    await fs.rename(temp, path);
    const directory = await fs.open(resolve(path, ".."), "r");
    try { await directory.sync(); } finally { await directory.close(); }
  } finally { await fs.rm(temp, { force: true }); }
}

interface LockOwner { pid: number; token?: string; created_at?: string; namespace?: string; process_started_at?: number; }
const processStartedAt = performance.timeOrigin;
async function lockSnapshot(path: string): Promise<{ raw: string; owner: LockOwner | null } | null> {
  let raw: string;
  try { raw = await fs.readFile(path, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  try { return { raw, owner: JSON.parse(raw) as LockOwner }; }
  catch { return { raw, owner: null }; }
}
async function acquireProcessLock(path: string, depth = 0): Promise<() => Promise<void>> {
  if (depth > 16) throw new Error("RUNTIME_OBSERVATION_BUSY");
  const owner = { pid: process.pid, token: randomUUID(), created_at: new Date().toISOString(),
    namespace: hostname(), process_started_at: processStartedAt };
  const prepared = `${path}.${owner.token}.claim`;
  // Publish a fully written owner record atomically. A crash between create and
  // write must never leave an ownerless lock that cannot be recovered.
  await atomicJSON(prepared, owner);
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await fs.link(prepared, path);
        return async () => {
          if ((await readJSON<LockOwner>(path))?.token === owner.token) await fs.unlink(path);
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const previous = await lockSnapshot(path);
        if (!previous) continue;
        // The current hard-link protocol can only publish complete records.
        // Empty/malformed files are pre-protocol crash residue, not active locks.
        let dead = !previous.owner;
        if (previous.owner && previous.owner.namespace !== owner.namespace) throw new Error("RUNTIME_OBSERVATION_BUSY");
        if (previous.owner && Number.isInteger(previous.owner.pid) && previous.owner.pid > 0) {
          if (previous.owner.pid === process.pid && previous.owner.process_started_at !== undefined
            && previous.owner.process_started_at !== processStartedAt) dead = true;
          else try { process.kill(previous.owner.pid, 0); }
          catch (failure) { dead = (failure as NodeJS.ErrnoException).code === "ESRCH"; }
        }
        if (!dead) throw new Error("RUNTIME_OBSERVATION_BUSY");
        // Fence recovery by the exact dead owner. Recovery claims themselves use
        // recoverable locks, so a crash while reclaiming cannot strand the queue.
        const recoveryPath = join(resolve(path, ".."), `recovery-${observationHash([path, previous.raw])}.lock`);
        const release = await acquireProcessLock(recoveryPath, depth + 1);
        try {
          const current = await lockSnapshot(path);
          if (current?.raw === previous.raw) await fs.unlink(path);
        } finally { await release(); }
      }
    }
    throw new Error("RUNTIME_OBSERVATION_BUSY");
  } finally { await fs.rm(prepared, { force: true }); }
}
export class RuntimeObservationOutbox {
  private readonly root: string;
  private sourceValidator: ((context: RuntimeObservationContext) => Promise<boolean>) | undefined;
  constructor(root: string, readonly policy: RuntimeObservationPolicy, private readonly transport: RuntimeObservationTransport) {
    this.root = resolve(root); this.policy = RuntimeObservationPolicySchema.parse(policy);
  }
  private path(id: string) {
    if (!/^[a-f0-9-]{36}$/u.test(id)) throw new Error("RUNTIME_OBSERVATION_ID_INVALID");
    return join(this.root, `${id}.json`);
  }
  private tombstonePath(id: string) { return `${this.path(id)}.tombstone`; }
  private async locked<T>(id: string, execute: () => Promise<T>, writing = false): Promise<T> {
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    let release: (() => Promise<void>) | undefined;
    for (let attempt = 0; !release; attempt++) {
      try { release = await acquireProcessLock(`${this.path(id)}${writing ? ".write" : ""}.lock`); }
      catch (error) {
        if (!writing || attempt >= 99 || !(error instanceof Error) || error.message !== "RUNTIME_OBSERVATION_BUSY") throw error;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    try { return await execute(); } finally { await release(); }
  }
  private observations(entry: Entry): RuntimeObservation[] {
    return [...(entry.previous_observations ?? []), ...(entry.observation ? [entry.observation] : [])];
  }
  setSourceValidator(validate: (context: RuntimeObservationContext) => Promise<boolean>): void { this.sourceValidator = validate; }
  private context(value: RuntimeObservation): RuntimeObservationContext {
    return { run_id: value.run_id, workspace_id: value.source_workspace_id, authorization_scope: value.authorization_scope,
      source_session_id: value.source_session_id, source_product_run_id: value.source_product_run_id, source_product_run_generation: value.source_product_run_generation, source_lab_job_id: value.source_lab_job_id,
      source_regression_id: value.source_regression_id, source_regression_ids: value.source_regression_ids, source_refs: value.source_refs };
  }
  private async sourceAvailable(value: RuntimeObservation): Promise<boolean> {
    if (value.source_refs.kind === "synthetic" && !value.source_product_run_id && !value.source_lab_job_id && !value.source_regression_id && !value.source_regression_ids.length) return true;
    if (!this.sourceValidator) throw new Error("OPIK_RUNTIME_SOURCE_VALIDATION_REQUIRED");
    return this.sourceValidator(this.context(value));
  }
  private async persistExportEntry(id: string, entry: Entry): Promise<void> {
    await this.locked(id, async () => {
      // A source deletion can arrive during the network request. The exporter
      // must never write its older full-content snapshot over that tombstone.
      if (await readJSON(this.tombstonePath(id))) return;
      await atomicJSON(this.path(id), entry);
    }, true);
  }
  private async purgeContentFiles(id: string, pending: boolean): Promise<void> {
    // Called only under the local write lock; active enqueue writes cannot be
    // mistaken for crash leftovers or race the deletion tombstone.
    for (const name of await fs.readdir(this.root)) {
      if (name.startsWith(`${id}.`) && !name.includes(".lock.")
        && (name.endsWith(".tmp") || (pending && name.endsWith(".pending")))) {
        await fs.rm(join(this.root, name), { force: true });
      }
    }
  }
  private async mergePending(id: string): Promise<void> {
    for (const name of (await fs.readdir(this.root)).filter((name) => name.startsWith(`${id}.`) && name.endsWith(".pending"))) {
      const path = join(this.root, name);
      if (await readJSON(this.tombstonePath(id))) { await fs.unlink(path); continue; }
      const observation = RuntimeObservationSchema.parse(await readJSON(path));
      if (observationHash(observation.policy) !== observationHash(this.policy)) throw new Error("OPIK_RUNTIME_TARGET_MISMATCH");
      const existing = await readJSON<Entry>(this.path(id));
      const previous = existing ? this.observations(existing) : [];
      if (existing?.observation) {
        const old = existing.observation;
        if (observation.authorization_scope !== old.authorization_scope) throw new Error("RUNTIME_OBSERVATION_SCOPE_MISMATCH");
      }
      const duplicate = previous.find((item) => item.attempt_id === observation.attempt_id);
      if (duplicate) {
        if (observationHash(duplicate) !== observationHash(observation)) throw new Error("RUNTIME_OBSERVATION_ATTEMPT_CONFLICT");
        await fs.unlink(path); continue;
      }
      const states: Record<string, number> = {};
      for (const item of [...previous, observation]) for (const span of item.spans) for (const content of [span.input, span.output]) states[content.status] = (states[content.status] ?? 0) + 1;
      await atomicJSON(this.path(id), { observation, previous_observations: previous, receipt: {
        schema_version: "runtime-observation-receipt.v1", trace_id: id,
        endpoint: this.policy.endpoint, workspace: this.policy.workspace, project: this.policy.project,
        state: "pending", attempts: existing?.receipt.attempts ?? 0, updated_at: new Date().toISOString(),
        retention_expires_at: existing?.receipt.retention_expires_at ?? observation.retention_expires_at, retained_span_ids: existing?.receipt.retained_span_ids ?? [],
        deleted_span_ids: [], content_states: states, error_code: null,
      } satisfies RuntimeObservationReceipt });
      await fs.unlink(path);
    }
  }
  async enqueue(raw: RuntimeObservation): Promise<void> {
    const observation = RuntimeObservationSchema.parse(raw);
    if (observationHash(observation.policy) !== observationHash(this.policy)) throw new Error("RUNTIME_OBSERVATION_POLICY_MISMATCH");
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    const pending = join(this.root, `${observation.id}.${observation.attempt_id}.pending`);
    // Persist before competing for an exporter lock: Opik downtime or a concurrent
    // resume can never discard a newly completed local observation.
    await this.locked(observation.id, async () => {
      if (await readJSON(this.tombstonePath(observation.id))) throw new Error("RUNTIME_OBSERVATION_DELETED");
      await this.purgeContentFiles(observation.id, false);
      await atomicJSON(pending, observation);
    }, true);
  }
  async deleteRun(context: Pick<RuntimeObservationContext, "workspace_id" | "run_id">, deferRemote = false): Promise<void> {
    if (!this.policy.source_workspace_ids.includes(context.workspace_id)) throw new Error("RUNTIME_OBSERVATION_SCOPE_DENIED");
    const id = observationID(`${context.workspace_id}:${context.run_id}`);
    await this.locked(id, async () => {
      let entry = await readJSON<Entry>(this.path(id));
      const existing = await readJSON<Tombstone>(this.tombstonePath(id));
      if ((entry && (entry.receipt.endpoint !== this.policy.endpoint || entry.receipt.workspace !== this.policy.workspace
        || entry.receipt.project !== this.policy.project)) || (existing && existing.policy_digest !== observationHash(this.policy))) {
        throw new Error("OPIK_RUNTIME_TARGET_MISMATCH");
      }
      const spanIDs = [...new Set([...(existing?.span_ids ?? []), ...(entry ? this.observations(entry).flatMap((item) => item.spans.map((span) => span.id)) : []),
        ...(entry?.receipt.retained_span_ids ?? [])])];
      // Pending attempts have never crossed the exporter boundary. Deletion does
      // not need to parse or merge them, including a malformed/oversized attempt.
      await atomicJSON(this.tombstonePath(id), { trace_id: id, span_ids: spanIDs, created_at: existing?.created_at ?? new Date().toISOString(), policy_digest: observationHash(this.policy) });
      await this.purgeContentFiles(id, true);
      if (!entry) entry = { observation: null, previous_observations: [], receipt: {
        schema_version: "runtime-observation-receipt.v1", trace_id: id, endpoint: this.policy.endpoint,
        workspace: this.policy.workspace, project: this.policy.project, state: "deletion_pending", attempts: 0,
        updated_at: new Date().toISOString(), retention_expires_at: new Date().toISOString(),
        retained_span_ids: [], deleted_span_ids: [], content_states: {}, error_code: null,
      } };
      if (entry) {
        entry.observation = null; entry.previous_observations = [];
        entry.receipt.state = "deletion_pending";
        entry.receipt.updated_at = new Date().toISOString();
        await atomicJSON(this.path(id), entry);
      }
    }, true);
    if (!deferRemote) await this.flush();
  }
  async flush(now = Date.now()): Promise<void> {
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    const files = await fs.readdir(this.root);
    const failures: unknown[] = [];
    for (const id of [...new Set(files.filter((name) => name.endsWith(".json") || name.endsWith(".json.tombstone") || name.endsWith(".pending") || name.endsWith(".tmp")).map((name) => name.slice(0, 36)))]) {
      try { await this.locked(id, async () => {
        let entry = await readJSON<Entry>(this.path(id));
        let tombstone = await readJSON<Tombstone>(this.tombstonePath(id));
        if (entry && (entry.receipt.endpoint !== this.policy.endpoint || entry.receipt.workspace !== this.policy.workspace
          || entry.receipt.project !== this.policy.project)) throw new Error("OPIK_RUNTIME_TARGET_MISMATCH");
        if (tombstone && tombstone.policy_digest !== observationHash(this.policy)) throw new Error("OPIK_RUNTIME_TARGET_MISMATCH");
        if (!tombstone && (!entry || Date.parse(entry.receipt.retention_expires_at) > now)) {
          await this.locked(id, async () => {
            await this.purgeContentFiles(id, false);
            await this.mergePending(id);
          }, true);
          entry = await readJSON<Entry>(this.path(id));
        }
        if (entry && Date.parse(entry.receipt.retention_expires_at) <= now && !tombstone) {
          tombstone = { trace_id: id, span_ids: [...new Set([...this.observations(entry).flatMap((item) => item.spans.map((span) => span.id)), ...entry.receipt.retained_span_ids])],
            created_at: new Date(now).toISOString(), policy_digest: observationHash(this.policy) };
          await this.locked(id, async () => {
            await atomicJSON(this.tombstonePath(id), tombstone);
            await this.purgeContentFiles(id, true);
            entry!.observation = null; entry!.previous_observations = []; entry!.receipt.state = "deletion_pending";
            await atomicJSON(this.path(id), entry);
          }, true);
        }
        if (!tombstone && entry?.receipt.state === "retained") {
          for (const observation of this.observations(entry)) {
            if (!(await this.sourceAvailable(observation))) { await this.deleteRun(this.context(observation), true); break; }
          }
          tombstone = await readJSON<Tombstone>(this.tombstonePath(id));
          if (tombstone) entry = await readJSON<Entry>(this.path(id));
        }
        if (!tombstone && entry?.receipt.state !== "pending") return;
        if (entry) { entry.receipt.attempts++; entry.receipt.updated_at = new Date(now).toISOString(); }
        try {
          if (tombstone) {
            await this.locked(id, () => this.purgeContentFiles(id, true), true);
            await this.transport.remove(id, tombstone.span_ids);
            if (entry) { entry.observation = null; entry.previous_observations = []; entry.receipt.state = "deleted";
              entry.receipt.deleted_span_ids = tombstone.span_ids; entry.receipt.retained_span_ids = []; }
          } else if (entry?.observation) {
            for (const observation of this.observations(entry)) {
              if (await readJSON(this.tombstonePath(id))) break;
              RuntimeObservationSchema.parse(observation);
              if (observationHash(observation.policy) !== observationHash(this.policy)) throw new Error("OPIK_RUNTIME_TARGET_MISMATCH");
              if (!(await this.sourceAvailable(observation))) { await this.deleteRun(this.context(observation), true); break; }
              if (observation.spans.every((span) => entry!.receipt.retained_span_ids.includes(span.id))) continue;
              await this.transport.retain(observation);
              if (!(await this.sourceAvailable(observation))) { await this.deleteRun(this.context(observation), true); break; }
              entry.receipt.retained_span_ids = [...new Set([...entry.receipt.retained_span_ids, ...observation.spans.map((span) => span.id)])];
              await this.persistExportEntry(id, entry);
            }
            entry.receipt.state = "retained";
          }
          if (entry) entry.receipt.error_code = null;
        } catch {
          if (entry) { entry.receipt.state = tombstone ? "deletion_pending" : "pending";
            entry.receipt.error_code = tombstone ? "OPIK_RUNTIME_DELETE_RETRY_REQUIRED" : "OPIK_RUNTIME_EXPORT_RETRY_REQUIRED"; }
        }
        if (entry) {
          if (tombstone) await this.locked(id, () => atomicJSON(this.path(id), entry), true);
          else await this.persistExportEntry(id, entry);
        }
      }); } catch (error) {
        if (!(error instanceof Error) || error.message !== "RUNTIME_OBSERVATION_BUSY") failures.push(error);
      }
    }
    if (failures.length) throw failures[0];
  }
  async status(): Promise<{ spooled: number; locks: number; pending: number; retained: number; deletion_pending: number; deleted: number; receipts: RuntimeObservationReceipt[] }> {
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    const receipts: RuntimeObservationReceipt[] = [];
    for (const name of (await fs.readdir(this.root)).filter((name) => name.endsWith(".json"))) {
      const entry = await readJSON<Entry>(join(this.root, name)); if (entry) receipts.push(entry.receipt);
    }
    const names = await fs.readdir(this.root);
    return { spooled: names.filter((name) => name.endsWith(".pending")).length,
      locks: names.filter((name) => name.endsWith(".lock")).length, pending: receipts.filter((item) => item.state === "pending").length,
      retained: receipts.filter((item) => item.state === "retained").length,
      deletion_pending: receipts.filter((item) => item.state === "deletion_pending").length,
      deleted: receipts.filter((item) => item.state === "deleted").length, receipts };
  }
  async sourceRuns(): Promise<RuntimeObservationContext[]> {
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    const runs = new Map<string, RuntimeObservationContext>();
    for (const name of await fs.readdir(this.root)) {
      if (!name.endsWith(".json") && !name.endsWith(".pending")) continue;
      const value = await readJSON<Entry | RuntimeObservation>(join(this.root, name));
      const observations = value && "observation" in value ? this.observations(value) : value ? [value] : [];
      for (const raw of observations) {
        const parsed = RuntimeObservationSchema.safeParse(raw);
        if (!parsed.success) {
          // Pre-lineage entries are deletion candidates, never export authority.
          if (raw && typeof raw.source_workspace_id === "string" && typeof raw.run_id === "string"
            && raw.id === observationID(`${raw.source_workspace_id}:${raw.run_id}`)
            && observationHash(raw.policy) === observationHash(this.policy)) {
            runs.set(raw.id, { run_id: raw.run_id, workspace_id: raw.source_workspace_id,
              authorization_scope: raw.authorization_scope });
            continue;
          }
          throw new Error("RUNTIME_OBSERVATION_LOCAL_RECORD_INVALID");
        }
        const item = parsed.data;
        if (observationHash(item.policy) !== observationHash(this.policy)) throw new Error("OPIK_RUNTIME_TARGET_MISMATCH");
        runs.set(`${item.id}:${item.attempt_id}`, this.context(item));
      }
    }
    return [...runs.values()];
  }
}
export class RuntimeObserver {
  last_error_code: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor(readonly outbox: RuntimeObservationOutbox, private readonly secrets: string[] = []) {}
  startBackgroundExport(): void {
    if (this.timer) return;
    const flush = () => { void this.outbox.flush().catch(() => { this.last_error_code = "RUNTIME_OBSERVATION_EXPORT_UNAVAILABLE"; }); };
    flush(); this.timer = setInterval(flush, 30_000); this.timer.unref();
  }
  dispose(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }
  addCredential(secret: string): void { if (secret && !this.secrets.includes(secret)) this.secrets.push(secret); }
  start(context: RuntimeObservationContext, input: unknown): RuntimeObservationSession | null {
    try { return new RuntimeObservationSession(this.outbox.policy, context, input, this.outbox, this.secrets); }
    catch (error) { this.last_error_code = error instanceof Error && error.message === "RUNTIME_OBSERVATION_SOURCE_LINEAGE_REQUIRED"
      ? error.message : "RUNTIME_OBSERVATION_SCOPE_DENIED"; return null; }
  }
  async complete(session: RuntimeObservationSession | null, output: unknown, status: "ok" | "error"): Promise<void> {
    if (!session) return;
    try {
      await session.complete(output, status); this.last_error_code = null;
      // Network availability never sits on the product's completion path.
      void this.outbox.flush().catch(() => { this.last_error_code = "RUNTIME_OBSERVATION_EXPORT_UNAVAILABLE"; });
    } catch { this.last_error_code = "RUNTIME_OBSERVATION_LOCAL_RECORD_UNAVAILABLE"; }
  }
}
let processObserver: { signature: string; transport: PrivateOpikRuntimeTransport; observer: RuntimeObserver } | undefined;
export function createEnvironmentRuntimeObserver(environment: NodeJS.ProcessEnv = process.env): RuntimeObserver | null {
  const configured = environment.TALENT_SIGNAL_OPIK_RUNTIME_POLICY?.trim();
  if (!configured) {
    if (environment === process.env) { processObserver?.observer.dispose(); processObserver = undefined; }
    return null;
  }
  const policy = RuntimeObservationPolicySchema.parse(JSON.parse(configured));
  const directory = environment.TALENT_SIGNAL_OPIK_RUNTIME_OUTBOX?.trim();
  if (!directory) throw new Error("RUNTIME_OBSERVATION_OUTBOX_REQUIRED");
  const signature = observationHash([configured, directory]);
  // Credentials are transport state, never content-addressed identity. Compare
  // the credential the existing transport already owns without storing a digest
  // or a second credential copy in the process cache.
  if (environment === process.env && processObserver?.signature === signature
    && processObserver.transport.usesCredential(environment.OPIK_API_KEY)) return processObserver.observer;
  const secrets = Object.entries(environment).filter(([key]) => /(?:KEY|TOKEN|PASSWORD|SECRET)$/u.test(key))
    .flatMap(([, value]) => value ? [value] : []);
  const transport = new PrivateOpikRuntimeTransport(policy, environment.OPIK_API_KEY);
  const observer = new RuntimeObserver(new RuntimeObservationOutbox(directory, policy, transport), secrets);
  if (environment === process.env) { processObserver?.observer.dispose(); processObserver = { signature, transport, observer }; }
  observer.startBackgroundExport(); return observer;
}
