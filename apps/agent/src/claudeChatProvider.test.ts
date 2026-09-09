import { describe, expect, it, vi } from "vitest";
import { ClaudeChatProvider } from "./claudeChatProvider.js";
import { claudeHarnessConfiguration } from "./claudeHarnessConfiguration.js";
import { ClaudeHarnessInterruption, type ClaudeHarnessRequest } from "./claudeHarness.js";
import { createEnvironmentChatAnswerProvider } from "./chatAnswerProvider.js";
import { bundledPrompt } from "./promptRegistry.js";

const configuration = claudeHarnessConfiguration({ ANTHROPIC_API_KEY: "synthetic", TALENT_SIGNAL_AGENT_MODEL: "synthetic-model" });
const outcome = { text: "听起来今天很累。想说说发生了什么，还是聊点轻松的？", structuredOutput: null,
  sessionID: "synthetic-session", inputTokens: 10, outputTokens: 20, estimatedUsd: 0.01,
  turns: 1, toolCalls: 0, terminalReason: "completed", permissionDenials: [], reportedModels: ["synthetic-model"] };

describe("Claude natural chat product adapter", () => {
  it("admits the SDK via server configuration and preserves explicit processing gates", () => {
    const env = { TALENT_SIGNAL_CHAT_PROVIDER: "claude", TALENT_SIGNAL_ALLOW_REMOTE_CHAT_PROCESSING: "true",
      TALENT_SIGNAL_AGENT_MODEL: "synthetic-model", ANTHROPIC_API_KEY: "synthetic" };
    expect(createEnvironmentChatAnswerProvider(env)).toBeInstanceOf(ClaudeChatProvider);
    expect(createEnvironmentChatAnswerProvider({ ...env, TALENT_SIGNAL_ALLOW_REMOTE_CHAT_PROCESSING: "false" })).toBeNull();
    expect(createEnvironmentChatAnswerProvider(env)?.supportsImageInput).toBe(false);
    expect(() => createEnvironmentChatAnswerProvider({ ...env, ANTHROPIC_API_KEY: "" })).toThrow("CREDENTIAL_AMBIGUOUS_OR_MISSING");
  });

  it("answers E01 naturally using bounded authorized dialogue without mandatory JSON", async () => {
    const execute = vi.fn(async (_configuration, request: ClaudeHarnessRequest) => {
      expect(request.outputSchema).toBeUndefined();
      expect(request.systemPrompt).not.toContain("Return JSON");
      expect(request.systemPrompt).toContain("natural prose");
      expect(request.context).toContain("我今天刚做完演讲");
      expect(request.tools).toEqual([]);
      return outcome;
    });
    const provider = new ClaudeChatProvider(configuration, execute);
    const answer = await provider.answer({ objective: "今天有点累，先陪我聊两句。", mode: "unscoped_conversation",
      prompt_snapshot: bundledPrompt("assistant/conversation"),
      conversation_history: [{ message_id: "prior", role: "user", text: "我今天刚做完演讲" }],
      context_blocks: [], allowed_citation_ids: [] });
    expect(answer.body).toBe(outcome.text);
    expect(answer.provider_id).toBe("claude-agent-sdk");
    expect(answer.citation_ids).toEqual([]);
  });

  it("rejects out-of-scope citations and records only successful citation tool receipts", async () => {
    const execute = vi.fn(async (_configuration, request: ClaudeHarnessRequest) => {
      const cite = request.tools[0]!;
      expect((await cite.execute({ source_ids: ["other-account"] }, new AbortController().signal)).isError).toBe(true);
      expect((await cite.execute({ source_ids: ["evidence-1"] }, new AbortController().signal)).isError).toBeUndefined();
      return outcome;
    });
    const provider = new ClaudeChatProvider(configuration, execute);
    const answer = await provider.answer({ objective: "我答应她什么了？", prompt_snapshot: bundledPrompt("assistant/relationship"),
      context_blocks: [], allowed_citation_ids: ["evidence-1"] });
    expect(answer.citation_ids).toEqual(["evidence-1"]);
  });

  it("retrieves sourced Memory in a fresh Session without embedding it as prior dialogue", async () => {
    const memory = { block_id: "commitment", block_key: "commitment", type: "commitment", status: "confirmed",
      headline: "Prototype follow-up", summary: "周五给陈夏发原型", items: [], evidence_fragment_ids: ["source-commitment"] };
    const execute = vi.fn(async (_configuration, request: ClaudeHarnessRequest) => {
      expect(request.context).not.toContain("周五给陈夏发原型");
      expect(JSON.parse(request.context!).conversation).toEqual([]);
      const read = request.tools.find(tool => tool.name === "read_relationship_memory")!;
      expect(read.readOnly).toBe(true);
      const found = await read.execute({ block_types: ["commitment"] }, new AbortController().signal);
      expect(JSON.parse(found.content[0]!.text as string).blocks).toEqual([memory]);
      const empty = await read.execute({ block_types: ["not-in-scope"] }, new AbortController().signal);
      expect(JSON.parse(empty.content[0]!.text as string).blocks).toEqual([]);
      await request.tools.find(tool => tool.name === "cite_evidence")!.execute({ source_ids: ["source-commitment"] }, new AbortController().signal);
      return { ...outcome, text: "你答应周五给陈夏发原型。" };
    });
    const response = await new ClaudeChatProvider(configuration, execute).answer({ objective: "我之前答应她什么来着？",
      prompt_snapshot: bundledPrompt("assistant/relationship"), context_blocks: [memory], allowed_citation_ids: ["source-commitment"] });
    expect(response.citation_ids).toEqual(["source-commitment"]);
  });

  it("reads a host-supplied formatting preference without granting a Memory write", async () => {
    const preference = { responseStyle: "conclusion_first" as const,
      sourceID: "user-preference:10000000-0000-4000-8000-000000000011:2", updatedAt: "2026-09-09T00:00:00Z" };
    const execute = vi.fn(async (_configuration, request: ClaudeHarnessRequest) => {
      expect(request.tools.map(tool => tool.name)).toEqual(["read_response_preference"]);
      const tool = request.tools[0]!; expect(tool.readOnly).toBe(true);
      const result = await tool.execute({}, new AbortController().signal);
      expect(JSON.parse(result.content[0]!.text as string)).toMatchObject({ kind: "user_setting", response_style: "conclusion_first", source_id: preference.sourceID });
      return outcome;
    });
    await new ClaudeChatProvider(configuration, execute).answer({ mode: "unscoped_conversation", objective: "Explain this simply",
      prompt_snapshot: bundledPrompt("assistant/conversation"), context_blocks: [], allowed_citation_ids: [], responsePreference: preference });
  });

  it("keeps incomplete token lower bounds out of Lab total-usage columns", async () => {
    const failure = new ClaudeHarnessInterruption({ sessionID: "partial-session", inputTokens: 12, outputTokens: 4,
      estimatedUsd: null, turns: null, toolCalls: 1, reportedModels: ["synthetic-model"], modelResponses: 1,
      terminalReason: "CLAUDE_HARNESS_TIMEOUT", permissionDenials: [], usageComplete: false }, "CLAUDE_HARNESS_TIMEOUT");
    const provider = new ClaudeChatProvider(configuration, async () => { throw failure; });
    const observed = vi.fn();
    await expect(provider.runWithPromptPreset({ runID: "synthetic", objective: "Explain", systemPrompt: "Synthetic",
      scopeSummary: { kind: "workspace_conversation", workspaceID: "account", sessionID: null, currentPersonID: null, currentRelationshipContextID: null },
      toolManifest: [], budget: { maxTurns: 6, maxToolCalls: 6, maxDurationMs: 30_000, maxTaskTokens: 32_000, maxEstimatedUsd: 1 } },
      async name => ({ callID: "unused", name, ok: true, data: {} }), new AbortController().signal, "baseline", observed)).rejects.toBe(failure);
    expect(observed).toHaveBeenCalledWith(expect.objectContaining({ input_tokens: null, output_tokens: null,
      actual_model: "synthetic-model", responses_received: 1 }));
    expect(failure.receipt).toMatchObject({ inputTokens: 12, outputTokens: 4, usageComplete: false });
  });

  it("uses the product's proposal receipt rather than an invented completion in prose", async () => {
    const execute = vi.fn(async (_configuration, request: ClaudeHarnessRequest) => {
      await request.tools[0]!.execute({ operation: "search", query: "陈夏" }, new AbortController().signal);
      return { ...outcome, text: "联系人已经创建。" };
    });
    const provider = new ClaudeChatProvider(configuration, execute);
    const request = { runID: "synthetic", objective: "添加陈夏", systemPrompt: "Synthetic",
      scopeSummary: { kind: "workspace_conversation" as const, workspaceID: "account-1", sessionID: null, currentPersonID: null, currentRelationshipContextID: null },
      toolManifest: ["contact_workspace"] as const,
      budget: { maxTurns: 6, maxToolCalls: 6, maxDurationMs: 30_000, maxTaskTokens: 32_000, maxEstimatedUsd: 1 } };
    const invoke = vi.fn(async () => ({ ok: true as const, callID: "call-1", name: "contact_workspace",
      data: { operation: "propose_create", status: "needs_review" }, candidateFingerprint: "confirmed-tool-receipt" }));
    const result = await provider.run(request, invoke, new AbortController().signal);
    expect(result.structuredOutput).toEqual({ outcome: "contact_change_proposal", candidate_fingerprint: "confirmed-tool-receipt" });
  });
});
