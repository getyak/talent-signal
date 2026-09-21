import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  FileOptimizationBudgetLedger,
  type OptimizationBudgetBindings,
  type OptimizationBudgetPermit,
  type OptimizationBudgetReservationInput,
  type OptimizationBudgetResources,
} from "./budget.js";

const baseTime = "2026-09-07T00:00:00.000Z";
const bindings: OptimizationBudgetBindings = { baselineDigest: "baseline-sha256", datasetDigest: "dataset-sha256", evaluatorVersion: "1", optimizerVersion: "1" };
const cost: OptimizationBudgetResources = { amountMicros: 100, calls: 1, tokens: 100, elapsedMs: 1_000, candidateCount: 1 };
function permit(): OptimizationBudgetPermit {
  return {
    permitId: "permit-1", budgetScopeId: "organization-1", status: "active", currency: "USD",
    issuedAt: "2026-09-01T00:00:00.000Z", expiresAt: "2026-10-01T00:00:00.000Z",
    runLimits: { amountMicros: 1_000, calls: 10, tokens: 1_000, elapsedMs: 100_000, candidateCount: 10, concurrency: 3 },
    monthlyLimits: { amountMicros: 3_000, calls: 30, tokens: 3_000, elapsedMs: 300_000, candidateCount: 30, concurrency: 9 },
    finalValidationReserve: { amountMicros: 100, calls: 1, tokens: 100, elapsedMs: 1_000, candidateCount: 0 },
  };
}

const directories: string[] = [];
const ledgers: FileOptimizationBudgetLedger[] = [];
function path(filename = "budget.sqlite"): string {
  const directory = mkdtempSync(join(tmpdir(), "opik-budget-test-"));
  directories.push(directory);
  return join(directory, filename);
}
function setup(authorization = permit(), options: { maxRuns?: number; maxOperations?: number; ledgerPath?: string } = {}) {
  let time = new Date(baseTime);
  const ledgerPath = options.ledgerPath ?? path();
  const ledger = new FileOptimizationBudgetLedger({ path: ledgerPath, clock: () => time, ...options });
  ledgers.push(ledger);
  const run = { runId: "run-1", bindings, permit: authorization };
  ledger.startRun(run);
  const request = (operationId = "op-1", upperBound = cost): OptimizationBudgetReservationInput => ({ ...run, operationId, kind: "subject", phase: "search", upperBound });
  return { ledger, ledgerPath, run, request, setTime: (value: string) => { time = new Date(value); } };
}
afterEach(() => {
  for (const ledger of ledgers.splice(0)) { try { ledger.close(); } catch { /* Already closed to exercise restart. */ } }
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("durable optimization budget", () => {
  it("is unconfigured without monetary authorization and never invokes a paid callback", async () => {
    const ledger = new FileOptimizationBudgetLedger({ path: path(), clock: () => new Date(baseTime) });
    ledgers.push(ledger);
    expect(ledger.startRun({ runId: "no-permit", bindings }).status).toBe("unconfigured");
    let calls = 0;
    await expect(ledger.executePaid({ runId: "no-permit", bindings, operationId: "call", kind: "generator", phase: "search", upperBound: cost, invoke: async () => { calls++; return { value: null }; } })).rejects.toThrow("run_unconfigured");
    expect(calls).toBe(0);
  });

  it.each(["amountMicros", "calls", "tokens", "elapsedMs", "candidateCount"] as const)("atomically denies the per-run %s limit", (dimension) => {
    const fixture = setup();
    const limit = fixture.run.permit.runLimits[dimension];
    if (typeof limit !== "number") throw new Error("finite fixture limit required");
    const tooLarge = { ...cost, [dimension]: limit + 1 };
    expect(() => fixture.ledger.reserve(fixture.request("too-large", tooLarge))).toThrow();
    expect(fixture.ledger.snapshot(fixture.run.runId).operations).toEqual([]);
  });

  it.each(["amountMicros", "calls", "tokens", "elapsedMs", "candidateCount"] as const)("shares monthly %s consumption across runs", (dimension) => {
    const authorization = permit();
    // Removing the hold for this dimension only is valid for candidateCount;
    // for the others keep the required validation minimum and reserve the rest.
    authorization.runLimits = { amountMicros: 1_000, calls: 10, tokens: 1_000, elapsedMs: 100_000, candidateCount: 10, concurrency: 9 };
    authorization.monthlyLimits = { ...authorization.runLimits, concurrency: 9 };
    const fixture = setup(authorization);
    const secondRun = { ...fixture.run, runId: "run-2" };
    fixture.ledger.startRun(secondRun);
    const hold = authorization.finalValidationReserve[dimension];
    const monthlyLimit = authorization.monthlyLimits[dimension];
    if (typeof monthlyLimit !== "number") throw new Error("finite fixture limit required");
    const firstCost = { ...cost, [dimension]: monthlyLimit - hold * 2 };
    if (dimension === "elapsedMs") firstCost.elapsedMs -= 1;
    fixture.ledger.reserve(fixture.request("first", firstCost));
    fixture.ledger.issue({ ...fixture.run, operationId: "first" });
    fixture.ledger.settle({ ...fixture.run, operationId: "first", actual: firstCost });
    expect(() => fixture.ledger.reserve({ ...fixture.request("second", cost), ...secondRun })).toThrow(`monthly_limit_${dimension}`);
    expect(fixture.ledger.snapshot(secondRun.runId).operations).toHaveLength(0);
  });

  it("protects final validation at both run and month admission", () => {
    const authorization = permit();
    authorization.runLimits.amountMicros = 200;
    authorization.monthlyLimits.amountMicros = 300;
    const { ledger, run, request } = setup(authorization);
    ledger.startRun({ ...run, runId: "run-2" });
    ledger.reserve(request());
    ledger.issue({ ...run, operationId: "op-1" });
    ledger.settle({ ...run, operationId: "op-1", actual: cost });
    expect(() => ledger.reserve(request("search-too-far"))).toThrow("run_limit_amountMicros");
    const final = { ...request("final", { ...cost, candidateCount: 0 }), kind: "final_validation" as const, phase: "final_validation" as const };
    ledger.reserve(final);
    ledger.issue(final);
    expect(ledger.settle({ ...final, actual: final.upperBound }).accepted).toBe(true);
    expect(ledger.complete(run).status).toBe("completed");
  });

  it("will not start a run by consuming another run's validation hold", () => {
    const authorization = permit();
    authorization.runLimits.amountMicros = 200;
    authorization.monthlyLimits.amountMicros = 200;
    const { ledger, run } = setup(authorization);
    ledger.startRun({ ...run, runId: "run-2" });
    expect(() => ledger.startRun({ ...run, runId: "run-3" })).toThrow("monthly_limit_amountMicros");
  });

  it("refuses monthly policy edits instead of resetting the allowance", () => {
    const { ledger, run } = setup();
    const changed = structuredClone(run.permit);
    if (typeof changed.monthlyLimits.amountMicros !== "number") throw new Error("finite fixture limit required");
    changed.monthlyLimits.amountMicros *= 2;
    expect(() => ledger.startRun({ ...run, runId: "run-2", permit: changed })).toThrow("monthly_policy_mismatch");
  });

  it("reserves every request role and treats nested calls as separate paid work", async () => {
    const { ledger, request } = setup();
    for (const kind of ["generator", "subject", "judge", "nested"] as const) {
      await ledger.executePaid({ ...request(kind), kind, invoke: async () => {
        expect(ledger.snapshot("run-1").operations.find((op) => op.operationId === kind)?.state).toBe("issued");
        return { value: kind, actual: cost };
      } });
    }
    expect(ledger.snapshot("run-1").operations).toHaveLength(4);
  });

  it("shares concurrency across instances and across runs", () => {
    const authorization = permit();
    authorization.runLimits.concurrency = 2;
    authorization.monthlyLimits.concurrency = 2;
    const { ledger, ledgerPath, run, request } = setup(authorization);
    const other = new FileOptimizationBudgetLedger({ path: ledgerPath, clock: () => new Date(baseTime) });
    ledgers.push(other);
    other.startRun({ ...run, runId: "run-2" });
    ledger.reserve(request("one"));
    other.reserve({ ...request("two"), runId: "run-2" });
    expect(() => ledger.reserve(request("three"))).toThrow("monthly_limit_concurrency");
    other.cancelUnissued("run-2", "two");
    ledger.reserve(request("three"));
    expect(() => ledger.reserve(request("four"))).toThrow("run_limit_concurrency");
  });

  it("does not automatically retry provider errors and retains unknown usage without raw error data", async () => {
    const { ledger, ledgerPath, request, run } = setup();
    let attempts = 0;
    await expect(ledger.executePaid({ ...request(), invoke: async () => { attempts++; throw new Error("secret-private-content"); } })).rejects.toThrow("secret-private-content");
    expect(attempts).toBe(1);
    expect(ledger.snapshot(run.runId)).toMatchObject({ status: "checkpointed", operations: [{ state: "unknown", upperBound: cost }] });
    ledger.resume(run);
    await expect(ledger.executePaid({ ...request(), invoke: async () => { attempts++; return { value: true }; } })).rejects.toThrow("operation_already_reserved");
    expect(attempts).toBe(1);
    expect(readFileSync(ledgerPath).includes(Buffer.from("secret-private-content"))).toBe(false);
  });
  it("keeps a response with missing actual usage unknown instead of converting its upper bound to measured spend", async () => {
    const { ledger, run, request } = setup();
    const result = await ledger.executePaid({ ...request(), invoke: async () => ({ value: "response-without-usage" }) });
    expect(result.value).toBe("response-without-usage");
    expect(result.reservation.state).toBe("unknown");
    expect(ledger.summarize(run.runId)).toMatchObject({ status: "checkpointed", spent: { calls: 0 }, unknown: { calls: 1 }, activeCalls: 1 });
  });

  it("times out without freeing spend or accepting a late result", async () => {
    const { ledger, request, run } = setup();
    let finish!: (result: { value: string }) => void;
    let signal!: AbortSignal;
    await expect(ledger.executePaid({ ...request("timeout", { ...cost, elapsedMs: 10 }), invoke: (incoming) => {
      signal = incoming;
      return new Promise<{ value: string }>((resolve) => { finish = resolve; });
    } })).rejects.toThrow("paid_call_timeout_unknown");
    expect(signal.aborted).toBe(true);
    finish({ value: "late" });
    await Promise.resolve();
    expect(ledger.snapshot(run.runId).operations[0]?.state).toBe("unknown");
    expect(() => ledger.cancelUnissued(run.runId, "timeout")).toThrow("cannot_cancel_issued_operation");
  });

  it("unknown provider work keeps its concurrency slot after checkpoint and resume", () => {
    const authorization = permit();
    authorization.runLimits.concurrency = 1;
    const { ledger, request, run } = setup(authorization);
    ledger.reserve(request());
    ledger.issue({ ...run, operationId: "op-1" });
    ledger.markUnknown(run.runId, "op-1");
    ledger.resume(run);
    expect(() => ledger.reserve(request("next"))).toThrow("run_limit_concurrency");
  });

  it("preserves consumption across close, checkpoint and same-run resume", () => {
    const { ledger, ledgerPath, request, run } = setup();
    ledger.reserve(request());
    ledger.issue({ ...run, operationId: "op-1" });
    ledger.settle({ ...run, operationId: "op-1", actual: { ...cost, amountMicros: 42, tokens: 50 } });
    ledger.checkpoint(run.runId);
    ledger.close();
    const reopened = new FileOptimizationBudgetLedger({ path: ledgerPath, clock: () => new Date(baseTime) });
    ledgers.push(reopened);
    expect(reopened.resume(run).operations[0]?.actual).toEqual({ ...cost, amountMicros: 42, tokens: 50 });
    expect(statSync(ledgerPath).mode & 0o777).toBe(0o600);
  });

  it.each(["baselineDigest", "datasetDigest", "evaluatorVersion", "optimizerVersion"] as const)("blocks resume when %s changes", (key) => {
    const { ledger, run } = setup();
    ledger.checkpoint(run.runId);
    expect(() => ledger.resume({ ...run, bindings: { ...bindings, [key]: "changed" } })).toThrow("binding_mismatch");
  });

  it("blocks expired, revoked, edited and future permits", () => {
    const { ledger, run, setTime, request } = setup();
    ledger.checkpoint(run.runId);
    expect(() => ledger.resume({ ...run, permit: { ...run.permit, issuedAt: "2027-01-01" } })).toThrow("permit_expired_or_not_yet_valid");
    expect(() => ledger.resume({ ...run, permit: { ...run.permit, currency: "EUR" } })).toThrow("permit_mismatch");
    ledger.revokePermit(run.permit.permitId);
    expect(() => ledger.resume(run)).toThrow("permit_revoked");
    setTime("2026-10-02T00:00:00.000Z");
    expect(() => ledger.reserve(request())).toThrow();
    const other = setup();
    other.ledger.checkpoint(other.run.runId);
    other.setTime("2026-10-02T00:00:00.000Z");
    expect(() => other.ledger.resume(other.run)).toThrow("permit_expired_or_not_yet_valid");
  });

  it("does not reset wall-clock time on resume or tolerate a regressing clock", () => {
    const { ledger, run, setTime } = setup();
    ledger.checkpoint(run.runId);
    setTime("2026-09-07T00:01:40.000Z");
    expect(() => ledger.resume(run)).toThrow("run_elapsed_limit");
    setTime("2026-09-06T23:59:59.999Z");
    expect(() => ledger.resume(run)).toThrow("clock_regressed");
  });

  it("tombstone wins late results, reopening, and resume", async () => {
    const { ledger, ledgerPath, run, request } = setup();
    let finish!: (value: { value: string }) => void;
    const pending = ledger.executePaid({ ...request(), invoke: () => new Promise<{ value: string }>((resolve) => { finish = resolve; }) });
    await Promise.resolve();
    ledger.tombstone(run.runId);
    finish({ value: "must-not-publish" });
    await expect(pending).rejects.toThrow("late_or_over_budget_result_discarded");
    expect(ledger.snapshot(run.runId)).toMatchObject({ status: "tombstoned", operations: [{ state: "unknown" }] });
    const reopened = new FileOptimizationBudgetLedger({ path: ledgerPath, clock: () => new Date(baseTime) });
    ledgers.push(reopened);
    expect(() => reopened.resume(run)).toThrow("run_tombstoned");
    expect(() => reopened.startRun(run)).toThrow("run_already_exists");
  });

  it("prevents issuing twice, refunding issued call counts, and silently passing overruns", () => {
    const { ledger, run, request } = setup();
    ledger.reserve(request());
    ledger.issue({ ...run, operationId: "op-1" });
    expect(() => ledger.issue({ ...run, operationId: "op-1" })).toThrow("operation_already_issued");
    expect(() => ledger.settle({ ...run, operationId: "op-1", actual: { ...cost, calls: 0 } })).toThrow("issued_work_count_not_refundable");
    expect(ledger.settle({ ...run, operationId: "op-1", actual: { ...cost, amountMicros: 2_000 } }).accepted).toBe(false);
    expect(ledger.snapshot(run.runId).operations[0]?.actual?.amountMicros).toBe(2_000);
    expect(() => ledger.resume(run)).toThrow("provider_bound_violation");
    ledger.checkpoint(run.runId, "changed_reason");
    expect(() => ledger.resume(run)).toThrow("provider_bound_violation");
  });

  it("only retries a reservation proved never issued, with a fresh reservation", () => {
    const { ledger, run, request } = setup();
    ledger.reserve(request("unissued"));
    ledger.cancelUnissued(run.runId, "unissued");
    const retry = { ...request("retry"), kind: "retry" as const, retryOf: "unissued" };
    ledger.reserve(retry);
    ledger.issue(retry);
    ledger.markUnknown(run.runId, "retry");
    ledger.resume(run);
    expect(() => ledger.reserve({ ...request("unsafe-retry"), kind: "retry", retryOf: "retry" })).toThrow("retry_of_issued_or_unknown_call_forbidden");
    expect(() => ledger.reserve({ ...request("unbound-retry"), kind: "retry" })).toThrow("retry_of_issued_or_unknown_call_forbidden");
  });

  it("accounts observed elapsed time even when a caller supplies a smaller duration", () => {
    const { ledger, run, request, setTime } = setup();
    ledger.reserve(request());
    ledger.issue({ ...run, operationId: "op-1" });
    setTime("2026-09-07T00:00:00.250Z");
    const result = ledger.settle({ ...run, operationId: "op-1", actual: { ...cost, elapsedMs: 0 } });
    expect(result.reservation.actual?.elapsedMs).toBe(250);
  });

  it("bounds ledger growth and refuses memory-only storage", () => {
    expect(() => new FileOptimizationBudgetLedger({ path: ":memory:" })).toThrow("durable_path_required");
    const { ledger, run, request } = setup(permit(), { maxRuns: 1, maxOperations: 1 });
    expect(() => ledger.startRun({ ...run, runId: "second-run" })).toThrow("ledger_capacity_exhausted");
    ledger.reserve(request());
    ledger.cancelUnissued(run.runId, "op-1");
    expect(() => ledger.reserve(request("next"))).toThrow("ledger_capacity_exhausted");
  });

  it.each([NaN, Infinity, -1, 0.1, Number.MAX_SAFE_INTEGER + 1])("rejects unsafe numeric costs: %s", (amountMicros) => {
    const { ledger, request } = setup();
    expect(() => ledger.reserve(request("bad", { ...cost, amountMicros }))).toThrow("invalid_resources");
  });

  it("requires validation and a fully reconciled run before completion", () => {
    const { ledger, run, request } = setup();
    expect(() => ledger.complete(run)).toThrow("final_validation_missing");
    ledger.reserve(request());
    expect(() => ledger.complete(run)).toThrow("outstanding_reservations");
  });
});

/** The 2026-09-21 owner authorization: CNY money with no ceiling at all. */
function unlimitedPermit(): OptimizationBudgetPermit {
  const authorization = permit();
  authorization.currency = "CNY";
  authorization.runLimits.amountMicros = "unlimited";
  authorization.monthlyLimits.amountMicros = "unlimited";
  return authorization;
}

describe("explicit unlimited monetary authorization", () => {
  it("persists explicit CNY unlimited run and monthly limits across reopen with intact accounting", () => {
    const authorization = unlimitedPermit();
    const { ledger, ledgerPath, run, request } = setup(authorization);
    const large = { ...cost, amountMicros: 9_000_000_000 };
    ledger.reserve(request("first", large));
    ledger.issue({ ...run, operationId: "first" });
    ledger.settle({ ...run, operationId: "first", actual: large });
    ledger.checkpoint(run.runId);
    ledger.close();
    const reopened = new FileOptimizationBudgetLedger({ path: ledgerPath, clock: () => new Date(baseTime) });
    ledgers.push(reopened);
    const restored = reopened.snapshot(run.runId).permit!;
    expect(restored).toEqual(authorization);
    expect(restored.currency).toBe("CNY");
    expect(restored.runLimits.amountMicros).toBe("unlimited");
    expect(restored.monthlyLimits.amountMicros).toBe("unlimited");
    expect(reopened.summarize(run.runId).spent.amountMicros).toBe(9_000_000_000);
    expect(reopened.resume(run).status).toBe("running");
  });

  it("keeps finite CNY money ceilings exact and rejects any amount above them", () => {
    const authorization = permit();
    authorization.currency = "CNY";
    authorization.runLimits.amountMicros = 250;
    authorization.monthlyLimits.amountMicros = 400;
    const { ledger, run, request } = setup(authorization);
    expect(ledger.snapshot(run.runId).permit).toEqual(authorization);
    ledger.reserve(request("at-cap", { ...cost, amountMicros: 150 }));
    expect(() => ledger.reserve(request("over", { ...cost, amountMicros: 1 }))).toThrow("run_limit_amountMicros");
    expect(ledger.snapshot(run.runId).operations.map((op) => op.operationId)).toEqual(["at-cap"]);
    expect(ledger.snapshot(run.runId).permit?.runLimits.amountMicros).toBe(250);
  });

  it("allows an unlimited monthly ceiling with a finite run ceiling but rejects the reverse", () => {
    const finiteRun = permit();
    finiteRun.currency = "CNY";
    finiteRun.runLimits.amountMicros = 500;
    finiteRun.monthlyLimits.amountMicros = "unlimited";
    const valid = setup(finiteRun);
    expect(valid.run.permit.monthlyLimits.amountMicros).toBe("unlimited");
    valid.ledger.reserve(valid.request("ok", { ...cost, amountMicros: 300 }));

    const unlimitedRun = permit();
    unlimitedRun.currency = "CNY";
    unlimitedRun.runLimits.amountMicros = "unlimited";
    unlimitedRun.monthlyLimits.amountMicros = 1_000;
    expect(() => setup(unlimitedRun)).toThrow("run_exceeds_monthly_amountMicros");
  });

  it("refuses a changed monthly money policy even when either side is unlimited", () => {
    const finite = permit();
    finite.currency = "CNY";
    const first = setup(finite);
    const raised = structuredClone(finite);
    raised.runLimits.amountMicros = 1_000;
    raised.monthlyLimits.amountMicros = "unlimited";
    expect(() => first.ledger.startRun({ ...first.run, runId: "run-2", permit: raised })).toThrow("monthly_policy_mismatch");

    const unlimited = unlimitedPermit();
    const second = setup(unlimited);
    const reduced = structuredClone(unlimited);
    reduced.runLimits.amountMicros = 1_000;
    reduced.monthlyLimits.amountMicros = 5_000;
    expect(() => second.ledger.startRun({ ...second.run, runId: "run-2", permit: reduced })).toThrow("monthly_policy_mismatch");
  });

  it.each(["calls", "tokens", "elapsedMs", "candidateCount"] as const)("still enforces the %s ceiling under unlimited money", (dimension) => {
    const authorization = unlimitedPermit();
    const { ledger, run, request } = setup(authorization);
    // Keep the request deadline valid so each assertion reaches admission.
    const amount = { ...cost, amountMicros: 1_000_000,
      [dimension]: authorization.runLimits[dimension] - authorization.finalValidationReserve[dimension] + 1 };
    expect(() => ledger.reserve(request("over", amount))).toThrow(`run_limit_${dimension}`);
    expect(ledger.snapshot(run.runId).operations).toEqual([]);
  });

  it("still enforces concurrency and elapsed run time under unlimited money", () => {
    const authorization = unlimitedPermit();
    authorization.runLimits = { ...authorization.runLimits, elapsedMs: 10_000, concurrency: 1 };
    authorization.monthlyLimits = { ...authorization.monthlyLimits, concurrency: 1 };
    const { ledger, run, request, setTime } = setup(authorization);
    ledger.reserve(request("first", { ...cost, amountMicros: 1_000_000, calls: 1, tokens: 100, elapsedMs: 1_000, candidateCount: 1 }));
    expect(() => ledger.reserve(request("more", { ...cost, amountMicros: 1, calls: 1, tokens: 1, elapsedMs: 1, candidateCount: 1 }))).toThrow("run_limit_concurrency");
    setTime("2026-09-07T00:00:11.000Z");
    expect(() => ledger.reserve(request("late"))).toThrow("run_elapsed_limit");
    expect(ledger.snapshot(run.runId).operations.map((op) => op.operationId)).toEqual(["first"]);
  });

  it("still requires and holds the finite final-validation reserve under unlimited money", () => {
    const { ledger, run, request } = setup(unlimitedPermit());
    expect(() => ledger.complete(run)).toThrow("final_validation_missing");
    expect(ledger.summarize(run.runId).finalValidationHeld.amountMicros).toBe(100);
    const final = { ...request("final", { ...cost, candidateCount: 0 }), kind: "final_validation" as const, phase: "final_validation" as const };
    ledger.reserve(final);
    ledger.issue(final);
    expect(ledger.settle({ ...final, actual: final.upperBound }).accepted).toBe(true);
    expect(ledger.complete(run).status).toBe("completed");
    expect(ledger.summarize(run.runId).finalValidationHeld.amountMicros).toBe(0);
  });

  it("retains unknown reservations and forbids unsafe retries under unlimited money", async () => {
    const { ledger, run, request } = setup(unlimitedPermit());
    let attempts = 0;
    await expect(ledger.executePaid({ ...request("lost", { ...cost, amountMicros: 5_000_000 }), invoke: async () => {
      attempts++; throw new Error("network-lost");
    } })).rejects.toThrow("network-lost");
    expect(attempts).toBe(1);
    expect(ledger.snapshot(run.runId)).toMatchObject({ status: "checkpointed", operations: [{ state: "unknown" }] });
    expect(ledger.summarize(run.runId)).toMatchObject({ unknown: { amountMicros: 5_000_000 }, activeCalls: 1 });
    ledger.resume(run);
    expect(() => ledger.reserve({ ...request("retry"), kind: "retry", retryOf: "lost" })).toThrow("retry_of_issued_or_unknown_call_forbidden");
  });

  it("still rejects an overrun beyond the finite per-operation upper bound under unlimited money", () => {
    const { ledger, run, request } = setup(unlimitedPermit());
    ledger.reserve(request("bounded"));
    ledger.issue({ ...run, operationId: "bounded" });
    expect(ledger.settle({ ...run, operationId: "bounded", actual: { ...cost, amountMicros: cost.amountMicros + 1 } }).accepted).toBe(false);
    expect(ledger.snapshot(run.runId)).toMatchObject({ status: "checkpointed", reason: "provider_exceeded_reserved_bound" });
    expect(() => ledger.resume(run)).toThrow("provider_bound_violation");
  });

  it("keeps integer-micro overflow detection under unlimited money", () => {
    const { ledger, run, request } = setup(unlimitedPermit());
    const huge = { ...cost, amountMicros: Number.MAX_SAFE_INTEGER - 100 };
    ledger.reserve(request("first", huge));
    ledger.issue({ ...run, operationId: "first" });
    ledger.settle({ ...run, operationId: "first", actual: huge });
    expect(() => ledger.reserve(request("second", huge))).toThrow("resource_overflow");
    expect(ledger.snapshot(run.runId).operations).toHaveLength(1);
    expect(ledger.snapshot(run.runId).operations[0]?.actual?.amountMicros).toBe(Number.MAX_SAFE_INTEGER - 100);
  });

  it("never infers unlimited from missing, null, zero, NaN, Infinity or malformed money", () => {
    const cases: Array<[string, unknown, string]> = [
      ["absent", undefined, "unconfigured"],
      ["null", null, "unconfigured"],
      ["zero", 0, "final_reserve_exceeds_run_amountMicros"],
      ["NaN", NaN, "invalid_resources"],
      ["Infinity", Infinity, "invalid_resources"],
      ["negative", -1, "invalid_resources"],
      ["fraction", 0.5, "invalid_resources"],
      ["wrong casing", "Unlimited", "invalid_resources"],
      ["empty string", "", "invalid_resources"],
      ["boolean", true, "invalid_resources"],
      ["numeric string", "1000", "invalid_resources"],
    ];
    for (const [label, value, code] of cases) {
      const authorization = unlimitedPermit();
      if (value === undefined) delete (authorization.runLimits as { amountMicros?: unknown }).amountMicros;
      else (authorization.runLimits as { amountMicros: unknown }).amountMicros = value;
      expect(() => setup(authorization), label).toThrow(code);
    }
    const monthlyBad = unlimitedPermit();
    (monthlyBad.monthlyLimits as { amountMicros: unknown }).amountMicros = "NaN";
    expect(() => setup(monthlyBad)).toThrow("invalid_resources");
  });

  it("rejects extra limit fields and any non-finite reservation upper bound under unlimited money", () => {
    const withExtra = unlimitedPermit();
    (withExtra.runLimits as unknown as Record<string, unknown>).projectedSpend = 1;
    expect(() => setup(withExtra)).toThrow("invalid_fields");

    const { ledger, request } = setup(unlimitedPermit());
    expect(() => ledger.reserve(request("bad", { ...cost, amountMicros: "unlimited" } as unknown as OptimizationBudgetResources))).toThrow("invalid_resources");
  });
});

type BudgetWorkerInput = { ledgerPath: string } & (
  | { action: "register_candidate"; request: Parameters<FileOptimizationBudgetLedger["registerCandidate"]>[0] }
  | { action: "reserve"; request: OptimizationBudgetReservationInput }
  | { action: "acquire_controller_and_crash"; runId: string; ownerId: string }
  | { action: "issue_and_crash"; request: OptimizationBudgetReservationInput }
);

function worker(input: BudgetWorkerInput): Promise<{ output: string; code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("./budgetWorker.testFixture.mjs", import.meta.url))], {
      cwd: fileURLToPath(new URL("../../", import.meta.url)), stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    let errors = "";
    child.stdout.on("data", (chunk) => { output += String(chunk); });
    child.stderr.on("data", (chunk) => { errors += String(chunk); });
    child.on("error", reject);
    child.on("close", (code, signal) => code !== null && code !== 0 ? reject(new Error(errors)) : resolve({ output: output.trim(), code, signal }));
    child.stdin.on("error", reject);
    child.stdin.end(JSON.stringify({ ...input, now: baseTime }));
  });
}

describe("cross-process budget proof", () => {
  it("serializes candidate admissions and recovers a dead controller without stealing a live one", async () => {
    const authorization = permit(); authorization.runLimits.candidateCount = 2;
    // Quotes, a template marker, and a newline must remain ordinary path data.
    const { ledger, ledgerPath, run } = setup(authorization, { ledgerPath: path("budget-'\"`-${literal}\n.sqlite") });
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => worker({
      ledgerPath, action: "register_candidate", request: { ...run, candidateId: `trial-${i}` },
    })));
    expect(results.filter(result => result.output === "admitted")).toHaveLength(2);
    expect(ledger.summarize(run.runId).spent.candidateCount).toBe(2);
    const death = await worker({ ledgerPath, action: "acquire_controller_and_crash", runId: run.runId, ownerId: "worker-owner" });
    expect(death.signal).toBe("SIGKILL");
    ledger.acquireRunController(run.runId, "recovered-owner");
    expect(() => ledger.acquireRunController(run.runId, "contending-owner")).toThrow("run_controller_active");
    ledger.releaseRunController(run.runId, "wrong-owner");
    expect(() => ledger.acquireRunController(run.runId, "contending-owner")).toThrow("run_controller_active");
    ledger.releaseRunController(run.runId, "recovered-owner");
    ledger.acquireRunController(run.runId, "next-owner");
  }, 20_000);

  it("serializes simultaneous paid admissions without double spending", async () => {
    const authorization = permit();
    authorization.runLimits.amountMicros = 300;
    const { ledger, ledgerPath, request } = setup(authorization);
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => worker({
      ledgerPath, action: "reserve", request: request(`worker-${i}`),
    })));
    expect(results.filter((result) => result.output === "reserved")).toHaveLength(2);
    expect(results.filter((result) => result.output === "run_limit_amountMicros")).toHaveLength(6);
    expect(ledger.snapshot("run-1").operations).toHaveLength(2);
  }, 20_000);

  it("recovers SQLite locking after worker death while preserving its issued reservation", async () => {
    const { ledger, ledgerPath, run, request } = setup();
    const result = await worker({ ledgerPath, action: "issue_and_crash", request: request() });
    expect(result.signal).toBe("SIGKILL");
    expect(ledger.snapshot(run.runId).operations[0]).toMatchObject({ state: "issued", upperBound: cost });
    ledger.checkpoint(run.runId, "worker_lost");
    ledger.resume(run);
    expect(() => ledger.reserve(request())).toThrow("operation_already_reserved");
    expect(() => ledger.cancelUnissued(run.runId, "op-1")).toThrow("cannot_cancel_issued_operation");
  }, 20_000);
});
