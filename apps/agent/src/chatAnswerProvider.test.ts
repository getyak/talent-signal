import { describe, expect, it, vi } from "vitest";
import { ZhipuChatAnswerProvider } from "./chatAnswerProvider.js";
import type { AgentToolResult } from "./types.js";
import { bundledPrompt } from "./promptRegistry.js";

async function runQuestion(objective: string) {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({
    model: "glm-5.3",
    choices: [{ message: { content: JSON.stringify({ outcome: "reply", title: "Reply", body: "No contact selected." }) } }],
  }));
  const invokeTool = vi.fn(async (): Promise<AgentToolResult> => ({
    ok: true, callID: "synthetic-search", name: "contact_workspace", data: { operation: "search", results: [] },
  }));
  const provider = new ZhipuChatAnswerProvider({ apiKey: "synthetic-only", model: "glm-5.3", observer: null, fetcher });
  const result = await provider.run({
    runID: "synthetic-named-clue", objective, systemPrompt: "Stay within the current scope.",
    scopeSummary: { kind: "workspace_conversation", workspaceID: "synthetic-workspace", sessionID: null,
      currentPersonID: null, currentRelationshipContextID: null },
    toolManifest: ["contact_workspace"],
    budget: { maxTurns: 1, maxToolCalls: 1, maxDurationMs: 10000, maxTaskTokens: 4000, maxEstimatedUsd: 1 },
  }, invokeTool, new AbortController().signal);
  return { result, invokeTool, fetcher };
}

describe("named relationship question preflight", () => {
  it.each([
    ["What changed with Maya?", "Maya"],
    [" \tWHAT\thas  changed\twith  Leila Noor! \t", "Leila Noor"],
    ["What do we know about Jean-Luc?", "Jean-Luc"],
    ["What changed with 玛雅？", "玛雅？"],
    ["Leila 有什么变化？", "Leila"],
    [" 玛雅发生了什么变化！ ", "玛雅"],
    ["陈明现在怎么样", "陈明"],
    ["陈明  目前怎么样。", "陈明"],
    [`What changed with ${"a".repeat(200)}?`, "a".repeat(200)],
  ])("extracts one exact clue from %s", async (objective, clue) => {
    const { result, invokeTool, fetcher } = await runQuestion(objective);
    expect(invokeTool).toHaveBeenCalledExactlyOnceWith("contact_workspace", { operation: "search", query: clue, maximum_results: 4 });
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.structuredOutput).toMatchObject({ outcome: "clarification" });
  });

  it.each([
    "What changed with *?", "What changed with Maya%?", "所有人有什么变化？", "What changed with all contacts?",
    "What changed with them?", "What changed with a?", "What changed with Leila\nNoor?",
    "What changed without Maya?", "Something changed with Maya?", `What changed with ${"a".repeat(201)}?`,
  ])("does not authorize a shortcut search for %s", async (objective) => {
    const { result, invokeTool, fetcher } = await runQuestion(objective);
    expect(invokeTool).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(result.structuredOutput).toMatchObject({ outcome: "reply" });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).messages[1].content).toContain(objective.replaceAll("\n", "\\n"));
  });

  it("bounds the shortcut on adversarial whitespace without truncating it into a contact clue", async () => {
    for (const objective of [
      `what\tchanged\twith\t${"\t".repeat(250_000)}a`,
      `what\tdo\twe\tknow\tabout\ta${"\t".repeat(250_000)}x`,
      `a有什么变化${"\t".repeat(250_000)}x`,
    ]) {
      const { invokeTool, fetcher } = await runQuestion(objective);
      expect(invokeTool).not.toHaveBeenCalled();
      expect(fetcher).toHaveBeenCalledOnce();
      const sent = JSON.parse(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).messages[1].content);
      expect(sent.objective).toBe(objective);
    }
  });
});

describe("structured Session title transport", () => {
  it("accepts 32 compound graphemes within the 256-code-point cap", async () => {
    const title = "👩‍👩‍👧‍👦".repeat(32);
    expect(Array.from(title)).toHaveLength(224);
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({
      model: "glm-5.3",
      choices: [{ message: { content: JSON.stringify({
        kind: "answer",
        title: "Reply",
        session_title: title,
        body: "Visible reply",
        citation_ids: [],
      }) } }],
    }));
    const provider = new ZhipuChatAnswerProvider({
      apiKey: "synthetic-only",
      model: "glm-5.3",
      observer: null,
      fetcher,
    });
    const result = await provider.answer({
      objective: "Summarize the conversation",
      mode: "unscoped_conversation",
      session_title_requested: true,
      prompt_snapshot: bundledPrompt("assistant/conversation"),
      context_blocks: [],
      allowed_citation_ids: [],
    });
    expect(result.session_title).toBe(title);
    expect(result.title).toBe("Reply");
  });
});
