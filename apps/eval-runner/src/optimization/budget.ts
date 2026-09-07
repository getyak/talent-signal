import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

/** Money is always integer millionths of the explicitly authorized currency. */
export interface OptimizationBudgetResources {
  amountMicros: number;
  calls: number;
  tokens: number;
  elapsedMs: number;
  candidateCount: number;
}

export interface OptimizationBudgetLimits extends OptimizationBudgetResources {
  concurrency: number;
}

export interface OptimizationBudgetBindings {
  baselineDigest: string;
  datasetDigest: string;
  evaluatorVersion: string;
  optimizerVersion: string;
}

/** An operator-authored input, never an authorization inferred from a model. */
export interface OptimizationBudgetPermit {
  permitId: string;
  budgetScopeId: string;
  status: "active" | "revoked";
  issuedAt: string;
  expiresAt: string;
  currency: string;
  runLimits: OptimizationBudgetLimits;
  monthlyLimits: OptimizationBudgetLimits;
  finalValidationReserve: OptimizationBudgetResources;
}

export interface OptimizationBudgetRunInput {
  runId: string;
  bindings: OptimizationBudgetBindings;
  permit?: OptimizationBudgetPermit;
}

export type OptimizationBudgetOperationKind =
  | "generator" | "subject" | "judge" | "nested" | "retry" | "final_validation";

export interface OptimizationBudgetReservationInput extends OptimizationBudgetRunInput {
  operationId: string;
  kind: OptimizationBudgetOperationKind;
  /** A retry is admissible only for a prior reservation proved never issued. */
  retryOf?: string;
  phase: "search" | "final_validation";
  upperBound: OptimizationBudgetResources;
}

export interface OptimizationBudgetReservation {
  operationId: string;
  kind: OptimizationBudgetOperationKind;
  retryOf?: string;
  phase: "search" | "final_validation";
  upperBound: OptimizationBudgetResources;
  state: "reserved" | "issued" | "unknown" | "settled" | "cancelled";
  reservedAt: string;
  issuedAt?: string;
  actual?: OptimizationBudgetResources;
}

export interface OptimizationBudgetRun {
  runId: string;
  bindings: OptimizationBudgetBindings;
  permit: OptimizationBudgetPermit | null;
  status: "unconfigured" | "running" | "checkpointed" | "completed" | "tombstoned";
  reason: string;
  startedAt: string;
  observedAt: string;
  period: string;
  operations: OptimizationBudgetReservation[];
}

interface BudgetState {
  schemaVersion: "optimization-budget-ledger.v1";
  runs: OptimizationBudgetRun[];
  revokedPermitIds: string[];
  monthlyPolicies: Array<{ scope: string; currency: string; period: string; limits: OptimizationBudgetLimits }>;
  controllers?: Array<{ runId: string; owner: string; pid: number }>;
}

export class OptimizationBudgetError extends Error {
  constructor(readonly code: string) {
    super(`Optimization budget: ${code}`);
    this.name = "OptimizationBudgetError";
  }
}

const dimensions = ["amountMicros", "calls", "tokens", "elapsedMs", "candidateCount"] as const;
const zero = (): OptimizationBudgetResources => ({ amountMicros: 0, calls: 0, tokens: 0, elapsedMs: 0, candidateCount: 0 });
const clone = <T>(value: T): T => structuredClone(value);
function fail(code: string): never { throw new OptimizationBudgetError(code); }
const canonical = (value: unknown): string => JSON.stringify(value, (_, item: unknown) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const digest = (value: unknown): string => createHash("sha256").update(canonical(value)).digest("hex");

function identifier(value: string): void {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,255}$/.test(value)) fail("invalid_identifier");
}

function exactKeys(value: object, required: readonly string[], optional: readonly string[] = []): void {
  if (!value || typeof value !== "object" || Array.isArray(value) || required.some((key) => !Object.hasOwn(value, key)) || Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key))) fail("invalid_fields");
}

function resources(value: OptimizationBudgetResources, isLimit = false): void {
  if (!value || dimensions.some((key) => !Number.isSafeInteger(value[key]) || value[key] < 0)) fail("invalid_resources");
  exactKeys(value, isLimit ? [...dimensions, "concurrency"] : dimensions);
}

function limits(value: OptimizationBudgetLimits): void {
  resources(value, true);
  if (!Number.isSafeInteger(value.concurrency) || value.concurrency < 1) fail("invalid_concurrency");
}

function plus(a: OptimizationBudgetResources, b: OptimizationBudgetResources): OptimizationBudgetResources {
  const result = zero();
  for (const key of dimensions) {
    result[key] = a[key] + b[key];
    if (!Number.isSafeInteger(result[key])) fail("resource_overflow");
  }
  return result;
}

function within(usage: OptimizationBudgetResources, ceiling: OptimizationBudgetResources, prefix: string): void {
  for (const key of dimensions) if (usage[key] > ceiling[key]) fail(`${prefix}_${key}`);
}

function usage(run: OptimizationBudgetRun): OptimizationBudgetResources {
  return run.operations.reduce((sum, op) => op.state === "cancelled" ? sum : plus(sum, op.actual ?? op.upperBound), zero());
}

function finalHold(run: OptimizationBudgetRun): OptimizationBudgetResources {
  const held = clone(run.permit?.finalValidationReserve ?? zero());
  if (run.status === "completed" || run.status === "tombstoned") return zero();
  for (const op of run.operations) {
    if (op.phase !== "final_validation" || op.state === "cancelled") continue;
    for (const key of dimensions) held[key] = Math.max(0, held[key] - (op.actual ?? op.upperBound)[key]);
  }
  return held;
}

function active(op: OptimizationBudgetReservation): boolean {
  // An unknown issued request can still be running at the provider.
  return op.state === "reserved" || op.state === "issued" || op.state === "unknown";
}

/**
 * One local SQLite file must be shared by every worker for one billing scope.
 * BEGIN IMMEDIATE serializes admission across processes. FULL synchronous
 * commits precede execution; process loss releases SQLite locks, never spend.
 * No prompts, evidence, responses, API keys or provider error text are stored.
 */
export class FileOptimizationBudgetLedger {
  private readonly db: DatabaseSync;
  private readonly clock: () => Date;
  private readonly maxRuns: number;
  private readonly maxOperations: number;

  constructor(options: { path: string; clock?: () => Date; lockTimeoutMs?: number; maxRuns?: number; maxOperations?: number }) {
    if (!options.path || options.path === ":memory:") fail("durable_path_required");
    const path = resolve(options.path);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) fail("ledger_symlink_rejected");
    this.db = new DatabaseSync(path, { timeout: options.lockTimeoutMs ?? 5_000, allowExtension: false });
    chmodSync(path, 0o600);
    this.db.exec("PRAGMA synchronous = FULL; PRAGMA journal_mode = DELETE; CREATE TABLE IF NOT EXISTS budget_state (id INTEGER PRIMARY KEY CHECK (id = 1), document TEXT NOT NULL)");
    this.db.prepare("INSERT OR IGNORE INTO budget_state (id, document) VALUES (1, ?)").run(JSON.stringify({ schemaVersion: "optimization-budget-ledger.v1", runs: [], revokedPermitIds: [], monthlyPolicies: [] }));
    this.clock = options.clock ?? (() => new Date());
    this.maxRuns = options.maxRuns ?? 1_000;
    this.maxOperations = options.maxOperations ?? 10_000;
    if (![this.maxRuns, this.maxOperations].every((n) => Number.isSafeInteger(n) && n > 0)) fail("invalid_ledger_bound");
  }

  close(): void { this.db.close(); }

  private transaction<T>(change: (state: BudgetState, now: Date) => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.db.prepare("SELECT document FROM budget_state WHERE id = 1").get();
      if (!row || typeof row.document !== "string" || row.document.length > 8_000_000) fail("invalid_ledger");
      const state = JSON.parse(row.document) as BudgetState;
      if (state.schemaVersion !== "optimization-budget-ledger.v1" || !Array.isArray(state.runs)) fail("invalid_ledger");
      const now = this.clock();
      if (!Number.isFinite(now.getTime())) fail("invalid_clock");
      const result = change(state, now);
      const encoded = JSON.stringify(state);
      if (encoded.length > 8_000_000) fail("ledger_capacity_exhausted");
      this.db.prepare("UPDATE budget_state SET document = ? WHERE id = 1").run(encoded);
      this.db.exec("COMMIT");
      return clone(result);
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private find(state: BudgetState, runId: string): OptimizationBudgetRun {
    return state.runs.find((run) => run.runId === runId) ?? fail("run_not_found");
  }

  private permit(permit: OptimizationBudgetPermit | undefined, state: BudgetState, now: Date): OptimizationBudgetPermit {
    if (!permit || !permit.currency || !permit.runLimits?.amountMicros || !permit.monthlyLimits?.amountMicros) fail("unconfigured");
    exactKeys(permit, ["permitId", "budgetScopeId", "status", "issuedAt", "expiresAt", "currency", "runLimits", "monthlyLimits", "finalValidationReserve"]);
    identifier(permit.permitId);
    identifier(permit.budgetScopeId);
    if (!/^[A-Z]{3}$/.test(permit.currency)) fail("invalid_currency");
    if (permit.status !== "active" || state.revokedPermitIds.includes(permit.permitId)) fail("permit_revoked");
    const issuedAt = Date.parse(permit.issuedAt);
    const expiresAt = Date.parse(permit.expiresAt);
    if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || issuedAt > now.getTime() || expiresAt <= now.getTime() || issuedAt >= expiresAt) fail("permit_expired_or_not_yet_valid");
    limits(permit.runLimits);
    limits(permit.monthlyLimits);
    resources(permit.finalValidationReserve);
    within(permit.runLimits, permit.monthlyLimits, "run_exceeds_monthly");
    within(permit.finalValidationReserve, permit.runLimits, "final_reserve_exceeds_run");
    if (permit.finalValidationReserve.calls < 1 || permit.finalValidationReserve.amountMicros < 1 || permit.finalValidationReserve.tokens < 1 || permit.finalValidationReserve.elapsedMs < 1) fail("final_validation_budget_required");
    return permit;
  }

  private authorize(state: BudgetState, now: Date, input: OptimizationBudgetRunInput, statuses: OptimizationBudgetRun["status"][] = ["running"]): OptimizationBudgetRun {
    const run = this.find(state, input.runId);
    if (run.status === "tombstoned") fail("run_tombstoned");
    if (!statuses.includes(run.status)) fail(`run_${run.status}`);
    if (run.operations.some((op) => op.actual && dimensions.some((key) => op.actual![key] > op.upperBound[key]))) fail("provider_bound_violation");
    if (digest(run.bindings) !== digest(input.bindings)) fail("binding_mismatch");
    const permit = this.permit(input.permit, state, now);
    if (digest(run.permit) !== digest(permit)) fail("permit_mismatch");
    if (now.getTime() < Date.parse(run.observedAt)) fail("clock_regressed");
    if (run.period !== now.toISOString().slice(0, 7)) fail("budget_period_changed");
    if (now.getTime() - Date.parse(run.startedAt) >= permit.runLimits.elapsedMs) fail("run_elapsed_limit");
    run.observedAt = now.toISOString();
    return run;
  }

  private admit(state: BudgetState, run: OptimizationBudgetRun): void {
    const permit = run.permit ?? fail("unconfigured");
    within(plus(usage(run), finalHold(run)), permit.runLimits, "run_limit");
    if (run.operations.filter(active).length > permit.runLimits.concurrency) fail("run_limit_concurrency");
    const sameScope = state.runs.filter((item) => item.permit?.budgetScopeId === permit.budgetScopeId && item.permit.currency === permit.currency);
    const monthly = sameScope.filter((item) => item.period === run.period);
    const total = monthly.reduce((sum, item) => plus(sum, plus(usage(item), finalHold(item))), zero());
    within(total, permit.monthlyLimits, "monthly_limit");
    if (sameScope.reduce((sum, item) => sum + item.operations.filter(active).length, 0) > permit.monthlyLimits.concurrency) fail("monthly_limit_concurrency");
  }

  startRun(input: OptimizationBudgetRunInput): OptimizationBudgetRun {
    return this.transaction((state, now) => {
      identifier(input.runId);
      exactKeys(input.bindings, ["baselineDigest", "datasetDigest", "evaluatorVersion", "optimizerVersion"]);
      for (const value of Object.values(input.bindings)) identifier(value);
      if ([input.bindings.baselineDigest, input.bindings.datasetDigest, input.bindings.evaluatorVersion, input.bindings.optimizerVersion].some((value) => !value)) fail("missing_binding");
      if (state.runs.some((run) => run.runId === input.runId)) fail("run_already_exists");
      if (state.runs.length >= this.maxRuns) fail("ledger_capacity_exhausted");
      const permit = input.permit ? this.permit(input.permit, state, now) : null;
      const period = now.toISOString().slice(0, 7);
      if (permit) {
        const policy = state.monthlyPolicies.find((item) => item.scope === permit.budgetScopeId && item.currency === permit.currency && item.period === period);
        if (policy && digest(policy.limits) !== digest(permit.monthlyLimits)) fail("monthly_policy_mismatch");
        if (!policy) state.monthlyPolicies.push({ scope: permit.budgetScopeId, currency: permit.currency, period, limits: clone(permit.monthlyLimits) });
      }
      const run: OptimizationBudgetRun = { runId: input.runId, bindings: clone(input.bindings), permit: permit ? clone(permit) : null, status: permit ? "running" : "unconfigured", reason: permit ? "admitted" : "monetary_authorization_missing", startedAt: now.toISOString(), observedAt: now.toISOString(), period, operations: [] };
      state.runs.push(run);
      if (permit) this.admit(state, run);
      return run;
    });
  }

  reserve(input: OptimizationBudgetReservationInput): OptimizationBudgetReservation {
    return this.transaction((state, now) => {
      const run = this.authorize(state, now, input);
      identifier(input.operationId);
      resources(input.upperBound);
      if (input.upperBound.calls < 1 || input.upperBound.amountMicros < 1 || input.upperBound.elapsedMs < 1) fail("paid_call_upper_bound_required");
      if (input.upperBound.elapsedMs > 2_147_483_647) fail("request_timeout_too_large");
      if (!["generator", "subject", "judge", "nested", "retry", "final_validation"].includes(input.kind) || !["search", "final_validation"].includes(input.phase)) fail("invalid_operation");
      if (input.kind === "final_validation" && input.phase !== "final_validation") fail("invalid_final_validation_phase");
      if (input.kind === "retry") {
        const prior = run.operations.find((op) => op.operationId === input.retryOf);
        if (!prior || prior.state !== "cancelled") fail("retry_of_issued_or_unknown_call_forbidden");
      } else if (input.retryOf !== undefined) fail("retry_kind_required");
      if (run.operations.some((op) => op.operationId === input.operationId)) fail("operation_already_reserved");
      if (state.runs.reduce((count, item) => count + item.operations.length, 0) >= this.maxOperations) fail("ledger_capacity_exhausted");
      if (now.getTime() + input.upperBound.elapsedMs > Date.parse(run.startedAt) + run.permit!.runLimits.elapsedMs || now.getTime() + input.upperBound.elapsedMs > Date.parse(run.permit!.expiresAt)) fail("request_exceeds_deadline");
      const reservation: OptimizationBudgetReservation = { operationId: input.operationId, kind: input.kind, ...(input.retryOf ? { retryOf: input.retryOf } : {}), phase: input.phase, upperBound: clone(input.upperBound), state: "reserved", reservedAt: now.toISOString() };
      run.operations.push(reservation);
      this.admit(state, run);
      return reservation;
    });
  }

  /** Candidate admission is separate from paid calls, and stable across replay. */
  registerCandidate(input: OptimizationBudgetRunInput & { candidateId: string }): OptimizationBudgetReservation {
    return this.transaction((state, now) => {
      const run = this.authorize(state, now, input);
      identifier(input.candidateId);
      const operationId = `candidate:${input.candidateId}`;
      const prior = run.operations.find(item => item.operationId === operationId);
      if (prior) {
        if (prior.kind !== "generator" || prior.state !== "settled" || prior.actual?.candidateCount !== 1) fail("candidate_admission_conflict");
        return prior;
      }
      if (state.runs.reduce((count, item) => count + item.operations.length, 0) >= this.maxOperations) fail("ledger_capacity_exhausted");
      const amount = { ...zero(), candidateCount: 1 };
      const reservation: OptimizationBudgetReservation = { operationId, kind: "generator", phase: "search", upperBound: amount,
        actual: clone(amount), state: "settled", reservedAt: now.toISOString(), issuedAt: now.toISOString() };
      run.operations.push(reservation);
      this.admit(state, run);
      return reservation;
    });
  }

  /** Serialize an artifact write with tombstones; deletion wins over late output. */
  withRunArtifactWrite(runId: string, write: () => void): void {
    this.transaction(state => {
      if (this.find(state, runId).status === "tombstoned") fail("run_tombstoned");
      write();
    });
  }

  /** A live process owns one run executor. A dead PID can be recovered; a live/reused PID is never stolen. */
  acquireRunController(runId: string, owner: string, pid = process.pid): void {
    this.acquireControllerLease(runId, owner, pid, true);
  }

  acquireMaintenanceController(owner: string, pid = process.pid): void {
    this.acquireControllerLease("controller-maintenance", owner, pid, false);
  }

  private acquireControllerLease(runId: string, owner: string, pid: number, requireRun: boolean): void {
    identifier(owner);
    if (!Number.isSafeInteger(pid) || pid < 1) fail("controller_pid_invalid");
    this.transaction(state => {
      if (requireRun && this.find(state, runId).status === "tombstoned") fail("run_tombstoned");
      state.controllers ??= [];
      const prior = state.controllers.find(item => item.runId === runId);
      if (prior) {
        let alive = true;
        try { process.kill(prior.pid, 0); } catch (error) { alive = (error as NodeJS.ErrnoException).code !== "ESRCH"; }
        if (alive) fail("run_controller_active");
        state.controllers = state.controllers.filter(item => item.runId !== runId);
      }
      state.controllers.push({ runId, owner, pid });
    });
  }

  releaseRunController(runId: string, owner: string): void {
    this.transaction(state => { state.controllers = state.controllers?.filter(item => item.runId !== runId || item.owner !== owner) ?? []; });
  }

  issue(input: OptimizationBudgetRunInput & { operationId: string }): OptimizationBudgetReservation {
    return this.transaction((state, now) => {
      const run = this.authorize(state, now, input);
      const op = run.operations.find((item) => item.operationId === input.operationId) ?? fail("reservation_not_found");
      if (op.state !== "reserved") fail("operation_already_issued");
      if (now.getTime() + op.upperBound.elapsedMs > Math.min(Date.parse(run.startedAt) + run.permit!.runLimits.elapsedMs, Date.parse(run.permit!.expiresAt))) fail("request_exceeds_deadline");
      op.state = "issued";
      op.issuedAt = now.toISOString();
      return op;
    });
  }

  /** Unknown completion retains every reservation dimension and concurrency. */
  markUnknown(runId: string, operationId: string): void {
    this.transaction((state) => {
      const run = this.find(state, runId);
      const op = run.operations.find((item) => item.operationId === operationId) ?? fail("reservation_not_found");
      if (op.state !== "issued" && op.state !== "unknown") fail("operation_not_issued");
      op.state = "unknown";
      if (run.status === "running") { run.status = "checkpointed"; run.reason = "paid_call_outcome_unknown"; }
    });
  }

  settle(input: OptimizationBudgetRunInput & { operationId: string; actual?: OptimizationBudgetResources }): { accepted: boolean; reservation: OptimizationBudgetReservation } {
    return this.transaction((state, now) => {
      const run = this.find(state, input.runId);
      const op = run.operations.find((item) => item.operationId === input.operationId) ?? fail("reservation_not_found");
      if (run.status === "tombstoned") return { accepted: false, reservation: op };
      this.authorize(state, now, input, ["running", "checkpointed"]);
      if (op.state !== "issued" && op.state !== "unknown") fail("operation_not_issued");
      if (!input.actual) {
        op.state = "unknown";
        if (run.status === "running") { run.status = "checkpointed"; run.reason = "paid_usage_unknown"; }
        return { accepted: true, reservation: op };
      }
      const actual = clone(input.actual);
      resources(actual);
      actual.elapsedMs = Math.max(actual.elapsedMs, now.getTime() - Date.parse(op.issuedAt!));
      if (actual.calls !== op.upperBound.calls || actual.candidateCount !== op.upperBound.candidateCount) fail("issued_work_count_not_refundable");
      const exceeded = dimensions.some((key) => actual[key] > op.upperBound[key]);
      op.actual = actual;
      op.state = "settled";
      if (exceeded) { run.status = "checkpointed"; run.reason = "provider_exceeded_reserved_bound"; }
      return { accepted: !exceeded, reservation: op };
    });
  }

  /** Only a request proved never issued can release its reservation. */
  cancelUnissued(runId: string, operationId: string): void {
    this.transaction((state) => {
      const run = this.find(state, runId);
      if (run.status === "tombstoned") fail("run_tombstoned");
      const op = run.operations.find((item) => item.operationId === operationId) ?? fail("reservation_not_found");
      if (op.state !== "reserved") fail("cannot_cancel_issued_operation");
      op.state = "cancelled";
    });
  }

  checkpoint(runId: string, reason = "operator_checkpoint"): OptimizationBudgetRun {
    identifier(reason);
    return this.transaction((state) => {
      const run = this.find(state, runId);
      if (run.status !== "running" && run.status !== "checkpointed") fail(`run_${run.status}`);
      run.status = "checkpointed";
      run.reason = reason;
      return run;
    });
  }

  resume(input: OptimizationBudgetRunInput): OptimizationBudgetRun {
    return this.transaction((state, now) => {
      const run = this.authorize(state, now, input, ["checkpointed"]);
      if (run.reason === "provider_exceeded_reserved_bound") fail("provider_bound_violation");
      run.status = "running";
      run.reason = "resumed";
      this.admit(state, run);
      return run;
    });
  }

  complete(input: OptimizationBudgetRunInput): OptimizationBudgetRun {
    return this.transaction((state, now) => {
      const run = this.authorize(state, now, input);
      if (run.operations.some(active)) fail("outstanding_reservations");
      if (!run.operations.some((op) => op.phase === "final_validation" && op.state === "settled")) fail("final_validation_missing");
      run.status = "completed";
      run.reason = "completed";
      return run;
    });
  }

  tombstone(runId: string): OptimizationBudgetRun {
    return this.transaction((state) => {
      const run = this.find(state, runId);
      run.status = "tombstoned";
      run.reason = "deletion_tombstone";
      return run;
    });
  }

  revokePermit(permitId: string): void {
    identifier(permitId);
    this.transaction((state) => {
      if (!state.revokedPermitIds.includes(permitId)) state.revokedPermitIds.push(permitId);
      for (const run of state.runs) if (run.permit?.permitId === permitId && run.status === "running") {
        run.status = "checkpointed";
        run.reason = "permit_revoked";
      }
    });
  }

  snapshot(runId: string): OptimizationBudgetRun {
    return this.transaction((state) => this.find(state, runId));
  }

  listRuns(): OptimizationBudgetRun[] {
    return this.transaction((state) => state.runs);
  }

  summarize(runId: string): {
    runId: string; status: OptimizationBudgetRun["status"]; reason: string; currency: string | null;
    period: string; spent: OptimizationBudgetResources; reserved: OptimizationBudgetResources;
    unknown: OptimizationBudgetResources; finalValidationHeld: OptimizationBudgetResources;
    activeCalls: number; runLimits: OptimizationBudgetLimits | null;
  } {
    return this.transaction((state) => {
      const run = this.find(state, runId);
      const sum = (predicate: (op: OptimizationBudgetReservation) => boolean) => run.operations.filter(predicate).reduce((total, op) => plus(total, op.actual ?? op.upperBound), zero());
      return {
        runId: run.runId, status: run.status, reason: run.reason, currency: run.permit?.currency ?? null, period: run.period,
        spent: sum((op) => op.state === "settled"), reserved: sum(active),
        unknown: sum((op) => op.state === "unknown" || op.state === "issued"),
        finalValidationHeld: finalHold(run), activeCalls: run.operations.filter(active).length,
        runLimits: run.permit?.runLimits ?? null,
      };
    });
  }

  async executePaid<T>(input: OptimizationBudgetReservationInput & {
    invoke: (signal: AbortSignal) => Promise<{ value: T; actual?: OptimizationBudgetResources }>;
  }): Promise<{ value: T; reservation: OptimizationBudgetReservation }> {
    this.reserve(input);
    const issued = this.issue(input);
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        Promise.resolve().then(() => input.invoke(controller.signal)),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => {
          controller.abort();
          reject(new OptimizationBudgetError("paid_call_timeout_unknown"));
        }, issued.upperBound.elapsedMs); }),
      ]);
      const settled = this.settle({ ...input, ...(result.actual ? { actual: result.actual } : {}) });
      if (!settled.accepted) fail("late_or_over_budget_result_discarded");
      return { value: result.value, reservation: settled.reservation };
    } catch (error) {
      const op = this.snapshot(input.runId).operations.find((item) => item.operationId === input.operationId);
      if (op?.state === "issued" || op?.state === "unknown") this.markUnknown(input.runId, input.operationId);
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
