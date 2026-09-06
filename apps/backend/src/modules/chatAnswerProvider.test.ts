import { describe, expect, it, vi } from "vitest";
import { bundledPrompt, promptRevision } from "@talent-signal/agent/prompt-registry";

import {
  createEnvironmentChatAnswerProvider,
  configuredAgentPrompt,
  ZhipuChatAnswerProvider,
  type RemoteChatAnswerRequest,
} from "./chatAnswerProvider.js";

const citationID = "00000000-0000-4000-8000-000000000001";

function request(): RemoteChatAnswerRequest {
  return {
    objective: "Prepare the most important question for the next conversation.",
    context_blocks: [
      {
        block_id: "00000000-0000-4000-8000-000000000002",
        block_key: "fact.availability",
        type: "constraint",
        status: "confirmed",
        headline: "Availability is described only as next month.",
        summary: "",
        items: [],
        evidence_fragment_ids: [citationID],
      },
    ],
    allowed_citation_ids: [citationID],
  };
}

function provider(
  content: Record<string, unknown>,
  inspect?: (url: string, init: RequestInit) => void,
) {
  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    inspect?.(String(input), init ?? {});
    return new Response(
      JSON.stringify({
        id: "provider-request-1",
        model: "glm-5.3",
        choices: [{ message: { content: JSON.stringify(content) } }],
        usage: { prompt_tokens: 120, completion_tokens: 45 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  return new ZhipuChatAnswerProvider({
    apiKey: "synthetic-zhipu-key",
    model: "glm-5.3",
    fetcher,
  });
}

describe("Zhipu Chat answer provider", () => {
  it("sends a frozen managed prompt and reports the actual text revision", async () => {
    const text = "Synthetic published prompt: answer naturally in the requested JSON envelope.";
    const snapshot = { ...bundledPrompt("assistant/relationship"), text, revision: promptRevision(text), source: "opik" as const, versionId: "synthetic-version", commit: "12345678", environment: "production" };
    const result = await provider({ kind: "answer", title: "Answer", body: "Available next month.", citation_ids: [citationID] },
      (_url, init) => expect(JSON.parse(init.body as string).messages[0].content).toBe(text))
      .answer({ ...request(), prompt_snapshot: snapshot });
    expect(result.prompt_revision).toBe(snapshot.revision.slice(0, 16));
    expect(result.prompt_snapshot?.versionId).toBe("synthetic-version");
  });
  it("accepts a grounded partial answer with labeled alternatives and a usable draft", async () => {
    const result = await provider({
      kind: "answer",
      title: "A useful next conversation",
      body: "Known: availability is described as next month. Interpretation: timing needs confirmation. Draft: Which date and timezone would work for you? I have not sent this draft.",
      citation_ids: [citationID],
    }).answer({ ...request(), objective: "Explain what we know and draft a follow-up even though the exact date is missing." });
    expect(result.kind).toBe("answer");
    expect(result.citation_ids).toEqual([citationID]);
    expect(result.body).toContain("I have not sent this draft.");
  });

  it("allows the requested question count without forcing a clarification", async () => {
    const questions = Array.from({ length: 6 }, (_, index) => `${index + 1}. Synthetic evidence-grounded question?`).join("\n");
    const result = await provider({
      kind: "question_set", title: "Interview preparation", body: questions, citation_ids: [citationID],
    }).answer({ ...request(), objective: "Prepare six questions based on this context." });
    expect(result.body.split("\n")).toHaveLength(6);
    expect(result.kind).toBe("question_set");
  });

  it("supports general brainstorming and unsent drafts without opening private context", async () => {
    const result = await provider({
      kind: "answer", title: "Outreach options", body: "Option A: a short introduction. Option B: a role-scope question. These are unsent templates.", citation_ids: [],
    }, (_url, init) => {
      const payload = JSON.parse(String(init.body));
      expect(payload.tools).toBeUndefined();
      expect(JSON.parse(payload.messages[1].content)).toMatchObject({ context_blocks: [], allowed_citation_ids: [] });
    }).answer({ mode: "unscoped_conversation", objective: "Draft two general recruiter outreach approaches.", context_blocks: [], allowed_citation_ids: [] });
    expect(result.kind).toBe("answer");
    expect(result.citation_ids).toEqual([]);
  });

  it("keeps less explicit model-directed contact Tool calls serial and bounded", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "provider-tool-1",
            model: "glm-5.3",
            choices: [{
              message: {
                content: null,
                tool_calls: [{
                  id: "call-1",
                  type: "function",
                  function: {
                    name: "contact_workspace",
                    arguments: JSON.stringify({
                      operation: "search",
                      query: "Maya",
                      maximum_results: 4,
                    }),
                  },
                }],
              },
            }],
            usage: { prompt_tokens: 20, completion_tokens: 5 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "provider-tool-2",
            model: "glm-5.3",
            choices: [{
              message: {
                content: JSON.stringify({
                  outcome: "clarification",
                  title: "Which Maya?",
                  body: "Choose one relationship.",
                }),
              },
            }],
            usage: { prompt_tokens: 30, completion_tokens: 10 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    const invokeTool = vi.fn(async () => ({
      ok: true,
      callID: "tool-call-1",
      name: "contact_workspace",
      data: { operation: "search", result_count: 2, results: [] },
    }));

    const result = await new ZhipuChatAnswerProvider({
      apiKey: "synthetic-zhipu-key",
      model: "glm-5.3",
      fetcher: fetcher as typeof fetch,
    }).run(
      {
        runID: "run-model-directed-search",
        objective: "Find Maya in my relationships",
        systemPrompt: "Stay inside the authorized account.",
        scopeSummary: {
          kind: "workspace_conversation",
          workspaceID: "11111111-1111-4111-8111-111111111111",
          sessionID: null,
          currentPersonID: null,
          currentRelationshipContextID: null,
        },
        toolManifest: ["contact_workspace"],
        budget: {
          maxTurns: 4,
          maxToolCalls: 4,
          maxDurationMs: 10_000,
          maxTaskTokens: 4_000,
          maxEstimatedUsd: 1,
        },
      },
      invokeTool,
      new AbortController().signal,
    );

    expect(invokeTool).toHaveBeenCalledWith("contact_workspace", {
      operation: "search",
      query: "Maya",
      maximum_results: 4,
    });
    expect(result).toMatchObject({
      structuredOutput: { outcome: "clarification", title: "Which Maya?" },
      inputTokens: 50,
      outputTokens: 15,
      turns: 2,
    });
    const firstRequest = JSON.parse(
      String(fetcher.mock.calls[0]?.[1]?.body),
    ) as {
      messages: Array<{ role: string; content: string }>;
      parallel_tool_calls: boolean;
    };
    expect(firstRequest.parallel_tool_calls).toBe(false);
    expect(firstRequest.messages[0]?.content).toBe(
      configuredAgentPrompt("Stay inside the authorized account.").text,
    );
  });

  it("returns a reviewable clarification after a deterministic ambiguous lookup", async () => {
    const fetcher = vi.fn();
    const invokeTool = vi.fn(async () => ({
      ok: true,
      callID: "tool-call-1",
      name: "contact_workspace",
      data: {
        operation: "search",
        result_count: 2,
        results: [
          {
            person_id: "22222222-2222-4222-8222-222222222222",
            relationship_contexts: [{
              id: "33333333-3333-4333-8333-333333333333",
            }],
          },
          {
            person_id: "44444444-4444-4444-8444-444444444444",
            relationship_contexts: [{
              id: "55555555-5555-4555-8555-555555555555",
            }],
          },
        ],
      },
    }));
    const result = await new ZhipuChatAnswerProvider({
      apiKey: "synthetic-zhipu-key",
      model: "glm-5.3",
      fetcher: fetcher as typeof fetch,
    }).run(
      {
        runID: "run-1",
        objective: "What changed with Maya?",
        systemPrompt: "Stay inside the authorized account.",
        scopeSummary: {
          kind: "workspace_conversation",
          workspaceID: "11111111-1111-4111-8111-111111111111",
          sessionID: null,
          currentPersonID: null,
          currentRelationshipContextID: null,
        },
        toolManifest: ["contact_workspace"],
        budget: {
          maxTurns: 4,
          maxToolCalls: 4,
          maxDurationMs: 10_000,
          maxTaskTokens: 4_000,
          maxEstimatedUsd: 1,
        },
      },
      invokeTool,
      new AbortController().signal,
    );

    expect(invokeTool).toHaveBeenCalledWith("contact_workspace", {
      operation: "search",
      query: "Maya",
      maximum_results: 4,
    });
    expect(result).toMatchObject({
      structuredOutput: {
        outcome: "clarification",
        title: "Which relationship do you mean?",
      },
      inputTokens: 0,
      outputTokens: 0,
      turns: 0,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("finishes an explicit named lookup after one host-authorized contact read", async () => {
    const personID = "22222222-2222-4222-8222-222222222222";
    const relationshipContextID = "33333333-3333-4333-8333-333333333333";
    const fetcher = vi.fn();
    const invokeTool = vi.fn(async (_name: string, input: unknown) => {
      const operation = (input as { operation?: string }).operation;
      return operation === "search"
        ? {
            ok: true,
            callID: "tool-search",
            name: "contact_workspace",
            data: {
              operation: "search",
              result_count: 1,
              results: [{
                person_id: personID,
                relationship_contexts: [{ id: relationshipContextID }],
              }],
            },
          }
        : {
            ok: true,
            callID: "tool-read",
            name: "contact_workspace",
            data: {
              operation: "read",
              person: { id: personID, display_label: "Maya Chen" },
              relationship_context: {
                id: relationshipContextID,
                display_label: "Executive search",
              },
            },
          };
    });

    const result = await new ZhipuChatAnswerProvider({
      apiKey: "synthetic-zhipu-key",
      model: "glm-5.3",
      fetcher: fetcher as typeof fetch,
    }).run(
      {
        runID: "run-resolved-contact",
        objective: "What changed with Maya?",
        systemPrompt: "Stay inside the authorized account.",
        scopeSummary: {
          kind: "workspace_conversation",
          workspaceID: "11111111-1111-4111-8111-111111111111",
          sessionID: null,
          currentPersonID: null,
          currentRelationshipContextID: null,
        },
        toolManifest: ["contact_workspace"],
        budget: {
          maxTurns: 4,
          maxToolCalls: 4,
          maxDurationMs: 35_000,
          maxTaskTokens: 4_000,
          maxEstimatedUsd: 1,
        },
      },
      invokeTool,
      new AbortController().signal,
    );

    expect(fetcher).not.toHaveBeenCalled();
    expect(invokeTool).toHaveBeenCalledTimes(2);
    expect(invokeTool).toHaveBeenNthCalledWith(1, "contact_workspace", {
      operation: "search",
      query: "Maya",
      maximum_results: 4,
    });
    expect(invokeTool).toHaveBeenNthCalledWith(2, "contact_workspace", {
      operation: "read",
      person_id: personID,
      relationship_context_id: relationshipContextID,
    });
    expect(result).toMatchObject({
      structuredOutput: {
        outcome: "use_contact",
        person_id: personID,
        relationship_context_id: relationshipContextID,
      },
      inputTokens: 0,
      outputTokens: 0,
      turns: 0,
      terminalReason: "completed",
    });
  });

  it("extracts a Chinese named relationship clue without broadening the search", async () => {
    const fetcher = vi.fn();
    const invokeTool = vi.fn(async () => ({
      ok: true,
      callID: "tool-search",
      name: "contact_workspace",
      data: { operation: "search", result_count: 0, results: [] },
    }));

    const result = await new ZhipuChatAnswerProvider({
      apiKey: "synthetic-zhipu-key",
      model: "glm-5.3",
      fetcher: fetcher as typeof fetch,
    }).run(
      {
        runID: "run-chinese-contact",
        objective: "Leila 有什么变化？",
        systemPrompt: "Stay inside the authorized account.",
        scopeSummary: {
          kind: "workspace_conversation",
          workspaceID: "11111111-1111-4111-8111-111111111111",
          sessionID: null,
          currentPersonID: null,
          currentRelationshipContextID: null,
        },
        toolManifest: ["contact_workspace"],
        budget: {
          maxTurns: 4,
          maxToolCalls: 4,
          maxDurationMs: 35_000,
          maxTaskTokens: 4_000,
          maxEstimatedUsd: 1,
        },
      },
      invokeTool,
      new AbortController().signal,
    );

    expect(invokeTool).toHaveBeenCalledWith("contact_workspace", {
      operation: "search",
      query: "Leila",
      maximum_results: 4,
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      structuredOutput: { outcome: "clarification", title: "需要确认关系" },
    });
  });

  it("does not start a workspace contact Run after cancellation", async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    const controller = new AbortController();
    controller.abort(new Error("user cancelled"));

    await expect(
      new ZhipuChatAnswerProvider({
        apiKey: "synthetic-zhipu-key",
        model: "glm-5.3",
        fetcher,
      }).run(
        {
          runID: "cancelled-run",
          objective: "Find Maya",
          systemPrompt: "Stay inside the authorized account.",
          scopeSummary: {
            kind: "workspace_conversation",
            workspaceID: "11111111-1111-4111-8111-111111111111",
            sessionID: null,
            currentPersonID: null,
            currentRelationshipContextID: null,
          },
          toolManifest: ["contact_workspace"],
          budget: {
            maxTurns: 4,
            maxToolCalls: 4,
            maxDurationMs: 10_000,
            maxTaskTokens: 4_000,
            maxEstimatedUsd: 1,
          },
        },
        vi.fn(),
        controller.signal,
      ),
    ).rejects.toThrow("user cancelled");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not read contact context when cancellation arrives during search", async () => {
    const personID = "22222222-2222-4222-8222-222222222222";
    const relationshipContextID = "33333333-3333-4333-8333-333333333333";
    const fetcher = vi.fn();
    const controller = new AbortController();
    const invokeTool = vi.fn(async () => {
      controller.abort(new Error("user cancelled during search"));
      return {
        ok: true,
        callID: "tool-search",
        name: "contact_workspace",
        data: {
          operation: "search",
          result_count: 1,
          results: [{
            person_id: personID,
            relationship_contexts: [{ id: relationshipContextID }],
          }],
        },
      };
    });

    await expect(
      new ZhipuChatAnswerProvider({
        apiKey: "synthetic-zhipu-key",
        model: "glm-5.3",
        fetcher: fetcher as typeof fetch,
      }).run(
        {
          runID: "cancelled-during-contact-search",
          objective: "What changed with Maya?",
          systemPrompt: "Stay inside the authorized account.",
          scopeSummary: {
            kind: "workspace_conversation",
            workspaceID: "11111111-1111-4111-8111-111111111111",
            sessionID: null,
            currentPersonID: null,
            currentRelationshipContextID: null,
          },
          toolManifest: ["contact_workspace"],
          budget: {
            maxTurns: 4,
            maxToolCalls: 4,
            maxDurationMs: 35_000,
            maxTaskTokens: 4_000,
            maxEstimatedUsd: 1,
          },
        },
        invokeTool,
        controller.signal,
      ),
    ).rejects.toThrow("user cancelled during search");
    expect(invokeTool).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns one citation-bound question set without putting the key in the body", async () => {
    const result = await provider(
      {
        kind: "question_set",
        title: "Priority question",
        body: "What exact date does next month mean, and in which timezone?",
        citation_ids: [citationID],
      },
      (url, init) => {
        expect(url).toBe(
          "https://open.bigmodel.cn/api/paas/v4/chat/completions",
        );
        expect(String(init.body)).toContain("fact.availability");
        expect(String(init.body)).not.toContain("synthetic-zhipu-key");
        expect((init.headers as Record<string, string>).authorization).toBe(
          "Bearer synthetic-zhipu-key",
        );
      },
    ).answer(request());

    expect(result).toMatchObject({
      kind: "question_set",
      citation_ids: [citationID],
      provider_id: "zhipu-chat-completions",
      model: "glm-5.3",
      provider_request_id: "provider-request-1",
      input_tokens: 120,
      output_tokens: 45,
    });
  });

  it("rejects citations outside the governed manifest", async () => {
    await expect(
      provider({
        kind: "answer",
        title: "Unsupported claim",
        body: "A claim from another relationship.",
        citation_ids: ["00000000-0000-4000-8000-000000000099"],
      }).answer(request()),
    ).rejects.toThrow("outside the governed manifest");
  });

  it("requires citations for evidence-based answers but permits clarification", async () => {
    await expect(
      provider({
        kind: "answer",
        title: "Answer",
        body: "An uncited answer.",
        citation_ids: [],
      }).answer(request()),
    ).rejects.toThrow("requires a citation");

    await expect(
      provider({
        kind: "clarification",
        title: "Choose one relationship",
        body: "Which active search do you mean?",
        citation_ids: [],
      }).answer(request()),
    ).resolves.toMatchObject({ kind: "clarification", citation_ids: [] });
  });

  it("answers an unscoped greeting without relationship context or citations", async () => {
    const result = await provider(
      {
        kind: "answer",
        title: "你好",
        body: "你好，我在。你想聊什么？",
        citation_ids: [],
      },
      (_url, init) => {
        const body = JSON.parse(String(init.body)) as {
          messages: Array<{ role: string; content: string }>;
        };
        const userPayload = JSON.parse(body.messages[1]!.content) as {
          mode: string;
          context_blocks: unknown[];
          allowed_citation_ids: string[];
        };
        expect(userPayload).toMatchObject({
          mode: "unscoped_conversation",
          context_blocks: [],
          allowed_citation_ids: [],
        });
        expect(body.messages[1]!.content).not.toContain("fact.availability");
      },
    ).answer({
      mode: "unscoped_conversation",
      objective: "你好",
      context_blocks: [],
      allowed_citation_ids: [],
    });

    expect(result).toMatchObject({
      kind: "answer",
      body: "你好，我在。你想聊什么？",
      citation_ids: [],
    });
  });

  it("rejects candidate context at the unscoped conversation boundary", async () => {
    await expect(
      provider({
        kind: "answer",
        title: "Unsafe",
        body: "An answer that should never be requested.",
        citation_ids: [],
      }).answer({
        ...request(),
        mode: "unscoped_conversation",
      }),
    ).rejects.toThrow("cannot receive relationship context");
  });

  it("fails closed on unsupported effect-oriented output", async () => {
    await expect(
      provider({
        kind: "contact_write",
        title: "Created contact",
        body: "The contact was created.",
        citation_ids: [citationID],
      }).answer(request()),
    ).rejects.toThrow("unsupported response kind");
  });

  it("sends governed images only through an explicitly configured vision model", async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = String(init?.body);
      expect(body).toContain('"model":"glm-5.3-flash"');
      expect(body).toContain("data:image/png;base64,aGVsbG8=");
      return new Response(
        JSON.stringify({
          id: "provider-vision-1",
          model: "glm-5.3-flash",
          choices: [{
            message: {
              content: JSON.stringify({
                kind: "answer",
                title: "Attachment reading",
                body: "The screenshot appears to show a scheduling constraint.",
                citation_ids: [],
              }),
            },
          }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    const result = await new ZhipuChatAnswerProvider({
      apiKey: "synthetic-zhipu-key",
      model: "glm-5.3",
      visionModel: "glm-5.3-flash",
      fetcher,
    }).answer({
      ...request(),
      images: [{
        file_name: "conversation.png",
        media_type: "image/png",
        data: new TextEncoder().encode("hello"),
      }],
    });

    expect(result).toMatchObject({
      model: "glm-5.3-flash",
      citation_ids: [],
      provider_request_id: "provider-vision-1",
    });
  });

  it("answers an unscoped greeting without relationship context or citations", async () => {
    const result = await provider(
      {
        kind: "answer",
        title: "你好",
        body: "你好，我在。你想聊什么？",
        citation_ids: [],
      },
      (_url, init) => {
        const body = JSON.parse(String(init.body)) as {
          messages: Array<{ role: string; content: string }>;
        };
        const userPayload = JSON.parse(body.messages[1]!.content) as {
          mode: string;
          context_blocks: unknown[];
          allowed_citation_ids: string[];
        };
        expect(userPayload).toMatchObject({
          mode: "unscoped_conversation",
          context_blocks: [],
          allowed_citation_ids: [],
        });
        expect(body.messages[1]!.content).not.toContain("fact.availability");
      },
    ).answer({
      mode: "unscoped_conversation",
      objective: "你好",
      context_blocks: [],
      allowed_citation_ids: [],
    });

    expect(result).toMatchObject({
      kind: "answer",
      body: "你好，我在。你想聊什么？",
      citation_ids: [],
    });
  });

  it("rejects candidate context at the unscoped conversation boundary", async () => {
    await expect(
      provider({
        kind: "answer",
        title: "Unsafe",
        body: "An answer that should never be requested.",
        citation_ids: [],
      }).answer({
        ...request(),
        mode: "unscoped_conversation",
      }),
    ).rejects.toThrow("cannot receive relationship context");
  });
});

describe("environment Chat provider admission", () => {
  it("stays disabled by default and by the exact false value", () => {
    expect(createEnvironmentChatAnswerProvider({})).toBeNull();
    expect(
      createEnvironmentChatAnswerProvider({
        TALENT_SIGNAL_ALLOW_REMOTE_CHAT_PROCESSING: "false",
      }),
    ).toBeNull();
  });

  it("requires one direct Zhipu credential and pinned model", () => {
    expect(() =>
      createEnvironmentChatAnswerProvider({
        TALENT_SIGNAL_ALLOW_REMOTE_CHAT_PROCESSING: "true",
        TALENT_SIGNAL_CHAT_PROVIDER: "zhipu",
        TALENT_SIGNAL_CHAT_MODEL: "glm-5.3",
      }),
    ).toThrow("ZHIPU_API_KEY");

    expect(() =>
      createEnvironmentChatAnswerProvider({
        TALENT_SIGNAL_ALLOW_REMOTE_CHAT_PROCESSING: "true",
        TALENT_SIGNAL_CHAT_PROVIDER: "zhipu",
        TALENT_SIGNAL_CHAT_MODEL: "glm-latest",
        ZHIPU_API_KEY: "synthetic-key",
      }),
    ).toThrow("explicitly pinned");
  });

  it("requires explicit sensitive-processing admission for vision", () => {
    expect(() =>
      createEnvironmentChatAnswerProvider({
        TALENT_SIGNAL_ALLOW_REMOTE_CHAT_PROCESSING: "true",
        TALENT_SIGNAL_CHAT_PROVIDER: "zhipu",
        TALENT_SIGNAL_CHAT_MODEL: "glm-5.3",
        TALENT_SIGNAL_CHAT_VISION_MODEL: "glm-5.3-flash",
        ZHIPU_API_KEY: "synthetic-key",
      }),
    ).toThrow("ALLOW_SENSITIVE_AI_PROCESSING=true");

    expect(
      createEnvironmentChatAnswerProvider({
        TALENT_SIGNAL_ALLOW_REMOTE_CHAT_PROCESSING: "true",
        TALENT_SIGNAL_ALLOW_SENSITIVE_AI_PROCESSING: "true",
        TALENT_SIGNAL_CHAT_PROVIDER: "zhipu",
        TALENT_SIGNAL_CHAT_MODEL: "glm-5.3",
        TALENT_SIGNAL_CHAT_VISION_MODEL: "glm-5.3-flash",
        ZHIPU_API_KEY: "synthetic-key",
      })?.supportsImageInput,
    ).toBe(true);
  });
});
