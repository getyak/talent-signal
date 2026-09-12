import { describe, expect, it, vi } from "vitest";
import { ClaudeChatProvider, splitFirstTurnSessionTitle } from "./claudeChatProvider.js";
import { claudeHarnessConfiguration } from "./claudeHarnessConfiguration.js";
import { ClaudeHarnessInterruption, type ClaudeHarnessRequest } from "./claudeHarness.js";
import { createEnvironmentChatAnswerProvider } from "./chatAnswerProvider.js";
import { harnessContinuationFingerprint } from "./claudeHarnessContinuation.js";
import { bundledPrompt } from "./promptRegistry.js";
import sharp from "sharp";
import { createHash, randomUUID } from "node:crypto";

const configuration = claudeHarnessConfiguration({ ANTHROPIC_API_KEY: "synthetic", TALENT_SIGNAL_AGENT_MODEL: "synthetic-model" });
const outcome = { text: "听起来今天很累。想说说发生了什么，还是聊点轻松的？", structuredOutput: null,
  sessionID: "synthetic-session", inputTokens: 10, outputTokens: 20, estimatedUsd: 0.01,
  turns: 1, toolCalls: 0, terminalReason: "completed", permissionDenials: [], reportedModels: ["synthetic-model"] };

describe("Claude natural chat product adapter", () => {
  it("extracts first-turn title metadata without adding a model request", async () => {
    const execute = vi.fn(async (_configuration, request: ClaudeHarnessRequest) => {
      expect(JSON.parse(request.context!).session_title_requested).toBe(true);
      expect(request.tools).toEqual([]);
      return {
        ...outcome,
        text: "<session_title>比较两版外联话术</session_title>\n\n这里是比较结果。",
      };
    });
    const answer = await new ClaudeChatProvider(configuration, execute).answer({
      objective: "请比较这两版外联话术",
      mode: "unscoped_conversation",
      session_title_requested: true,
      prompt_snapshot: bundledPrompt("assistant/conversation"),
      context_blocks: [],
      allowed_citation_ids: [],
    });
    expect(execute).toHaveBeenCalledOnce();
    expect(answer.title).toBe("回复");
    expect(answer.session_title).toBe("比较两版外联话术");
    expect(answer.body).toBe("这里是比较结果。");
  });

  it("does not return Session metadata when the host closes the first-result gate", async () => {
    const execute = vi.fn(async (_configuration, request: ClaudeHarnessRequest) => {
      expect(JSON.parse(request.context!).session_title_requested).toBe(false);
      return { ...outcome, text: "<session_title>不应采用</session_title>\n\n后续回复" };
    });
    const answer = await new ClaudeChatProvider(configuration, execute).answer({
      objective: "继续比较",
      mode: "unscoped_conversation",
      session_title_requested: false,
      conversation_history: [{ message_id: "prior", role: "assistant", text: "先前回复" }],
      prompt_snapshot: bundledPrompt("assistant/conversation"),
      context_blocks: [],
      allowed_citation_ids: [],
    });
    expect(answer.title).toBe("回复");
    expect(answer.session_title).toBeUndefined();
    expect(answer.body).toBe("后续回复");
  });

  it("falls back to a bounded objective and strips an unexpected envelope", () => {
    expect(splitFirstTurnSessionTitle("普通回复", "第一行\n第二行")).toEqual({
      title: "第一行 第二行",
      body: "普通回复",
    });
    expect(splitFirstTurnSessionTitle(
      "<session_title>旧标题</session_title>\n\n后续回复",
      "后续问题",
    ).body).toBe("后续回复");
  });

  it("uses an ephemeral Memory-image Run and rejects expiry after the tool returns",async()=>{
    const bytes=await sharp({create:{width:10,height:10,channels:3,background:"white"}}).png().toBuffer();
    const id=randomUUID();let expired=false;const continuation=vi.fn();
    const provider=new ClaudeChatProvider(configuration,async(_configuration,request)=>{
      expect(request.continuation).toBeUndefined();expect(request.imageToolResults).toBe(true);
      const tool=request.tools.find(tool=>tool.name==="read_evidence_source_image")!;
      const receipt=await tool.execute({evidence_id:id,tile_index:0},new AbortController().signal);
      expect(receipt.content.some(block=>block.type==="image")).toBe(true);
      expired=true;
      await expect(request.assertCurrent()).rejects.toThrow("IMAGE_EXPIRED");
      return outcome;
    },true);
    await expect(provider.answer({objective:"Verify Memory against original",context_blocks:[],allowed_citation_ids:[id],continuation,
      prompt_snapshot:bundledPrompt("assistant/relationship"),assertCurrent:async()=>{},readEvidenceImage:async()=>({
        evidence_id:id,task_id:randomUUID(),source_resource_id:randomUUID(),source_image_index:0,
        image:{media_type:"image/png",byte_size:bytes.length,content_hash:createHash("sha256").update(bytes).digest("hex"),data_base64:bytes.toString("base64")},
        assertCurrent:async()=>{if(expired)throw new Error("IMAGE_EXPIRED");},
      })})).rejects.toThrow("IMAGE_EXPIRED");
    expect(continuation).not.toHaveBeenCalled();
  });
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
      expect(request.systemPrompt).toContain("Use only tools supplied in this Run");
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

  it("supplies the frozen calendar clock as trusted instructions in both chat entry points", async () => {
    const execute = vi.fn(async (_configuration, request: ClaudeHarnessRequest) => {
      expect(JSON.parse(request.context!).calendar_clock).toContain("today 2026-09-09; tomorrow 2026-09-10");
      expect(request.systemPrompt).toContain("host-supplied calendar_clock");
      return outcome;
    });
    const provider = new ClaudeChatProvider(configuration, execute);
    const calendarContext = { sourceRequestID: "10000000-0000-4000-8000-000000000001", referenceTime: "2026-09-09T02:00:00Z", timeZone: "Asia/Shanghai" };
    await provider.answer({ objective: "明天下午三点", prompt_snapshot: bundledPrompt("assistant/relationship"),
      context_blocks: [], allowed_citation_ids: [], calendarContext });
    await provider.runWithPromptPreset({ runID: "synthetic", objective: "明天下午三点", systemPrompt: "Synthetic",
      scopeSummary: { kind: "workspace_conversation", workspaceID: "account", sessionID: null, currentPersonID: null, currentRelationshipContextID: null },
      toolManifest: [], calendarContext, budget: { maxTurns: 6, maxToolCalls: 6, maxDurationMs: 30_000, maxTaskTokens: 32_000, maxEstimatedUsd: 1 } },
      async name => ({ callID: "unused", name, ok: true, data: {} }), new AbortController().signal, "baseline", vi.fn());
    expect(execute).toHaveBeenCalledTimes(2);
  });
  it("keeps continuation identity stable across request clocks while refreshing both chat paths", async () => {
    const captured: ClaudeHarnessRequest[] = [];
    const provider = new ClaudeChatProvider(configuration, async (_configuration, request) => {
      captured.push(request); return outcome;
    });
    for (const path of ["answer", "run"] as const) {
      for (const [referenceTime, timeZone] of [["2026-09-09T02:00:00Z", "Asia/Shanghai"], ["2026-09-10T03:00:00Z", "America/Los_Angeles"]]) {
        const calendarContext = { sourceRequestID: "10000000-0000-4000-8000-000000000001", referenceTime: referenceTime!, timeZone: timeZone! };
        if (path === "answer") await provider.answer({ objective: "Tomorrow at three", context_blocks: [], allowed_citation_ids: [],
          prompt_snapshot: bundledPrompt("assistant/relationship"), calendarContext });
        else await provider.run({ runID: "synthetic", objective: "Tomorrow at three", systemPrompt: "Synthetic",
          scopeSummary: { kind: "workspace_conversation", workspaceID: "account", sessionID: null, currentPersonID: null, currentRelationshipContextID: null },
          toolManifest: [], calendarContext, budget: { maxTurns: 6, maxToolCalls: 6, maxDurationMs: 30_000, maxTaskTokens: 32_000, maxEstimatedUsd: 1 } },
          async name => ({ callID: "unused", name, ok: true, data: {} }), new AbortController().signal);
      }
      const [first, second] = captured.splice(0);
      expect(harnessContinuationFingerprint(configuration, first!)).toBe(harnessContinuationFingerprint(configuration, second!));
      expect(JSON.parse(first!.context!).calendar_clock).toContain("2026-09-09T02:00:00Z");
      expect(JSON.parse(second!.context!).calendar_clock).toContain("2026-09-10T03:00:00Z");
      expect(JSON.parse(second!.context!).calendar_clock).toContain("America/Los_Angeles");
      expect(harnessContinuationFingerprint(configuration, { ...second!, systemPrompt: "Changed policy" }))
        .not.toBe(harnessContinuationFingerprint(configuration, first!));
    }
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
      expect(JSON.parse(found.content.filter(block => block.type === "text")[0]!.text as string).blocks).toEqual([memory]);
      const empty = await read.execute({ block_types: ["not-in-scope"] }, new AbortController().signal);
      expect(JSON.parse(empty.content.filter(block => block.type === "text")[0]!.text as string).blocks).toEqual([]);
      await request.tools.find(tool => tool.name === "cite_evidence")!.execute({ source_ids: ["source-commitment"] }, new AbortController().signal);
      return { ...outcome, text: "你答应周五给陈夏发原型。" };
    });
    const response = await new ClaudeChatProvider(configuration, execute).answer({ objective: "我之前答应她什么来着？",
      prompt_snapshot: bundledPrompt("assistant/relationship"), context_blocks: [memory], allowed_citation_ids: ["source-commitment"] });
    expect(response.citation_ids).toEqual(["source-commitment"]);
  });

  it("keeps the authorized relationship identity attached to filtered Memory without widening the filter", async () => {
    const identity = { block_id: "identity", block_key: "identity", type: "identity_context", status: "confirmed",
      headline: "Leila Hartmann", summary: "Current authorized relationship", items: [], evidence_fragment_ids: [] };
    const history = { block_id: "history", block_key: "history", type: "relationship_history", status: "proposed",
      headline: "Reviewed source", summary: "Availability recorded without repeating a name", items: [], evidence_fragment_ids: ["source-1"] };
    const unrelated = { ...history, block_id: "constraint", block_key: "constraint", type: "constraint", summary: "Not requested" };
    const execute = vi.fn(async (_configuration, request: ClaudeHarnessRequest) => {
      const read = request.tools.find(tool => tool.name === "read_relationship_memory")!;
      const filtered = JSON.parse((await read.execute({ block_types: ["relationship_history"] }, new AbortController().signal)).content.filter(block => block.type === "text")[0]!.text);
      expect(filtered.identity_context).toEqual([identity]);
      expect(filtered.blocks).toEqual([history]);
      expect(JSON.stringify(filtered)).not.toContain("Not requested");
      const empty = JSON.parse((await read.execute({ block_types: ["absent"] }, new AbortController().signal)).content.filter(block => block.type === "text")[0]!.text);
      expect(empty.identity_context).toEqual([identity]);
      expect(empty.blocks).toEqual([]);
      return outcome;
    });
    await new ClaudeChatProvider(configuration, execute).answer({ objective: "What changed with Leila?",
      prompt_snapshot: bundledPrompt("assistant/relationship"), context_blocks: [identity, history, unrelated], allowed_citation_ids: ["source-1"] });
  });

  it("reads a host-supplied formatting preference without granting a Memory write", async () => {
    const preference = { responseStyle: "conclusion_first" as const,
      sourceID: "user-preference:10000000-0000-4000-8000-000000000011:2", updatedAt: "2026-09-09T00:00:00Z" };
    const execute = vi.fn(async (_configuration, request: ClaudeHarnessRequest) => {
      expect(request.tools.map(tool => tool.name)).toEqual(["read_response_preference"]);
      const tool = request.tools[0]!; expect(tool.readOnly).toBe(true);
      const result = await tool.execute({}, new AbortController().signal);
      expect(JSON.parse(result.content.filter(block => block.type === "text")[0]!.text as string)).toMatchObject({ kind: "user_setting", response_style: "conclusion_first", source_id: preference.sourceID });
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

  it("requires both read IDs and rejects operation smuggling before host dispatch", async () => {
    const person = "10000000-0000-4000-8000-000000000001", context = "10000000-0000-4000-8000-000000000002";
    const invoke = vi.fn(async () => ({ ok: true as const, callID: "read", name: "contact_workspace", data: {
      operation: "read", person: { id: person }, relationship_context: { id: context } } }));
    const execute = vi.fn(async (_configuration, request: ClaudeHarnessRequest) => {
      const read = request.tools.find(tool => tool.name === "contact_workspace_read")!;
      expect(read.readOnly).toBe(true);
      const signal = new AbortController().signal;
      for (const args of [{ person_id: person }, { person_id: person, relationship_context_id: context, reason: "extra" },
        { person_id: person, relationship_context_id: context, operation: "propose_update" }]) {
        expect((await read.execute(args, signal)).isError).toBe(true);
      }
      expect(invoke).not.toHaveBeenCalled();
      await read.execute({ person_id: person, relationship_context_id: context }, signal);
      expect(invoke).toHaveBeenCalledExactlyOnceWith("contact_workspace", { operation: "read", person_id: person, relationship_context_id: context }, signal);
      expect(request.tools.find(tool => tool.name === "contact_workspace_propose_create")!.readOnly).toBe(false);
      return outcome;
    });
    const result = await new ClaudeChatProvider(configuration, execute).run({ runID: "synthetic", objective: "What changed with Leila?", systemPrompt: "Synthetic",
      scopeSummary: { kind: "workspace_conversation", workspaceID: "account", sessionID: null, currentPersonID: null, currentRelationshipContextID: null },
      toolManifest: ["contact_workspace"], budget: { maxTurns: 6, maxToolCalls: 6, maxDurationMs: 30000, maxTaskTokens: 32000, maxEstimatedUsd: 1 } }, invoke, new AbortController().signal);
    expect(result.structuredOutput).toEqual({ outcome: "use_contact", person_id: person, relationship_context_id: context });
  });
  it("uses the product's proposal receipt rather than an invented completion in prose", async () => {
    const execute = vi.fn(async (_configuration, request: ClaudeHarnessRequest) => {
      expect(request.systemPrompt).toContain("a name is sufficient for a read-only lookup");
      await request.tools[0]!.execute({ query: "陈夏" }, new AbortController().signal);
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
