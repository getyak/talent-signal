import { spawn } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { digestCanonicalJson } from "@talent-signal/evaluation";
import { OPTIMIZER_VERSION, validateOptimizationCandidate, type OptimizationCandidate, type OptimizationDevExample } from "./productTask.js";

export interface OptimizerTrialResult {
  score: number;
  hardGate: boolean;
  receiptDigests: `sha256:${string}`[];
}
export interface OptimizerTrial {
  trialId: string;
  ordinal: number;
  candidate: OptimizationCandidate;
  candidateDigest: `sha256:${string}`;
  diff: Array<{ field: "taskFragmentId" | "exampleIds"; before: unknown; after: unknown }>;
  result: OptimizerTrialResult;
}
export interface OptimizerSearchReport {
  schemaVersion: "optimizer-search-report.v1";
  optimizerVersion: typeof OPTIMIZER_VERSION;
  bindingsDigest: `sha256:${string}`;
  baseline: OptimizationCandidate;
  best: OptimizationCandidate;
  improved: boolean;
  stopReason: "running" | "search_exhausted" | "trial_limit" | "cancelled" | "timeout" | "evaluation_failed" | "worker_failed";
  trials: OptimizerTrial[];
  reportDigest: `sha256:${string}`;
}
export interface OptimizerSearchOptions {
  baseline: OptimizationCandidate;
  examples: readonly OptimizationDevExample[];
  bindings: { baselineDigest: string; datasetDigest: string; evaluatorVersion: string; optimizerVersion: string };
  maximumTrials: number;
  timeoutMs?: number;
  pythonExecutable?: string;
  outputPath?: string;
  onCheckpoint?: (report: OptimizerSearchReport) => void | Promise<void>;
  resume?: OptimizerSearchReport;
  signal?: AbortSignal;
  evaluate: (candidate: OptimizationCandidate, trialId: string, signal: AbortSignal) => Promise<OptimizerTrialResult>;
}
function verifyResult(value: OptimizerTrialResult): OptimizerTrialResult {
  if (!value || Object.keys(value).sort().join(",") !== "hardGate,receiptDigests,score" || typeof value.hardGate !== "boolean"
    || !Number.isFinite(value.score) || value.score < 0 || value.score > 1 || !Array.isArray(value.receiptDigests)
    || value.receiptDigests.length > 10000 || value.receiptDigests.some(value => !/^sha256:[a-f0-9]{64}$/.test(value))) throw new Error("OPTIMIZER_EVALUATION_INVALID");
  return structuredClone(value);
}
function reportWithDigest(value: Omit<OptimizerSearchReport, "reportDigest">): OptimizerSearchReport {
  return { ...value, reportDigest: digestCanonicalJson(value) };
}
export function readOptimizerSearchReport(path: string): OptimizerSearchReport {
  const text = readFileSync(path, "utf8");
  if (text.length > 5_000_000) throw new Error("OPTIMIZER_REPORT_TOO_LARGE");
  const report = JSON.parse(text) as OptimizerSearchReport;
  const { reportDigest, ...payload } = report;
  if (report.schemaVersion !== "optimizer-search-report.v1" || report.optimizerVersion !== OPTIMIZER_VERSION
    || digestCanonicalJson(payload) !== reportDigest) throw new Error("OPTIMIZER_REPORT_DIGEST_MISMATCH");
  return report;
}
/** Recorded replay is local validation only. It never starts Python or calls an evaluator/model. */
export function replayOptimizerSearch(report: OptimizerSearchReport, examples: readonly OptimizationDevExample[] = []): OptimizerSearchReport {
  const { reportDigest, ...payload } = report;
  if (report.schemaVersion !== "optimizer-search-report.v1" || report.optimizerVersion !== OPTIMIZER_VERSION
    || digestCanonicalJson(payload) !== reportDigest || !Array.isArray(report.trials) || report.trials.length > 32) throw new Error("OPTIMIZER_REPORT_DIGEST_MISMATCH");
  validateOptimizationCandidate(report.baseline, examples);
  let best = report.baseline;
  let bestScore = -1;
  for (const [index, trial] of report.trials.entries()) {
    validateOptimizationCandidate(trial.candidate, examples);
    verifyResult(trial.result);
    if (trial.ordinal !== index || trial.candidateDigest !== digestCanonicalJson(trial.candidate)
      || trial.trialId !== `trial-${digestCanonicalJson({ bindingsDigest: report.bindingsDigest, ordinal: index, candidate: trial.candidate }).slice(7, 39)}`
      || (index === 0 && trial.candidateDigest !== digestCanonicalJson(report.baseline))) throw new Error("OPTIMIZER_TRIAL_MISMATCH");
    const expectedDiff = (["taskFragmentId", "exampleIds"] as const).filter(field => digestCanonicalJson(report.baseline[field]) !== digestCanonicalJson(trial.candidate[field]))
      .map(field => ({ field, before: report.baseline[field], after: trial.candidate[field] }));
    if (digestCanonicalJson(expectedDiff) !== digestCanonicalJson(trial.diff)) throw new Error("OPTIMIZER_TRIAL_DIFF_MISMATCH");
    const score = trial.result.hardGate ? trial.result.score : -1;
    if (index === 0 || score > bestScore) { bestScore = score; best = trial.candidate; }
  }
  if (digestCanonicalJson(best) !== digestCanonicalJson(report.best)
    || report.improved !== (digestCanonicalJson(best) !== digestCanonicalJson(report.baseline))) throw new Error("OPTIMIZER_SELECTION_MISMATCH");
  return structuredClone(report);
}
export async function runOptimizerSearch(options: OptimizerSearchOptions): Promise<OptimizerSearchReport> {
  const baseline = validateOptimizationCandidate(options.baseline, options.examples);
  if (!Number.isSafeInteger(options.maximumTrials) || options.maximumTrials < 1 || options.maximumTrials > 32
    || options.examples.length > 16 || options.bindings.optimizerVersion !== OPTIMIZER_VERSION) throw new Error("OPTIMIZER_SEARCH_BOUND_INVALID");
  const timeoutMs = options.timeoutMs ?? 60000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 3600000) throw new Error("OPTIMIZER_TIMEOUT_INVALID");
  const bindingsDigest = digestCanonicalJson({ ...options.bindings, baseline,
    examples: options.examples.map(example => ({ exampleId: example.exampleId, contentDigest: example.contentDigest })), maximumTrials: options.maximumTrials });
  const prior = options.resume ? replayOptimizerSearch(options.resume, options.examples) : undefined;
  if (prior && (prior.bindingsDigest !== bindingsDigest || digestCanonicalJson(prior.baseline) !== digestCanonicalJson(baseline))) throw new Error("OPTIMIZER_RESUME_BINDING_MISMATCH");
  const trials: OptimizerTrial[] = [];
  let best = baseline;
  let bestScore = -1;
  let stopReason: OptimizerSearchReport["stopReason"] = "running";
  const current = () => reportWithDigest({ schemaVersion: "optimizer-search-report.v1", optimizerVersion: OPTIMIZER_VERSION,
    bindingsDigest, baseline, best, improved: digestCanonicalJson(best) !== digestCanonicalJson(baseline), stopReason, trials });
  const persist = async () => {
    await options.onCheckpoint?.(current());
    if (!options.outputPath) return;
    const path = resolve(options.outputPath);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(current(), null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    chmodSync(temporary, 0o600);
    renameSync(temporary, path);
  };
  const controller = new AbortController();
  const cancel = () => { stopReason = "cancelled"; controller.abort(); };
  options.signal?.addEventListener("abort", cancel, { once: true });
  if (options.signal?.aborted) cancel();
  if (controller.signal.aborted) { await persist(); options.signal?.removeEventListener("abort", cancel); return current(); }
  const workdir = mkdtempSync(join(tmpdir(), "talent-signal-optimizer-"));
  const worker = fileURLToPath(new URL("../../optimizer/worker.py", import.meta.url));
  const child = spawn(options.pythonExecutable ?? "python3", ["-I", "-u", worker], { cwd: workdir,
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin", LANG: "C.UTF-8" }, stdio: ["pipe", "pipe", "pipe"] });
  const closed = new Promise<number | null>(resolveClose => {
    child.once("error", () => { stopReason = "worker_failed"; controller.abort(); resolveClose(null); });
    child.once("close", code => resolveClose(code));
  });
  let protocolBytes = 0;
  child.stdout.on("data", chunk => { protocolBytes += Buffer.byteLength(chunk); if (protocolBytes > 1_000_000) { stopReason = "worker_failed"; controller.abort(); } });
  child.stderr.on("data", () => {}); // Provider/user content is never forwarded as a worker diagnostic.
  child.stdin.on("error", () => { if (stopReason === "running") { stopReason = "worker_failed"; controller.abort(); } });
  const kill = () => child.kill("SIGKILL");
  controller.signal.addEventListener("abort", kill, { once: true });
  const timeout = setTimeout(() => { stopReason = "timeout"; controller.abort(); }, timeoutMs);
  let finalPacket = false;
  try {
    await persist();
    child.stdin.write(`${JSON.stringify({ type: "init", version: OPTIMIZER_VERSION, baseline,
      devExampleIds: options.examples.map(example => example.exampleId), maximumTrials: options.maximumTrials })}\n`);
    const lines = createInterface({ input: child.stdout });
    for await (const line of lines) {
      if (controller.signal.aborted) break;
      if (line.length > 65536) throw new Error("OPTIMIZER_PROTOCOL_INVALID");
      const packet = JSON.parse(line) as Record<string, unknown>;
      if (packet.type === "completed") {
        if (Object.keys(packet).sort().join(",") !== "best,improved,stopReason,trials,type,version" || packet.version !== OPTIMIZER_VERSION
          || packet.trials !== trials.length || digestCanonicalJson(packet.best) !== digestCanonicalJson(best)
          || packet.improved !== current().improved || !["search_exhausted", "trial_limit"].includes(packet.stopReason as string)) throw new Error("OPTIMIZER_PROTOCOL_INVALID");
        stopReason = packet.stopReason as "search_exhausted" | "trial_limit";
        finalPacket = true;
        child.stdin.end();
        break;
      }
      if (packet.type !== "evaluate" || Object.keys(packet).sort().join(",") !== "candidate,trial,type" || packet.trial !== trials.length
        || trials.length >= options.maximumTrials) throw new Error("OPTIMIZER_PROTOCOL_INVALID");
      const candidate = validateOptimizationCandidate(packet.candidate, options.examples);
      const ordinal = trials.length;
      const trialId = `trial-${digestCanonicalJson({ bindingsDigest, ordinal, candidate }).slice(7, 39)}`;
      const cached = prior?.trials[ordinal];
      let result: OptimizerTrialResult;
      if (cached) {
        if (cached.trialId !== trialId) throw new Error("OPTIMIZER_RESUME_SEQUENCE_MISMATCH");
        result = verifyResult(cached.result);
      } else {
        try {
          result = verifyResult(await Promise.race([
            options.evaluate(structuredClone(candidate), trialId, controller.signal),
            new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new Error("OPTIMIZER_ABORTED")), { once: true })),
          ]));
        } catch { if (!controller.signal.aborted) stopReason = "evaluation_failed"; throw new Error("OPTIMIZER_EVALUATION_STOPPED"); }
      }
      if (controller.signal.aborted) break;
      const diff = (["taskFragmentId", "exampleIds"] as const).filter(field => digestCanonicalJson(baseline[field]) !== digestCanonicalJson(candidate[field]))
        .map(field => ({ field, before: baseline[field], after: candidate[field] }));
      trials.push({ trialId, ordinal, candidate, candidateDigest: digestCanonicalJson(candidate), diff, result });
      const score = result.hardGate ? result.score : -1;
      if (ordinal === 0 || score > bestScore) { bestScore = score; best = candidate; }
      await persist();
      child.stdin.write(`${JSON.stringify({ type: "evaluation", trial: ordinal, result: { score: result.score, hardGate: result.hardGate } })}\n`);
    }
    const code = await closed;
    if (!finalPacket || code !== 0) { if (!controller.signal.aborted) stopReason = "worker_failed"; }
  } catch { if (stopReason === "running") stopReason = "worker_failed"; child.kill("SIGKILL"); await closed; }
  finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", cancel);
    controller.signal.removeEventListener("abort", kill);
    child.kill("SIGKILL");
    rmSync(workdir, { recursive: true, force: true });
    await persist();
  }
  return current();
}
