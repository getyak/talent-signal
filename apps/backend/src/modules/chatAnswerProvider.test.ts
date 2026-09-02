import { describe, expect, it, vi } from "vitest";

import {
  createEnvironmentChatAnswerProvider,
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
