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
function path(): string {
  const directory = mkdtempSync(join(tmpdir(), "opik-budget-test-"));
  directories.push(directory);
  return join(directory, "budget.sqlite");
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
    const tooLarge = { ...cost, [dimension]: fixture.run.permit.runLimits[dimension] + 1 };
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
    const firstCost = { ...cost, [dimension]: authorization.monthlyLimits[dimension] - hold * 2 };
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

function worker(script: string): Promise<{ output: string; code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
      cwd: fileURLToPath(new URL("../../", import.meta.url)), stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let errors = "";
    child.stdout.on("data", (chunk) => { output += String(chunk); });
    child.stderr.on("data", (chunk) => { errors += String(chunk); });
    child.on("error", reject);
    child.on("close", (code, signal) => code && !output ? reject(new Error(errors)) : resolve({ output: output.trim(), code, signal }));
  });
}

describe("cross-process budget proof", () => {
  it("serializes candidate admissions and recovers a dead controller without stealing a live one", async () => {
    const authorization = permit(); authorization.runLimits.candidateCount = 2;
    const { ledger, ledgerPath, run } = setup(authorization);
    const moduleUrl = new URL("./budget.ts", import.meta.url).href;
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => worker(`
      import { FileOptimizationBudgetLedger } from ${JSON.stringify(moduleUrl)};
      const ledger = new FileOptimizationBudgetLedger({ path: ${JSON.stringify(ledgerPath)}, clock: () => new Date(${JSON.stringify(baseTime)}) });
      try { ledger.registerCandidate(${JSON.stringify({ ...run, candidateId: `trial-${i}` })}); console.log("admitted"); }
      catch (error) { console.log(error.code); }
      finally { ledger.close(); }
    `)));
    expect(results.filter(result => result.output === "admitted")).toHaveLength(2);
    expect(ledger.summarize(run.runId).spent.candidateCount).toBe(2);
    const death = await worker(`
      import { FileOptimizationBudgetLedger } from ${JSON.stringify(moduleUrl)};
      const ledger = new FileOptimizationBudgetLedger({ path: ${JSON.stringify(ledgerPath)}, clock: () => new Date(${JSON.stringify(baseTime)}) });
      ledger.acquireRunController(${JSON.stringify(run.runId)}, "worker-owner");
      process.kill(process.pid, "SIGKILL");
    `);
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
    const moduleUrl = new URL("./budget.ts", import.meta.url).href;
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => worker(`
      import { FileOptimizationBudgetLedger } from ${JSON.stringify(moduleUrl)};
      const ledger = new FileOptimizationBudgetLedger({ path: ${JSON.stringify(ledgerPath)}, clock: () => new Date(${JSON.stringify(baseTime)}) });
      try { ledger.reserve(${JSON.stringify(request(`worker-${i}`))}); console.log("reserved"); }
      catch (error) { console.log(error.code); }
      finally { ledger.close(); }
    `)));
    expect(results.filter((result) => result.output === "reserved")).toHaveLength(2);
    expect(results.filter((result) => result.output === "run_limit_amountMicros")).toHaveLength(6);
    expect(ledger.snapshot("run-1").operations).toHaveLength(2);
  }, 20_000);

  it("recovers SQLite locking after worker death while preserving its issued reservation", async () => {
    const { ledger, ledgerPath, run, request } = setup();
    const result = await worker(`
      import { FileOptimizationBudgetLedger } from ${JSON.stringify(new URL("./budget.ts", import.meta.url).href)};
      const ledger = new FileOptimizationBudgetLedger({ path: ${JSON.stringify(ledgerPath)}, clock: () => new Date(${JSON.stringify(baseTime)}) });
      ledger.reserve(${JSON.stringify(request())});
      ledger.issue(${JSON.stringify({ ...run, operationId: "op-1" })});
      process.kill(process.pid, "SIGKILL");
    `);
    expect(result.signal).toBe("SIGKILL");
    expect(ledger.snapshot(run.runId).operations[0]).toMatchObject({ state: "issued", upperBound: cost });
    ledger.checkpoint(run.runId, "worker_lost");
    ledger.resume(run);
    expect(() => ledger.reserve(request())).toThrow("operation_already_reserved");
    expect(() => ledger.cancelUnissued(run.runId, "op-1")).toThrow("cannot_cancel_issued_operation");
  }, 20_000);
});
