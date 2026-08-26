import { describe, expect, it, vi } from "vitest";

import { OpenRouterAgentProvider } from "./openRouterProvider.js";
import { AGENT_TOOL_NAMES, type AgentProviderRequest } from "./types.js";

const fingerprint = "a".repeat(64);

function request(): AgentProviderRequest {
  return {
    runID: "10000000-0000-4000-8000-000000000099",
    objective: "Determine the smallest safe next step from synthetic evidence.",
    systemPrompt: "Never confirm state or create an external effect.",
    scopeSummary: {
      workspaceID: "10000000-0000-4000-8000-000000000001",
      pursuitID: "10000000-0000-4000-8000-000000000002",
      pursuitRevision: 1,
      evidenceRefs: ["10000000-0000-4000-8000-000000000003"],
    },
    toolManifest: AGENT_TOOL_NAMES,
    budget: {
      maxTurns: 6,
      maxToolCalls: 12,
      maxDurationMs: 60_000,
      maxTaskTokens: 32_000,
      maxEstimatedUsd: 1,
    },
  };
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("OpenRouterAgentProvider", () => {
  it("runs sequential governed tools and returns the exact terminal output", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          id: "generation-1",
          model: "cohere/north-mini-code:free",
          choices: [
            {
              finish_reason: "tool_calls",
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-1",
                    type: "function",
                    function: { name: "read_pursuit", arguments: "{}" },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 11, completion_tokens: 3, cost: 0 },
        }),
      )
      .mockResolvedValueOnce(
        response({
          id: "generation-2",
          model: "cohere/north-mini-code:free",
          choices: [
            {
              finish_reason: "tool_calls",
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call-2",
                    type: "function",
                    function: {
                      name: "record_no_action",
                      arguments: JSON.stringify({
                        reason: "The evidence supports no safe change.",
                        missing_evidence_refs: [],
                      }),
                    },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 17, completion_tokens: 8, cost: "0" },
        }),
      )
      .mockResolvedValueOnce(
        response({
          id: "generation-3",
          model: "cohere/north-mini-code:free",
          choices: [
            {
              finish_reason: "stop",
              message: {
                role: "assistant",
                content: JSON.stringify({
                  outcome: "no_action",
                  candidate_fingerprint: fingerprint,
                }),
              },
            },
          ],
          usage: { prompt_tokens: 19, completion_tokens: 9, cost: 0 },
        }),
      );
    const provider = new OpenRouterAgentProvider({
      apiKey: "test-key",
      model: "cohere/north-mini-code:free",
      fetcher,
    });
    const invokeTool = vi.fn(async (name: string) => ({
      ok: true,
      callID: `result-${name}`,
      name,
      ...(name === "record_no_action"
        ? { candidateFingerprint: fingerprint }
        : { data: { pursuitID: "synthetic" } }),
    }));

    const result = await provider.run(
      request(),
      invokeTool,
      new AbortController().signal,
    );

    expect(invokeTool.mock.calls.map(([name]) => name)).toEqual([
      "read_pursuit",
      "record_no_action",
    ]);
    expect(result.structuredOutput).toEqual({
      outcome: "no_action",
      candidate_fingerprint: fingerprint,
    });
    expect(result).toMatchObject({
      inputTokens: 47,
      outputTokens: 20,
      estimatedUsd: 0,
      turns: 3,
      sessionID: "generation-3",
      terminalReason: "completed",
    });
    const finalBody = JSON.parse(
      String(fetcher.mock.calls[2]?.[1]?.body),
    ) as { tool_choice: string; parallel_tool_calls: boolean };
    expect(finalBody.tool_choice).toBe("none");
    expect(finalBody.parallel_tool_calls).toBe(false);
  });

  it("passes malformed arguments to the governed validator without persisting them", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        model: "cohere/north-mini-code:free",
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call-invalid",
                  type: "function",
                  function: {
                    name: "read_evidence",
                    arguments: "{not-json",
                  },
                },
              ],
            },
          },
        ],
      }),
    );
    const provider = new OpenRouterAgentProvider({
      apiKey: "test-key",
      model: "cohere/north-mini-code:free",
      fetcher,
    });
    const invokeTool = vi.fn(async (name: string) => ({
      ok: false,
      callID: "denied",
      name,
      error: { code: "TOOL_INPUT_INVALID", message: "Invalid input." },
    }));
    const constrained = request();
    constrained.budget.maxTurns = 1;

    const result = await provider.run(
      constrained,
      invokeTool,
      new AbortController().signal,
    );

    expect(invokeTool).toHaveBeenCalledWith("read_evidence", "{not-json");
    expect(result.permissionDenials).toEqual([
      "read_evidence:TOOL_INPUT_INVALID",
    ]);
    expect(result.terminalReason).toBe("max_turns");
  });

  it("fails closed when the provider changes the pinned model", async () => {
    const provider = new OpenRouterAgentProvider({
      apiKey: "test-key",
      model: "cohere/north-mini-code:free",
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        response({
          model: "openrouter/another-model",
          choices: [{ message: { role: "assistant", content: "{}" } }],
        }),
      ),
    });

    await expect(
      provider.run(request(), vi.fn(), new AbortController().signal),
    ).rejects.toThrow("different from the immutable configured model");
  });

  it("reports provider failures without exposing the credential or response body", async () => {
    const provider = new OpenRouterAgentProvider({
      apiKey: "secret-must-not-appear",
      model: "cohere/north-mini-code:free",
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        response(
          {
            error: {
              code: 429,
              message: "echo secret-must-not-appear and private evidence",
            },
          },
          429,
        ),
      ),
    });

    const error = await provider
      .run(request(), vi.fn(), new AbortController().signal)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toContain("429");
    expect(String(error)).not.toContain("secret-must-not-appear");
    expect(String(error)).not.toContain("private evidence");
  });

  it("rejects a dynamic free router and non-HTTPS remote base URL", () => {
    expect(
      () =>
        new OpenRouterAgentProvider({
          apiKey: "test-key",
          model: "openrouter/free",
        }),
    ).toThrow("not a pinned model");
    expect(
      () =>
        new OpenRouterAgentProvider({
          apiKey: "test-key",
          model: "cohere/north-mini-code:free",
          baseUrl: "http://openrouter.example/api/v1",
        }),
    ).toThrow("must use HTTPS");
  });
});
