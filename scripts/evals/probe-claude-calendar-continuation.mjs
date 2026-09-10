import { randomUUID } from "node:crypto";
import { readdir, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClaudeChatProvider, claudeHarnessConfiguration, claudeHarnessConfigurationReceipt } from "../../apps/agent/dist/index.js";

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
const provider = new ClaudeChatProvider(configuration);
const results = [], started = Date.now();
try {
  for (const [index, objective] of [`Remember this synthetic code for our next turn: ${marker}. Reply exactly ACK.`,
    "Return only the synthetic code I supplied in our previous turn.",
    "请为明天15点至15点30分的合成测试会议准备日历草稿。"].entries()) {
    results.push(await provider.answer({ objective, mode: "unscoped_conversation", context_blocks: [], allowed_citation_ids: [],
      calendarContext: { sourceRequestID: randomUUID(), referenceTime: index === 0 ? "2026-12-30T02:00:00Z" : "2026-12-31T02:00:00Z", timeZone: "Asia/Shanghai" }, continuation }));
  }
  const ownResumeCopies = [];
  for (const name of (await readdir(tmpdir())).filter(name => name.startsWith("claude-resume-"))) {
    const projects = join(tmpdir(), name, "projects");
    for (const project of await readdir(projects).catch(() => [])) {
      if (await access(join(projects, project, `${sessionID}.jsonl`)).then(() => true, () => false)) ownResumeCopies.push(name);
    }
  }
  const passed = results.every(result => result.provider_request_id === sessionID) && results[0].body.trim() === "ACK" && results[1].body.trim() === marker && ownResumeCopies.length === 0
    && results[2].calendarDraft?.starts_at === "2027-01-01T07:00:00.000Z" && results[2].calendarDraft?.ends_at === "2027-01-01T07:30:00.000Z";
  console.log(JSON.stringify({ probe: "claude-calendar-continuation.v1", dataClass: "synthetic", status: passed ? "passed" : "failed",
    configuration: claudeHarnessConfigurationReceipt(configuration), sameSession: results.every(result => result.provider_request_id === sessionID),
    secondTurnContainsNoPriorCode: true, recalledExactCode: results[1].body.trim() === marker, ownResumeCopiesRemaining: ownResumeCopies.length,
    crossedDayWithoutFingerprintChange: true, calendarDraft: results[2].calendarDraft ?? null,
    boundary: "Real SDK with in-memory host store; no product database, native Calendar write or production candidate data.",
    mirroredEntries: [...entries.values()].reduce((sum, value) => sum + value.length, 0), durationMs: Date.now() - started,
    runs: results.map(result => ({ inputTokens: result.input_tokens, outputTokens: result.output_tokens, reportedModel: result.reported_model })) }));
  if (!passed) process.exitCode = 1;
} catch (error) {
  const code = error instanceof Error && /^CLAUDE_[A-Z0-9_]+$/u.test(error.message) ? error.message : "CLAUDE_CONTINUATION_PROBE_FAILED";
  console.log(JSON.stringify({ probe: "claude-calendar-continuation.v1", dataClass: "synthetic", status: "failed", errorCode: code,
    completedRuns: results.length, durationMs: Date.now() - started }));
  process.exitCode = 1;
} finally { entries.clear(); }
