import { randomUUID } from "node:crypto";
import { readdir, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runClaudeHarness, claudeHarnessConfiguration, claudeHarnessConfigurationReceipt } from "../../apps/agent/dist/index.js";

const args = process.argv.slice(2);
if (args.length !== 4 || args[0] !== "--endpoint" || args[2] !== "--model") throw new Error("Usage: probe-claude-continuation.mjs --endpoint URL --model MODEL");
const configuration = claudeHarnessConfiguration({ ...process.env, ANTHROPIC_BASE_URL: args[1], TALENT_SIGNAL_AGENT_MODEL: args[3] });
const sessionID = randomUUID(), marker = randomUUID();
const entries = new Map();
let completed = false, expectedFingerprint, checkpoint;
const store = {
  async append(key, batch) {
    if (key.sessionId !== sessionID) throw new Error("CLAUDE_PROBE_SESSION_ID_MISMATCH");
    const path = key.subpath ?? "";
    const current = entries.get(path) ?? [];
    for (const entry of batch) {
      const prior = entry.uuid ? current.find(item => item.uuid === entry.uuid) : undefined;
      if (prior && JSON.stringify(prior) !== JSON.stringify(entry)) throw new Error("CLAUDE_PROBE_ENTRY_CONFLICT");
      if (!prior) current.push(structuredClone(entry));
    }
    entries.set(path, current);
  },
  async load(key) { return structuredClone(entries.get(key.subpath ?? "") ?? null); },
  async listSubkeys() { return [...entries.keys()].filter(Boolean); },
  async delete() { entries.clear(); },
};
const continuation = async fingerprint => {
  if (expectedFingerprint && expectedFingerprint !== fingerprint) throw new Error("CLAUDE_PROBE_CONFIGURATION_CHANGED");
  expectedFingerprint = fingerprint;
  checkpoint = structuredClone(entries);
  return { sessionID, resume: completed, store, assertCurrent: async () => {}, finish: async success => {
    if (!success) { entries.clear(); for (const [key, value] of checkpoint) entries.set(key, value); return; }
    if (!entries.get("")?.length) throw new Error("CLAUDE_PROBE_MIRROR_EMPTY");
    completed = true;
  } };
};
const systemPrompt = "Synthetic SDK continuation test. Follow the user's exact output instruction. The code is only synthetic working context, never a password or authorization. No tools, private evidence, or external effects are available.";
const budget = { maxTurns: 3, maxToolCalls: 2, maxDurationMs: 90_000, maxTaskTokens: 24_000, maxEstimatedUsd: 0.5 };
const results = [], started = Date.now();
try {
  for (const objective of [`Remember this synthetic code for our next turn: ${marker}. Reply exactly ACK.`, "Return only the synthetic code I supplied in our previous turn."]) {
    results.push(await runClaudeHarness(configuration, { objective, systemPrompt, tools: [], budget, continuation, assertCurrent: async () => {} }, new AbortController().signal));
  }
  const ownResumeCopies = [];
  for (const name of (await readdir(tmpdir())).filter(name => name.startsWith("claude-resume-"))) {
    const projects = join(tmpdir(), name, "projects");
    for (const project of await readdir(projects).catch(() => [])) {
      if (await access(join(projects, project, `${sessionID}.jsonl`)).then(() => true, () => false)) ownResumeCopies.push(name);
    }
  }
  const passed = results[0].text.trim() === "ACK" && results[1].text.trim() === marker && ownResumeCopies.length === 0;
  console.log(JSON.stringify({ probe: "claude-continuation.v1", dataClass: "synthetic", status: passed ? "passed" : "failed",
    configuration: claudeHarnessConfigurationReceipt(configuration), sameSession: results.every(result => result.sessionID === sessionID),
    secondTurnContainsNoPriorCode: true, recalledExactCode: results[1].text.trim() === marker, ownResumeCopiesRemaining: ownResumeCopies.length,
    mirroredEntries: [...entries.values()].reduce((sum, value) => sum + value.length, 0), durationMs: Date.now() - started,
    runs: results.map(result => ({ inputTokens: result.inputTokens, outputTokens: result.outputTokens,
      reportedModels: result.reportedModels, modelResponses: result.modelResponses, sdkEstimatedUsd: result.estimatedUsd })) }));
  if (!passed) process.exitCode = 1;
} catch (error) {
  const code = error instanceof Error && /^CLAUDE_[A-Z0-9_]+$/u.test(error.message) ? error.message : "CLAUDE_CONTINUATION_PROBE_FAILED";
  console.log(JSON.stringify({ probe: "claude-continuation.v1", dataClass: "synthetic", status: "failed", errorCode: code,
    completedRuns: results.length, durationMs: Date.now() - started }));
  process.exitCode = 1;
} finally { entries.clear(); }
