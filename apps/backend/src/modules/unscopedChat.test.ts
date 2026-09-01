import type { UnscopedChatTaskRequest } from "@talent-signal/contracts";
import { describe, expect, it, vi } from "vitest";

import type { RemoteChatAnswerProviding } from "./chatAnswerProvider.js";
import { executeUnscopedChatTask } from "./unscopedChat.js";

const request: UnscopedChatTaskRequest = {
  idempotency_key: "ios:unscoped-chat:fixture",
  objective: "你好",
};

describe("unscoped Agent conversation", () => {
  it("sends only the submitted text and returns no evidence or effects", async () => {
    const answer = vi.fn(async () => ({
      kind: "answer" as const,
      title: "你好",
      body: "你好，我在。你想聊什么？",
      citation_ids: [],
      provider_id: "zhipu-chat-completions" as const,
      model: "glm-5.3",
      provider_request_id: "provider-request-1",
      input_tokens: 10,
      output_tokens: 8,
    }));
    const provider: RemoteChatAnswerProviding = {
      providerId: "zhipu-chat-completions",
      model: "glm-5.3",
      supportsImageInput: false,
      answer,
    };

    const execution = await executeUnscopedChatTask({
      request,
      provider,
      createdAt: new Date("2026-09-02T00:00:00.000Z"),
    });

    expect(answer).toHaveBeenCalledWith({
      mode: "unscoped_conversation",
      objective: "你好",
      context_blocks: [],
      allowed_citation_ids: [],
      images: [],
    });
    expect(execution).toMatchObject({
      remoteStatus: "completed",
      body: {
        disposition: "answer",
        external_effects: [],
        blocks: [
          {
            kind: "answer",
            body: "你好，我在。你想聊什么？",
            citation_dependency_ids: [],
            requires_user_decision: false,
          },
        ],
      },
    });
  });

  it("returns a truthful local reply when the remote provider fails", async () => {
    const execution = await executeUnscopedChatTask({
      request,
      provider: {
        providerId: "zhipu-chat-completions",
        model: "glm-5.3",
        supportsImageInput: false,
        answer: async () => {
          throw new Error("provider unavailable");
        },
      },
    });

    expect(execution.remoteStatus).toBe("fallback");
    expect(execution.body.external_effects).toEqual([]);
    expect(execution.body.blocks[0]).toMatchObject({
      kind: "answer",
      title: "Agent · 本地回复",
      citation_dependency_ids: [],
      requires_user_decision: false,
    });
  });
});
