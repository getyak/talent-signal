import { fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runClaudeHarness, claudeHarnessConfiguration, sweepClaudeHarnessWorkspaces } from "../../apps/agent/dist/index.js";

const args = process.argv.slice(2), childMode = args.at(-1) === "--child";
if (childMode) args.pop();
if (args.length !== 4 || args[0] !== "--endpoint" || args[2] !== "--model") throw new Error("Usage: probe-claude-crash-cleanup.mjs --endpoint URL --model MODEL");

if (childMode) {
  const configuration = claudeHarnessConfiguration({ ...process.env, ANTHROPIC_BASE_URL: args[1], TALENT_SIGNAL_AGENT_MODEL: args[3] });
  const sessionID = randomUUID(), entries = [];
  let resume = false;
  const store = {
    async append(_key, batch) { for (const entry of batch) if (!entry.uuid || !entries.some(prior => prior.uuid === entry.uuid)) entries.push(structuredClone(entry)); },
    async load() { return structuredClone(entries); },
    async listSubkeys(key) {
      // The pinned SDK has written the main transcript before this callback.
      // Parent SIGKILL means neither SDK dispose nor the harness finally can run.
      process.send?.({ phase: "resume_materialized", sessionID, projectKey: key.projectKey });
      await new Promise(() => {});
      return [];
    },
  };
  const continuation = async () => ({ sessionID, resume, store, assertCurrent: async () => {}, finish: async completed => { if (completed) resume = true; } });
  const request = { systemPrompt: "Synthetic crash cleanup test. Reply exactly ACK. No private data or external actions.", tools: [], continuation,
    assertCurrent: async () => {}, budget: { maxTurns: 2, maxToolCalls: 2, maxDurationMs: 90_000, maxTaskTokens: 10_000, maxEstimatedUsd: 0.5 } };
  try {
    const first = await runClaudeHarness(configuration, { ...request, objective: "Synthetic first turn. Reply ACK." }, new AbortController().signal);
    process.send?.({ phase: "first_completed", usage: { inputTokens: first.inputTokens, outputTokens: first.outputTokens, sdkEstimatedUsd: first.estimatedUsd }, reportedModels: first.reportedModels });
    await runClaudeHarness(configuration, { ...request, objective: "Synthetic continuation." }, new AbortController().signal);
    process.exitCode = 1;
  } catch { process.send?.({ phase: "probe_failed" }); process.exitCode = 1; }
} else {
  const started = Date.now();
  const child = fork(fileURLToPath(import.meta.url), [...args, "--child"], { stdio: ["ignore", "ignore", "ignore", "ipc"] });
  let stage, first;
  const timeout = setTimeout(() => child.kill("SIGKILL"), 120_000);
  child.on("message", message => {
    if (message?.phase === "first_completed") first = message;
    if (message?.phase === "resume_materialized") { stage = message; child.kill("SIGKILL"); }
  });
  const killed = await new Promise(resolve => child.once("exit", (_code, signal) => resolve(signal === "SIGKILL")));
  clearTimeout(timeout);
  const workspaces = [];
  for (const name of (await readdir(tmpdir())).filter(name => name.startsWith("talent-signal-harness-v1-"))) {
    const path = join(tmpdir(), name);
    const owner = await readFile(join(path, ".harness-owner.json"), "utf8").then(JSON.parse, () => null);
    if (owner?.pid === child.pid) workspaces.push(path);
  }
  const copies = [];
  if (stage) for (const name of (await readdir(tmpdir())).filter(name => name.startsWith("claude-resume-"))) {
    const path = join(tmpdir(), name);
    if (await access(join(path, "projects", stage.projectKey, `${stage.sessionID}.jsonl`)).then(() => true, () => false)) copies.push(path);
  }
  await sweepClaudeHarnessWorkspaces();
  const remaining = (await Promise.all([...workspaces, ...copies].map(path => access(path).then(() => true, () => false)))).filter(Boolean).length;
  const passed = killed && Boolean(stage) && workspaces.length === 1 && copies.length === 1 && remaining === 0;
  console.log(JSON.stringify({ probe: "claude-crash-cleanup.v1", dataClass: "synthetic", status: passed ? "passed" : "failed",
    killedAfterResumeMaterialization: killed && Boolean(stage), ownedWorkspacesBefore: workspaces.length,
    resumeCopiesBefore: copies.length, ownedCopiesRemaining: remaining, durationMs: Date.now() - started,
    usage: first?.usage ?? null, reportedModels: first?.reportedModels ?? [] }));
  if (!passed) process.exitCode = 1;
}
