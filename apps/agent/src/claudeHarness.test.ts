import { createHash } from "node:crypto";
import { access } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { runClaudeHarness, claudeHarnessInterruptionCode, type ClaudeHarnessRequest } from "./claudeHarness.js";
import { claudeHarnessConfiguration, claudeHarnessConfigurationReceipt } from "./claudeHarnessConfiguration.js";

const config = claudeHarnessConfiguration({ ANTHROPIC_API_KEY: "synthetic-secret", TALENT_SIGNAL_AGENT_MODEL: "synthetic-model" });
const request = (): ClaudeHarnessRequest => ({
  objective: "今天有点累，先陪我聊两句。", systemPrompt: "Synthetic test. Speak naturally.",
  tools: [], budget: { maxTurns: 8, maxToolCalls: 10, maxDurationMs: 30_000, maxTaskTokens: 1000, maxEstimatedUsd: 1 },
  assertCurrent: vi.fn(async () => {}),
});
function result(overrides: object = {}) {
  return { type: "result", subtype: "success", result: "可以，慢慢说，我在听。", is_error: false,
    modelUsage: { synthetic: { inputTokens: 10, outputTokens: 20, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 } },
    total_cost_usd: 0.01, num_turns: 1, session_id: "synthetic-session", permission_denials: [], ...overrides };
}
function queryMock(before?: (input: any) => Promise<void>, terminal = result()) {
  const close = vi.fn();
  const run = vi.fn((input: any) => ({ close, async *[Symbol.asyncIterator]() {
    await before?.(input); yield terminal;
  } }));
  return { run, close };
}

describe("Claude harness deployment configuration", () => {
  it("keeps first SDK event timings and numeric retry evidence on interruption", async () => {
    const base=Date.now();let now=base;
    const clock=vi.spyOn(Date,"now").mockImplementation(()=>now);
    const sdk=vi.fn(()=>({close:vi.fn(),async *[Symbol.asyncIterator](){
      now=base+100;yield {type:"system",subtype:"init",session_id:"synthetic"};
      now=base+120;yield {type:"system",subtype:"api_retry",attempt:1,max_retries:3,retry_delay_ms:200,error_status:429,error:"PRIVATE_VENDOR_TEXT"};
      now=base+150;yield {type:"system",subtype:"init",session_id:"synthetic"};
      now=base+200;yield {type:"assistant",message:{id:"response-one",model:"synthetic",usage:{input_tokens:10,output_tokens:3}}};
      now=base+250;yield {type:"assistant",message:{id:"response-one",model:"synthetic",usage:{input_tokens:10,output_tokens:3}}};
      throw new Error("Synthetic transport failure");
    }}));
    try {
      await expect(runClaudeHarness(config,request(),new AbortController().signal,sdk as any)).rejects.toMatchObject({receipt:{
        sdkTiming:{initializedAfterMs:100,firstModelResponseAfterMs:200},
        apiRetries:[{afterMs:120,attempt:1,maxRetries:3,delayMs:200,httpStatus:429}],modelResponses:1,
      }});
    } finally {clock.mockRestore();}
  });
  it("admits only an explicit proxy and keeps its address out of diagnostics", async () => {
    const base = { ANTHROPIC_API_KEY: "synthetic-key", TALENT_SIGNAL_AGENT_MODEL: "synthetic-model" };
    expect(claudeHarnessConfiguration({ ...base, HTTPS_PROXY: "http://ambient.invalid:8080" }).httpsProxy).toBeUndefined();
    const configured = claudeHarnessConfiguration({ ...base, TALENT_SIGNAL_CLAUDE_HTTPS_PROXY: "http://127.0.0.1:18080" });
    expect(Object.isFrozen(configured)).toBe(true);
    const diagnostic = JSON.stringify(claudeHarnessConfigurationReceipt(configured));
    expect(diagnostic).toContain("explicit_https_proxy");
    expect(diagnostic).not.toContain("18080");
    for (const proxy of ["socks5://localhost:8080", "http://user:secret@localhost:8080", "http://localhost/path", "http://localhost?token=secret", "http://localhost/#fragment", "http://local\nhost:8080"]) {
      expect(() => claudeHarnessConfiguration({ ...base, TALENT_SIGNAL_CLAUDE_HTTPS_PROXY: proxy })).toThrow("CLAUDE_HARNESS_PROXY_INVALID");
    }
    const sdk = queryMock(async ({ options }) => {
      expect(options.env.HTTPS_PROXY).toBe("http://127.0.0.1:18080/");
      expect(options.env.ALL_PROXY).toBeUndefined();
      expect(options.env.NO_PROXY).toBeUndefined();
      expect(options.env.NODE_TLS_REJECT_UNAUTHORIZED).toBeUndefined();
    });
    await runClaudeHarness(configured, request(), new AbortController().signal, sdk.run as any);
  });
  it("binds a single credential to an admitted endpoint without host fallback", () => {
    const configured = claudeHarnessConfiguration({ HAO_ANTHROPIC_API_KEY: "synthetic-hao", ANTHROPIC_API_KEY:"different-gateway", ANTHROPIC_BASE_URL: "https://api.hao.ai/anthropic/", TALENT_SIGNAL_AGENT_MODEL: "anthropic/claude-sonnet-5.0" });
    expect(configured.taskBudgetEnabled).toBe(false);
    expect(claudeHarnessConfigurationReceipt(configured)).toMatchObject({ endpoint: "https://api.hao.ai/anthropic", automaticFallback: false });
    expect(JSON.stringify(claudeHarnessConfigurationReceipt(configured))).not.toContain("synthetic-hao");
    expect(configured.credential.value).toBe("synthetic-hao");
    expect(() => claudeHarnessConfiguration({ANTHROPIC_API_KEY:"different-gateway",ANTHROPIC_BASE_URL:"https://api.hao.ai/anthropic",TALENT_SIGNAL_AGENT_MODEL:"synthetic"})).toThrow("CREDENTIAL_AMBIGUOUS_OR_MISSING");
    for (const endpoint of ["http://api.hao.ai/anthropic", "https://api.hao.ai.evil.example/anthropic", "https://secret@api.hao.ai/anthropic", "https://api.hao.ai/anthropic?key=secret", "https://127.0.0.1/", "https://api.hao.ai:444/anthropic"]) {
      expect(() => claudeHarnessConfiguration({ ANTHROPIC_API_KEY: "synthetic", ANTHROPIC_BASE_URL: endpoint, TALENT_SIGNAL_AGENT_MODEL: "synthetic" })).toThrow("ENDPOINT_NOT_ADMITTED");
    }
    expect(() => claudeHarnessConfiguration({ ANTHROPIC_API_KEY: "a", ANTHROPIC_AUTH_TOKEN: "b", TALENT_SIGNAL_AGENT_MODEL: "synthetic" })).toThrow("CREDENTIAL_AMBIGUOUS_OR_MISSING");
    expect(() => claudeHarnessConfiguration({ CLAUDE_CODE_OAUTH_TOKEN: "ambient", TALENT_SIGNAL_AGENT_MODEL: "synthetic" })).toThrow("CREDENTIAL_AMBIGUOUS_OR_MISSING");
  });
});

describe("SDK-owned harness", () => {
  it("emits provisional main-session text before completion, without tool arguments or duplicate final prose", async () => {
    const chunks: string[] = [];
    const sdk = (({options}: any) => ({close: vi.fn(), async *[Symbol.asyncIterator]() {
      expect(options.includePartialMessages).toBe(true);
      yield {type:"stream_event",parent_tool_use_id:null,event:{type:"content_block_delta",delta:{type:"text_delta",text:"Hello"}}};
      expect(chunks).toEqual(["Hello"]);
      yield {type:"stream_event",parent_tool_use_id:null,event:{type:"content_block_delta",delta:{type:"input_json_delta",partial_json:"private arguments"}}};
      yield {type:"stream_event",parent_tool_use_id:"child",event:{type:"content_block_delta",delta:{type:"text_delta",text:"private subagent"}}};
      yield result({result:"Hello"});
    }}));
    const outcome=await runClaudeHarness(config,{...request(),onText:text=>chunks.push(text)},new AbortController().signal,sdk as any);
    expect(outcome.text).toBe("Hello"); expect(chunks).toEqual(["Hello"]);
  });

  it("stops provisional text when source authority is revoked before a delta", async () => {
    const input=request(),onText=vi.fn();
    const sdk=(()=>({close:vi.fn(),async *[Symbol.asyncIterator](){
      input.assertCurrent=async()=>{throw new Error("SOURCE_REVOKED");};
      yield {type:"stream_event",parent_tool_use_id:null,event:{type:"content_block_delta",delta:{type:"text_delta",text:"stale"}}};
      yield result();
    }}));
    input.onText=onText;
    await expect(runClaudeHarness(config,input,new AbortController().signal,sdk as any)).rejects.toThrow();
    expect(onText).not.toHaveBeenCalled();
  });

  it("returns natural text, isolates subprocess configuration and cleans temporary files", async () => {
    const sdk = queryMock(async ({ options }) => {
      expect(options.outputFormat).toBeUndefined();
      expect(options.env.ANTHROPIC_API_KEY).toBe("synthetic-secret");
      expect(options.env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
      expect(options.env.ZHIPU_API_KEY).toBeUndefined();
      expect(options.env.HOME).toBe(options.cwd);
      expect(options.settingSources).toEqual([]);
      expect(options.persistSession).toBe(false);
      expect(options.fallbackModel).toBeUndefined();
      await access(options.cwd);
    });
    const outcome = await runClaudeHarness(config, request(), new AbortController().signal, sdk.run as any);
    expect(outcome.text).toBe("可以，慢慢说，我在听。");
    expect(outcome.structuredOutput).toBeNull();
    expect(outcome.inputTokens).toBe(10);
    expect(sdk.close).toHaveBeenCalledOnce();
    await expect(access(sdk.run.mock.calls[0]![0].options.cwd)).rejects.toThrow();
  });

  it("delivers original image bytes to the main agent and rejects tampering before spawn", async () => {
    const bytes = Buffer.from("synthetic-image-payload");
    const item = { kind: "image" as const, artifactID: "source-image", mimeType: "image/png", byteSize: bytes.length,
      contentHash: createHash("sha256").update(bytes).digest("hex"), dataBase64: bytes.toString("base64") };
    const sdk = queryMock(async ({ prompt }) => {
      const messages = []; for await (const message of prompt) messages.push(message);
      expect(messages[0].message.content).toContainEqual({ type: "image", source: { type: "base64", media_type: "image/png", data: item.dataBase64 } });
    });
    await runClaudeHarness(config, { ...request(), images: [item] }, new AbortController().signal, sdk.run as any);
    sdk.run.mockClear();
    await expect(runClaudeHarness(config, { ...request(), images: [{ ...item, contentHash: "0".repeat(64) }] }, new AbortController().signal, sdk.run as any)).rejects.toThrow("IMAGE_INTEGRITY");
    expect(sdk.run).not.toHaveBeenCalled();
  });

  it("checks current authority for allowed tools and rejects subagent escalation", async () => {
    const input = request();
    input.tools = [{ name: "read_memory", description: "Scoped memory", schema: z.object({}), readOnly: true,
      execute: async () => ({ content: [{ type: "text", text: "synthetic" }] }) }];
    input.subagents = [{ name: "researcher", description: "Research", instructions: "Read only", tools: ["read_memory"] }];
    const sdk = queryMock(async ({ options }) => {
      const gate = options.hooks.PreToolUse[0].hooks[0];
      const call = (name: string, extras = {}) => gate({ hook_event_name: "PreToolUse", tool_name: name, tool_input: {}, ...extras });
      expect((await call("mcp__talent_signal__read_memory")).hookSpecificOutput.permissionDecision).toBe("allow");
      expect((await call("Bash")).hookSpecificOutput.permissionDecision).toBe("deny");
      expect((await call("Agent", { tool_input: { subagent_type: "unknown" } })).hookSpecificOutput.permissionDecision).toBe("deny");
      expect((await call("Agent", { agent_id: "child", agent_type: "researcher", tool_input: { subagent_type: "researcher" } })).hookSpecificOutput.permissionDecision).toBe("deny");
      expect((await call("mcp__talent_signal__read_memory", { agent_id: "child", agent_type: "unknown" })).hookSpecificOutput.permissionDecision).toBe("deny");
    });
    const outcome = await runClaudeHarness(config, input, new AbortController().signal, sdk.run as any);
    expect(outcome.permissionDenials).toHaveLength(4);
    expect(input.assertCurrent).toHaveBeenCalled();
    input.tools = [{ ...input.tools[0]!, readOnly: false }];
    await expect(runClaudeHarness(config, input, new AbortController().signal, sdk.run as any)).rejects.toThrow("SUBAGENT_TOOL_NOT_READ_ONLY");
  });

  it("does not publish a late result after revocation and cleans failure artifacts", async () => {
    const input = request();
    let revoked = false;
    input.assertCurrent = async () => { if (revoked) throw new Error("SOURCE_REVOKED"); };
    input.onText = vi.fn();
    const sdk = queryMock(async () => { revoked = true; });
    await expect(runClaudeHarness(config, input, new AbortController().signal, sdk.run as any)).rejects.toThrow("SOURCE_REVOKED");
    expect(input.onText).not.toHaveBeenCalled();
    await expect(access(sdk.run.mock.calls[0]![0].options.cwd)).rejects.toThrow();
  });

  it("maps only finite internal error codes without exposing external uppercase text", () => {
    expect(claudeHarnessInterruptionCode(new Error("SYNTHETIC_PRIVATE_CANDIDATE_NAME"))).toBe("CLAUDE_HARNESS_RUN_INTERRUPTED");
    expect(claudeHarnessInterruptionCode(new Error("WORKSPACE_CONVERSATION_TIMEOUT"))).toBe("WORKSPACE_CONVERSATION_TIMEOUT");
    expect(claudeHarnessInterruptionCode(Object.assign(new Error("private prose"), { code: "HARNESS_SOURCE_CHANGED" }))).toBe("HARNESS_SOURCE_CHANGED");
  });

  it("preserves unique observed token counts without inventing interrupted cost or turns", async () => {
    const run = vi.fn(() => ({ close: vi.fn(), async *[Symbol.asyncIterator]() {
      const message = { type: "assistant", session_id: "synthetic-partial-session", message: {
        id: "assistant-1", model: "synthetic-model", content: [], usage: {
          input_tokens: 10, output_tokens: 3, cache_read_input_tokens: 7, cache_creation_input_tokens: 2,
        },
      } };
      yield message; yield message;
      throw new Error("transport detail containing private provider data");
    } }));
    await expect(runClaudeHarness(config, request(), new AbortController().signal, run as any)).rejects.toMatchObject({
      name: "ClaudeHarnessInterruption", message: "CLAUDE_HARNESS_RUN_INTERRUPTED", receipt: {
        sessionID: "synthetic-partial-session", inputTokens: 19, outputTokens: 3, estimatedUsd: null,
        turns: null, modelResponses: 1, usageComplete: false,
      },
    });
    const empty = vi.fn(() => ({ close: vi.fn(), async *[Symbol.asyncIterator]() { throw new Error("transport data"); } }));
    await expect(runClaudeHarness(config, request(), new AbortController().signal, empty as any)).rejects.toMatchObject({
      receipt: { inputTokens: null, outputTokens: null, estimatedUsd: null, modelResponses: 0,
        sdkTiming:{initializedAfterMs:null,firstModelResponseAfterMs:null},apiRetries:[] },
    });
  });

  it("cancellation and failed/budget results never become successful answers", async () => {
    const controller = new AbortController();
    const sdk = queryMock(async () => controller.abort(new Error("USER_CANCELLED")));
    await expect(runClaudeHarness(config, request(), controller.signal, sdk.run as any)).rejects.toThrow("USER_CANCELLED");
    const failed = queryMock(undefined, result({ subtype: "error_max_turns" }));
    await expect(runClaudeHarness(config, request(), new AbortController().signal, failed.run as any)).rejects.toThrow("ERROR_MAX_TURNS");
    await expect(runClaudeHarness(config, request(), new AbortController().signal, failed.run as any)).rejects.toMatchObject({
      name: "ClaudeHarnessFailure", receipt: { inputTokens: 10, outputTokens: 20, estimatedUsd: 0.01, terminalReason: "max_turns" },
    });
    const overBudget = queryMock(undefined, result({ modelUsage: { synthetic: { inputTokens: 1200, outputTokens: 1, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 } } }));
    await expect(runClaudeHarness(config, request(), new AbortController().signal, overBudget.run as any)).rejects.toThrow("TOKEN_BUDGET_EXHAUSTED");
  });
});
