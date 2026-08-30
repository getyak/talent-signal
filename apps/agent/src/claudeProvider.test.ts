import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  createSdkMcpServer: vi.fn((options: unknown) => options),
  query: vi.fn(),
  tool: vi.fn(
    (
      name: string,
      description: string,
      schema: unknown,
      handler: unknown,
      options: unknown,
    ) => ({ name, description, schema, handler, options }),
  ),
}));

vi.mock("@anthropic-ai/claude-agent-sdk", () => sdk);

import { ClaudeAgentSDKProvider } from "./claudeProvider.js";

const request = {
  runID: "synthetic-run",
  objective: "Record a synthetic review-only result.",
  systemPrompt: "Use only the immutable tool manifest.",
  scopeSummary: {
    kind: "pursuit" as const,
    workspaceID: "synthetic-workspace",
    pursuitID: "synthetic-pursuit",
    pursuitRevision: 1,
    evidenceRefs: ["synthetic-evidence"],
  },
  toolManifest: [
    "read_pursuit",
    "read_evidence",
    "stage_pursuit_proposal",
  ] as const,
  budget: {
    maxTurns: 6,
    maxToolCalls: 12,
    maxDurationMs: 60_000,
    maxTaskTokens: 32_000,
    maxEstimatedUsd: 1,
  },
};

function sdkResult() {
  return {
    type: "result",
    subtype: "success",
    structured_output: {
      outcome: "no_action",
      reason_code: "NO_MATERIAL_CHANGE",
      reason: "Synthetic evidence supports no canonical change.",
      missing_evidence_refs: [],
    },
    modelUsage: {
      synthetic: {
        inputTokens: 10,
        outputTokens: 3,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
    },
    total_cost_usd: 0,
    num_turns: 1,
    permission_denials: [],
    session_id: "synthetic-session",
  };
}

function stream(
  beforeResult?: (queryInput: any) => Promise<void>,
  queryInput?: any,
) {
  return {
    close: vi.fn(),
    async *[Symbol.asyncIterator]() {
      if (beforeResult && queryInput) await beforeResult(queryInput);
      yield sdkResult();
    },
  };
}

describe("ClaudeAgentSDKProvider", () => {
  beforeEach(() => {
    sdk.query.mockReset();
    vi.stubEnv("ANTHROPIC_BASE_URL", "https://compatible-proxy.example/v1");
    vi.stubEnv("TALENT_SIGNAL_CLAUDE_TASK_BUDGET_ENABLED", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("gates every tool in PreToolUse and omits unsupported proxy task budgets", async () => {
    sdk.query.mockImplementation((queryInput: any) =>
      stream(async (input) => {
        const gate = input.options.hooks.PreToolUse[0].hooks[0];
        const allowed = await gate(
          {
            hook_event_name: "PreToolUse",
            tool_name: "mcp__talent_signal__read_evidence",
            tool_input: {},
            tool_use_id: "allowed",
          },
          "allowed",
          { signal: new AbortController().signal },
        );
        expect(allowed.hookSpecificOutput.permissionDecision).toBe("allow");

        const denied = await gate(
          {
            hook_event_name: "PreToolUse",
            tool_name: "Bash",
            tool_input: { command: "printenv" },
            tool_use_id: "denied",
          },
          "denied",
          { signal: new AbortController().signal },
        );
        expect(denied.hookSpecificOutput.permissionDecision).toBe("deny");

      }, queryInput),
    );

    const provider = new ClaudeAgentSDKProvider("claude-synthetic-pinned");
    const invokeTool = vi.fn(async (name: string) => ({
      ok: true,
      callID: "synthetic-call",
      name,
      data: { synthetic: true },
    }));
    const result = await provider.run(
      request,
      invokeTool,
      new AbortController().signal,
    );
    const options = sdk.query.mock.calls[0]![0].options;

    expect(options.canUseTool).toBeUndefined();
    expect(options.outputFormat).toMatchObject({ type: "json_schema" });
    expect(options.taskBudget).toBeUndefined();
    expect(options.allowedTools).toEqual([
      "mcp__talent_signal__read_pursuit",
      "mcp__talent_signal__read_evidence",
      "mcp__talent_signal__stage_pursuit_proposal",
    ]);
    expect(result.structuredOutput).toEqual({
      outcome: "no_action",
      reason_code: "NO_MATERIAL_CHANGE",
      reason: "Synthetic evidence supports no canonical change.",
      missing_evidence_refs: [],
    });
    expect(result.permissionDenials).toContain("Bash:TOOL_NOT_ALLOWED");
  });

  it("keeps the SDK task budget for the official Anthropic endpoint", async () => {
    vi.stubEnv("ANTHROPIC_BASE_URL", "https://api.anthropic.com");
    sdk.query.mockImplementation((queryInput: any) => stream(undefined, queryInput));

    const provider = new ClaudeAgentSDKProvider("claude-synthetic-pinned");
    await provider.run(request, vi.fn(), new AbortController().signal);

    expect(sdk.query.mock.calls[0]![0].options.taskBudget).toEqual({
      total: 32_000,
    });
  });

  it("allows an explicitly compatible custom endpoint to opt in", async () => {
    vi.stubEnv("TALENT_SIGNAL_CLAUDE_TASK_BUDGET_ENABLED", "true");
    sdk.query.mockImplementation((queryInput: any) => stream(undefined, queryInput));

    const provider = new ClaudeAgentSDKProvider("claude-synthetic-pinned");
    await provider.run(request, vi.fn(), new AbortController().signal);

    expect(sdk.query.mock.calls[0]![0].options.taskBudget).toEqual({
      total: 32_000,
    });
  });
});
