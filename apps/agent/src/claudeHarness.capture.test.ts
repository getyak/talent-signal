import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { runClaudeHarness, type ClaudeHarnessRequest } from "./claudeHarness.js";
import { claudeHarnessConfiguration } from "./claudeHarnessConfiguration.js";
import { withProductRunCapture, type ProductRunSpan } from "./productRunCapture.js";

const config = claudeHarnessConfiguration({ ANTHROPIC_API_KEY: "synthetic-secret", TALENT_SIGNAL_AGENT_MODEL: "synthetic-model" });
function request(overrides: Partial<ClaudeHarnessRequest> = {}): ClaudeHarnessRequest {
  return { objective: "Synthetic objective.", systemPrompt: "Synthetic system prompt.",
    tools: [], budget: { maxTurns: 8, maxToolCalls: 10, maxDurationMs: 30_000, maxTaskTokens: 1000, maxEstimatedUsd: 1 },
    assertCurrent: vi.fn(async () => {}), ...overrides };
}
function result(overrides: object = {}) {
  return { type: "result", subtype: "success", result: "Synthetic answer.", is_error: false,
    modelUsage: { synthetic: { inputTokens: 5, outputTokens: 7, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 } },
    total_cost_usd: 0.01, num_turns: 1, session_id: "synthetic-session", permission_denials: [], ...overrides };
}
function collector() {
  const spans: ProductRunSpan[] = [];
  return { spans, sink: { async append(span: ProductRunSpan) { spans.push(span); } } };
}
function assistant(id: string, text: string, usage: { input_tokens: number; output_tokens: number }) {
  return { type: "assistant", message: { id, model: "synthetic-model",
    content: [{ type: "text", text }], usage } };
}
function sdkOf(yielded: () => AsyncGenerator<unknown> | Promise<AsyncGenerator<unknown>>) {
  return ((input: any) => ({ close: vi.fn(), async *[Symbol.asyncIterator]() { yield* await yielded(); } })) as any;
}

describe("Claude harness product-run diagnostics", () => {
  it("captures supplied context and one deduplicated llm span with per-message usage, without an Opik policy", async () => {
    const sdk = sdkOf(async function* () {
      yield assistant("message-one", "partial", { input_tokens: 5, output_tokens: 2 });
      yield assistant("message-one", "partial complete", { input_tokens: 5, output_tokens: 3 });
      yield result();
    });
    const { spans, sink } = collector();
    const outcome = await withProductRunCapture(sink, () => runClaudeHarness(config,
      request({ objective: "Synthetic objective.", systemPrompt: "Synthetic system prompt.", context: "Synthetic scoped context." }),
      new AbortController().signal, sdk, null));
    expect(outcome.text).toBe("Synthetic answer.");
    const context = spans.find(span => span.name === "harness.context.supplied")!;
    expect(context).toMatchObject({ kind: "context", status: "completed" });
    expect(context.input.value).toMatchObject({ objective: "Synthetic objective.", system_prompt: "Synthetic system prompt.",
      context: "Synthetic scoped context." });
    expect(context.output.value).toMatchObject({ model: "synthetic-model" });
    expect(context.metadata).toMatchObject({ excludes: "sdk_or_provider_wire_request" });
    const llm = spans.filter(span => span.kind === "llm");
    expect(llm).toHaveLength(1);
    // Upsert by SDK message ID keeps the last observed frame, not an invented average.
    expect(llm[0]!.name).toBe("harness.sdk.assistant");
    expect(llm[0]!.metadata).toMatchObject({ sdk_message_id: "message-one", model: "synthetic-model",
      usage: { input_tokens: 5, output_tokens: 3, source: "provider" } });
    expect((llm[0]!.output.value as { content: Array<{ text: string }> }).content[0]!.text).toBe("partial complete");
    // Aggregate result usage is never duplicated as another model leaf.
    expect(llm).toHaveLength(1);
    expect(Date.parse(llm[0]!.finished_at)).toBeGreaterThanOrEqual(Date.parse(llm[0]!.started_at));
  });

  it("records a failed tool span for a thrown tool error without leaking prose", async () => {
    const marker = "synthetic-private-tool-prose";
    const input = request({ tools: [{ name: "read_thing", description: "Synthetic read", readOnly: true,
      schema: z.strictObject({ value: z.string() }), execute: async () => { throw new Error(marker); } }] });
    const { spans, sink } = collector();
    // Dispatch through the MCP handler because the synthetic iterator cannot call tools.
    const sdkWithTool = (({ options }: any) => ({ close: vi.fn(), async *[Symbol.asyncIterator]() {
      const handler = options.mcpServers.talent_signal.instance.server._requestHandlers.get("tools/call");
      await handler({ method: "tools/call", params: { name: "read_thing", arguments: { value: "ok" } } },
        { signal: new AbortController().signal }).catch(() => undefined);
      yield result();
    } })) as any;
    await withProductRunCapture(sink, () => runClaudeHarness(config, input, new AbortController().signal, sdkWithTool, null));
    const tool = spans.find(span => span.kind === "tool")!;
    expect(tool).toMatchObject({ name: "read_thing", status: "failed", error: "Operation failed" });
    expect(JSON.stringify(spans)).not.toContain(marker);
  });

  it("finishes a failure diagnostic when execution fails before a model response", async () => {
    const marker = "synthetic-private-provider-prose";
    const sdk = ((_input: any) => ({ close: vi.fn(), async *[Symbol.asyncIterator]() { throw new Error(marker); } })) as any;
    const { spans, sink } = collector();
    await expect(withProductRunCapture(sink, () => runClaudeHarness(config, request(),
      new AbortController().signal, sdk, null))).rejects.toThrow();
    const failure = spans.find(span => span.name === "harness.execution.failure")!;
    expect(failure).toMatchObject({ kind: "context", status: "failed", error: "Operation failed",
      metadata: { phase: "before_model_response" } });
    expect(JSON.stringify(spans)).not.toContain(marker);
    expect(spans.some(span => span.kind === "llm")).toBe(false);
  });

  it("keeps execution unchanged and records nothing when no product sink is installed", async () => {
    const sdk = sdkOf(async function* () { yield assistant("message-one", "answer", { input_tokens: 5, output_tokens: 7 }); yield result(); });
    const outcome = await runClaudeHarness(config, request(), new AbortController().signal, sdk, null);
    expect(outcome.text).toBe("Synthetic answer.");
    expect(outcome.modelResponses).toBe(1);
  });

  it("never records credential values or raw image bytes", async () => {
    const imageMarker = "synthetic-image-payload-marker";
    const bytes = Buffer.from(imageMarker);
    const image = { kind: "image" as const, artifactID: "source-image", mimeType: "image/png" as const,
      byteSize: bytes.length, contentHash: createHash("sha256").update(bytes).digest("hex"), dataBase64: bytes.toString("base64") };
    const sdk = sdkOf(async function* () {
      yield { type: "assistant", message: { id: "message-one", model: "synthetic-model",
        content: [{ type: "image", dataBase64: imageMarker, source: { type: "base64", data: imageMarker } }],
        usage: { input_tokens: 5, output_tokens: 3 } } };
      yield result();
    });
    const { spans, sink } = collector();
    await withProductRunCapture(sink, () => runClaudeHarness(config,
      request({ systemPrompt: "Synthetic system prompt containing synthetic-secret.", images: [image] }),
      new AbortController().signal, sdk, null));
    const serialized = JSON.stringify(spans);
    expect(serialized).not.toContain("synthetic-secret");
    expect(serialized).not.toContain(imageMarker);
    expect(serialized).not.toContain(image.dataBase64);
    const context = spans.find(span => span.name === "harness.context.supplied")!;
    expect(JSON.stringify(context.input)).toContain("[credential removed]");
    expect((context.input.value as { images: unknown[] }).images).toEqual([
      { kind: "image", mime_type: "image/png", byte_size: bytes.length, content_hash: image.contentHash }]);
  });
});
