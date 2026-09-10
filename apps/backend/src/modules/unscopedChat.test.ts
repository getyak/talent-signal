import type { UnscopedChatTaskRequest } from "@talent-signal/contracts";
import { describe, expect, it, vi } from "vitest";

import type { RemoteChatAnswerProviding } from "./chatAnswerProvider.js";
import { executeUnscopedChatTask } from "./unscopedChat.js";
import { readAgentSessionConversation } from "./agentSessions.js";
import type { DatabaseClient } from "../database/pool.js";
import type { AuthContext } from "./auth.js";

vi.mock("./agentSessions.js", () => ({ readAgentSessionConversation: vi.fn() }));

const request: UnscopedChatTaskRequest = {
  idempotency_key: "ios:unscoped-chat:fixture",
  objective: "你好",
};

describe("unscoped Agent conversation", () => {
  const auth = { accountId: "account", userId: "user" } as AuthContext;

  it("does not start a second remote SDK call after the admitted run fails", async () => {
    const answer = vi.fn(async () => { throw new Error("CLAUDE_HARNESS_SESSION_INVALIDATED"); });
    const execution = await executeUnscopedChatTask({ request,
      provider: { providerId: "claude-agent-sdk", model: "synthetic", supportsImageInput: false, answer },
    });
    expect(answer).toHaveBeenCalledOnce();
    expect(execution.remoteStatus).toBe("fallback");
    expect(execution.body.external_effects).toEqual([]);
  });

  it("loads canonical same-scope dialogue before answering a follow-up", async () => {
    const messages = [{ message_id: "previous", role: "assistant" as const, text: "1. Call. 2. Draft an email." }];
    vi.mocked(readAgentSessionConversation).mockResolvedValueOnce({ messages });
    const answer = vi.fn(async () => ({ kind: "answer" as const, title: "Email", body: "A suggested draft.", citation_ids: [],
      provider_id: "zhipu-chat-completions" as const, model: "glm-5.3", provider_request_id: null, input_tokens: 0, output_tokens: 0 }));
    const database = { query: vi.fn(async (sql: string) => ({ rows: sql.includes("FROM agent_sessions")
      ? [{ expires_at: new Date(Date.now() + 86_400_000) }] : [] })) } as unknown as DatabaseClient;
    await executeUnscopedChatTask({
      request: { ...request, session_id: "session", message_id: "current", objective: "Expand option two." }, database, auth,
      provider: { providerId: "zhipu-chat-completions", model: "glm-5.3", supportsImageInput: false, answer },
    });
    expect(readAgentSessionConversation).toHaveBeenLastCalledWith(database, auth, "session", { personId: null, relationshipContextId: null });
    expect(answer).toHaveBeenCalledWith(expect.objectContaining({ conversation_history: messages, allowed_citation_ids: [], context_blocks: [] }));
  });

  it("does not turn invalid Session scope into an unrestricted provider fallback", async () => {
    vi.mocked(readAgentSessionConversation).mockRejectedValueOnce(new Error("AGENT_SESSION_SCOPE_CHANGED"));
    const answer = vi.fn();
    await expect(executeUnscopedChatTask({ request: { ...request, session_id: "session" }, database: {} as DatabaseClient, auth,
      provider: { providerId: "zhipu-chat-completions", model: "glm-5.3", supportsImageInput: false, answer },
    })).rejects.toThrow("AGENT_SESSION_SCOPE_CHANGED");
    expect(answer).not.toHaveBeenCalled();
  });

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
      title: "这次未完成",
      body: expect.stringContaining("这次处理未完成"),
      citation_dependency_ids: [],
      requires_user_decision: false,
    });
  });
});
