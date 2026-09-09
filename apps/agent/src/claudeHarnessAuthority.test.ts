import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
const handlers = vi.hoisted(() => new Map<string, (input: unknown) => Promise<unknown>>());
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  createSdkMcpServer: (options: unknown) => options,
  tool: (name: string, _description: string, _schema: unknown, handler: (input: unknown) => Promise<unknown>) => {
    handlers.set(name, handler); return { name };
  },
  query: vi.fn(),
}));
import { runClaudeHarness, type ClaudeHarnessRequest } from "./claudeHarness.js";
import { claudeHarnessConfiguration } from "./claudeHarnessConfiguration.js";

const configuration = claudeHarnessConfiguration({ ANTHROPIC_API_KEY: "synthetic", TALENT_SIGNAL_AGENT_MODEL: "synthetic" });
const request = (): ClaudeHarnessRequest => ({ objective: "Synthetic", systemPrompt: "Synthetic",
  tools: [], budget: { maxTurns: 6, maxToolCalls: 6, maxTaskTokens: 1000, maxDurationMs: 10000, maxEstimatedUsd: 1 },
  assertCurrent: async () => {} });

describe("in-flight harness authority", () => {
  it("does not start the SDK when the compiled source admission has changed", async () => {
    const sdk = vi.fn();
    await expect(runClaudeHarness(configuration, { ...request(), assertCurrent: async () => { throw new Error("SOURCE_REVOKED"); } },
      new AbortController().signal, sdk as any)).rejects.toThrow("SOURCE_REVOKED");
    expect(sdk).not.toHaveBeenCalled();
  });

  it("withholds a read result revoked while its tool was in flight", async () => {
    let revoked = false;
    const input = { ...request(), assertCurrent: async () => { if (revoked) throw new Error("SOURCE_REVOKED"); },
      tools: [{ name: "read_memory", description: "Read", schema: z.object({}), readOnly: true,
        execute: async () => { revoked = true; return { content: [{ type: "text" as const, text: "Sensitive synthetic source" }] }; } }] };
    const received = vi.fn();
    const sdk = vi.fn(() => ({ close: vi.fn(), async *[Symbol.asyncIterator]() {
      received(await handlers.get("read_memory")!({}));
    } }));
    await expect(runClaudeHarness(configuration, input, new AbortController().signal, sdk as any)).rejects.toThrow("SOURCE_REVOKED");
    expect(received).not.toHaveBeenCalled();
  });

  it("blocks a write if cancellation happens while awaiting its authority check", async () => {
    const controller = new AbortController();
    const execute = vi.fn(async () => ({ content: [{ type: "text" as const, text: "success" }] }));
    let checks = 0;
    const input = { ...request(), tools: [{ name: "save_draft", description: "Save", schema: z.object({}), readOnly: false, execute }],
      assertCurrent: async () => { if (++checks === 2) controller.abort(new Error("USER_CANCELLED")); } };
    const sdk = vi.fn(() => ({ close: vi.fn(), async *[Symbol.asyncIterator]() {
      await handlers.get("save_draft")!({});
    } }));
    await expect(runClaudeHarness(configuration, input, controller.signal, sdk as any)).rejects.toThrow("USER_CANCELLED");
    expect(execute).not.toHaveBeenCalled();
  });

  it("halts before the next write when intermediate usage exceeds a gateway budget", async () => {
    const execute = vi.fn(async () => ({ content: [{ type: "text" as const, text: "success" }] }));
    const input = { ...request(), tools: [{ name: "save_draft", description: "Save", schema: z.object({}), readOnly: false, execute }] };
    const sdk = vi.fn(() => ({ close: vi.fn(), async *[Symbol.asyncIterator]() {
      try {
        yield { type: "assistant", message: { id: "assistant-1", usage: { input_tokens: 1000, output_tokens: 1 } } };
        await handlers.get("save_draft")!({});
      } finally {
        // Even a concurrent IPC callback arriving while shutdown starts is denied.
        await expect(handlers.get("save_draft")!({})).rejects.toThrow("TOKEN_BUDGET_EXHAUSTED");
      }
    } }));
    await expect(runClaudeHarness({ ...configuration, taskBudgetEnabled: false }, input, new AbortController().signal, sdk as any)).rejects.toThrow("TOKEN_BUDGET_EXHAUSTED");
    expect(execute).not.toHaveBeenCalled();
  });
});
