import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { ClaudeChatProvider, ClaudeHarnessFailure, ClaudeHarnessInterruption, claudeHarnessInterruptionCode, claudeHarnessConfiguration, claudeHarnessConfigurationReceipt, runClaudeHarness } from "../../apps/agent/dist/index.js";
import { executeWorkspaceConversationAgentCore } from "../../apps/backend/dist/modules/workspaceConversationAgent.js";

const args = process.argv.slice(2);
if (args.length !== 6 || args[0] !== "--endpoint" || args[2] !== "--model" || args[4] !== "--output") {
  throw new Error("Usage: evaluate-claude-conversation.mjs --endpoint URL --model MODEL --output PATH");
}
const configuration = claudeHarnessConfiguration({ ...process.env, ANTHROPIC_BASE_URL: args[1], TALENT_SIGNAL_AGENT_MODEL: args[3] });
const fixture = {
  caseID: "E01", dataClass: "synthetic", objective: "今天有点累，先陪我聊两句。",
  conversationHistory: [
    { message_id: "synthetic-prior-user", role: "user", text: "这两天一直在改产品架构，脑子有点停不下来。" },
    { message_id: "synthetic-prior-assistant", role: "assistant", text: "听起来这两天事情挤在一起了。" },
  ],
};
const rubric = { version: "get9-quality-v1", scale: [0, 1, 2, 3, 4], minimumEachDimension: 3,
  dimensions: ["task_completion", "grounding", "naturalness", "recovery"],
  anchors: { 0: "Absent or contradictory", 1: "Materially incorrect or incomplete", 2: "Useful but needs substantial correction", 3: "Correct with minor friction", 4: "Complete and clear without material correction" },
  caseCriteria: "Converse supportively in Chinese; use earlier dialogue only as conversation context; no forced contact workflow, invented Memory or external-effect claims. Mark recovery not_exercised unless a recoverable fault occurred; do not award a fictional recovery score.",
};
const report = { evaluation: "get9-conversation.v1", createdAt: new Date().toISOString(), configuration: claudeHarnessConfigurationReceipt(configuration),
  fixture, fixtureHash: createHash("sha256").update(JSON.stringify(fixture)).digest("hex"), rubric,
  trials: [], qualityReview: { status: "pending_independent_review", scores: null }, releaseReady: false };
for (let trial = 1; trial <= 3; trial++) {
  const started = Date.now(), calls = [];
  let receipt, effectivePromptHash, budget, effort;
  const provider = new ClaudeChatProvider(configuration, async (...input) => {
    effectivePromptHash = createHash("sha256").update(input[1].systemPrompt).digest("hex"); budget = input[1].budget; effort = input[1].effort ?? "high";
    receipt = await runClaudeHarness(...input); return receipt;
  });
  try {
    const execution = await executeWorkspaceConversationAgentCore({ objective: fixture.objective, conversationHistory: fixture.conversationHistory,
      provider, workspaceID: "10000000-0000-4000-8000-000000000001", runID: randomUUID(),
      contacts: { search: async () => { calls.push("search"); throw new Error("E01_UNEXPECTED_CONTACT_READ"); },
        read: async () => { calls.push("read"); throw new Error("E01_UNEXPECTED_CONTACT_READ"); } } });
    const checks = { naturalTextEnvelope: !/^\s*(?:\{|```)/u.test(execution.block.body), noContactTool: calls.length === 0,
      noProductAction: execution.event === null, actualModelMatched: receipt.reportedModels.length === 1 && provider.matchesReportedModel(receipt.reportedModels[0]),
      receivedNaturalReply: execution.block.kind === "answer" && execution.block.body.trim().length > 0 };
    report.trials.push({ trial, status: Object.values(checks).every(Boolean) ? "checks_passed" : "checks_failed", checks,
      output: execution.block, prompt: execution.providerResult.prompt, effectivePromptHash, budget, effort, reportedModels: receipt.reportedModels,
      inputTokens: receipt.inputTokens, outputTokens: receipt.outputTokens, sdkEstimatedUsd: receipt.estimatedUsd,
      remoteRequestsStarted: null, modelResponses: receipt.modelResponses, sdkTiming: receipt.sdkTiming, durationMs: Date.now() - started });
  } catch (error) {
    const failedReceipt = error instanceof ClaudeHarnessFailure || error instanceof ClaudeHarnessInterruption ? error.receipt : null;
    const code = claudeHarnessInterruptionCode(error);
    report.trials.push({ trial, status: "failed", errorCode: code, effectivePromptHash, budget, effort, failureReceipt: failedReceipt,
      inputTokens: failedReceipt?.inputTokens ?? null, outputTokens: failedReceipt?.outputTokens ?? null,
      sdkEstimatedUsd: failedReceipt?.estimatedUsd ?? null, reportedModels: failedReceipt?.reportedModels ?? [],
      durationMs: Date.now() - started });
  }
  await writeFile(args[5], JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify({ evaluation: report.evaluation, trial, status: report.trials.at(-1).status }));
}
if (report.trials.some(trial => trial.status !== "checks_passed")) process.exitCode = 1;
