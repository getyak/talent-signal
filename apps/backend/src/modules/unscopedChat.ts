import { createHash, randomUUID } from "node:crypto";

import {
  CONTRACT_VERSION,
  type ChatResponseBlock,
  type UnscopedChatTaskRequest,
  type UnscopedChatTaskResponse,
} from "@talent-signal/contracts";
import type { Pool } from "pg";

import { inTransaction } from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import { appendAudit } from "../lib/audit.js";
import {
  claimIdempotency,
  completeIdempotency,
} from "../lib/idempotency.js";
import type { AuthContext } from "./auth.js";
import type {
  RemoteChatAnswerProviding,
  RemoteChatAnswerResult,
} from "./chatAnswerProvider.js";

export interface UnscopedChatTaskMutationResult {
  body: UnscopedChatTaskResponse;
  replayed: boolean;
  status: number;
}

interface UnscopedChatExecution {
  body: UnscopedChatTaskResponse;
  remoteStatus: "completed" | "disabled" | "fallback";
  providerResult: RemoteChatAnswerResult | null;
}

function responseBlock(answer: RemoteChatAnswerResult): ChatResponseBlock {
  return {
    id: randomUUID(),
    kind: answer.kind,
    title: answer.title.slice(0, 240),
    body: answer.body,
    status: answer.kind === "clarification" ? "needs_review" : "informational",
    citation_dependency_ids: [],
    requires_user_decision: answer.kind === "clarification",
  };
}

function localFallbackBlock(
  objective: string,
  remoteFailed: boolean,
): ChatResponseBlock {
  const usesChinese = /\p{Script=Han}/u.test(objective);
  return {
    id: randomUUID(),
    kind: "answer",
    title: remoteFailed
      ? usesChinese ? "本地回复" : "Local reply"
      : usesChinese ? "你好" : "Hello",
    body: usesChinese
      ? "你好，我在。你可以直接和我聊，或者告诉我想回顾哪段关系；涉及联系人资料或发送操作时，我会先请你确认范围和最终效果。"
      : "Hello, I’m here. You can chat directly or tell me which relationship you want to revisit. I’ll ask you to confirm the scope and exact effect before using contact data or sending anything.",
    status: "informational",
    citation_dependency_ids: [],
    requires_user_decision: false,
  };
}

export async function executeUnscopedChatTask(input: {
  request: UnscopedChatTaskRequest;
  provider: RemoteChatAnswerProviding | null;
  createdAt?: Date;
}): Promise<UnscopedChatExecution> {
  let providerResult: RemoteChatAnswerResult | null = null;
  let remoteStatus: UnscopedChatExecution["remoteStatus"] = input.provider
    ? "fallback"
    : "disabled";
  let block: ChatResponseBlock;
  if (input.provider) {
    try {
      providerResult = await input.provider.answer({
        mode: "unscoped_conversation",
        objective: input.request.objective,
        context_blocks: [],
        allowed_citation_ids: [],
        images: [],
      });
      if (providerResult.kind === "question_set") {
        throw new Error("Unscoped Chat cannot return an evidence question set.");
      }
      block = responseBlock(providerResult);
      remoteStatus = "completed";
    } catch {
      providerResult = null;
      block = localFallbackBlock(input.request.objective, true);
    }
  } else {
    block = localFallbackBlock(input.request.objective, false);
  }

  return {
    body: {
      contract_version: CONTRACT_VERSION,
      task_id: randomUUID(),
      disposition: block.kind === "clarification" ? "clarify" : "answer",
      blocks: [block],
      external_effects: [],
      created_at: (input.createdAt ?? new Date()).toISOString(),
    },
    remoteStatus,
    providerResult,
  };
}

export async function createUnscopedChatTask(
  pool: Pool,
  auth: AuthContext,
  request: UnscopedChatTaskRequest,
  provider: RemoteChatAnswerProviding | null,
): Promise<UnscopedChatTaskMutationResult> {
  return inTransaction(pool, async (client) => {
    const requestIdentity = {
      objective_hash: createHash("sha256")
        .update(request.objective)
        .digest("hex"),
      context_scope: "none",
      external_effects: [],
    };
    const idempotency = await claimIdempotency(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "create_unscoped_chat_task",
      request.idempotency_key,
      requestIdentity,
    );
    if (idempotency.replay) {
      const replay = idempotency.replay.body as UnscopedChatTaskResponse;
      if (
        !replay ||
        typeof replay !== "object" ||
        !("external_effects" in replay) ||
        replay.external_effects.length !== 0
      ) {
        throw new ApiError(
          409,
          "IDEMPOTENCY_STATE_UNAVAILABLE",
          "The prior unscoped Chat task could not be resolved.",
        );
      }
      return {
        body: replay,
        replayed: true,
        status: idempotency.replay.status,
      };
    }

    const execution = await executeUnscopedChatTask({ request, provider });
    await appendAudit(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "unscoped_chat_task.completed",
      "unscoped_chat_task",
      execution.body.task_id,
      {
        context_scope: "none",
        evidence_count: 0,
        external_effect_count: 0,
        disposition: execution.body.disposition,
        remote_chat_status: execution.remoteStatus,
        remote_chat_provider_id: execution.providerResult?.provider_id ?? null,
        remote_chat_model: execution.providerResult?.model ?? null,
        remote_chat_provider_request_id:
          execution.providerResult?.provider_request_id ?? null,
      },
    );
    await completeIdempotency(client, idempotency, 201, execution.body);
    return { body: execution.body, replayed: false, status: 201 };
  });
}
