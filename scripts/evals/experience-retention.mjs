import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { ClaudeChatProvider, claudeHarnessConfiguration, claudeHarnessConfigurationReceipt, runClaudeHarness } from "../../apps/agent/dist/index.js";
import { WORKSPACE_CONVERSATION_SYSTEM_PROMPT } from "../../apps/agent/dist/prompts.js";

const output = process.argv[2];
if (!output) throw new Error("Usage: experience-retention.mjs OUTPUT_JSON");
const configuration = claudeHarnessConfiguration(process.env);
const report = { schema: "experience-retention.v1", dataClass: "synthetic", createdAt: new Date().toISOString(),
  configuration: claudeHarnessConfigurationReceipt(configuration), trials: [],
  qualityReview: { status: "pending_manual_review", note: "Transport checks do not grade the meaning of a reply or establish product deployment." } };
const fixtures = [
  { id: "no-action", objective: "合成测试：用三句话说明 no_action 的含义。不要创建任何记录。" },
  { id: "retention-correction", objective: "之前说 no_action 就是不落库，所以这段对话完全不会保存，对吗？请简短说明。", conversationHistory: [
    { message_id: "synthetic-prior", role: "assistant", text: "no_action 意味着所有相关信息不落库。" },
  ] },
  { id: "ordinary-reply", objective: "合成测试：只回答测试完成。" },
];
for (const fixture of fixtures) {
  let receipt, promptHash;
  const provider = new ClaudeChatProvider(configuration, async (...args) => {
    promptHash = createHash("sha256").update(args[1].systemPrompt).digest("hex");
    receipt = await runClaudeHarness(...args);
    return receipt;
  });
  const start = Date.now();
  try {
    const result = await provider.run({ runID: randomUUID(), objective: fixture.objective,
      systemPrompt: WORKSPACE_CONVERSATION_SYSTEM_PROMPT,
      conversationHistory: fixture.conversationHistory,
      scopeSummary: { kind: "workspace_conversation", workspaceID: "10000000-0000-4000-8000-000000000098", sessionID: null, currentPersonID: null, currentRelationshipContextID: null },
      toolManifest: [], budget: { maxTurns: 3, maxToolCalls: 1, maxTaskTokens: 12000, maxEstimatedUsd: 1, maxDurationMs: 60000 },
    }, async () => { throw new Error("UNEXPECTED_TOOL_CALL"); }, AbortSignal.timeout(65000));
    report.trials.push({ id: fixture.id, objective: fixture.objective, status: "returned", promptHash,
      output: result.structuredOutput, durationMs: Date.now() - start, reportedModels: receipt.reportedModels,
      toolCalls: receipt.toolCalls, inputTokens: result.inputTokens, outputTokens: result.outputTokens });
  } catch (error) {
    const safeCode = typeof error?.message === "string" && /^[A-Z][A-Z_0-9]+$/.test(error.message) ? error.message : error?.name ?? "unknown";
    report.trials.push({ id: fixture.id, status: "failed", error: safeCode, durationMs: Date.now() - start });
  }
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify({ id: fixture.id, status: report.trials.at(-1).status }));
}
if (report.trials.some(trial => trial.status !== "returned")) process.exitCode = 1;
