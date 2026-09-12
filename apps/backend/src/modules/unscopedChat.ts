import { calendarDraftContextForRequest } from "./calendarDraftContext.js";
import { createHarnessSourceGuard } from "./harnessSourceGuard.js";
import { loadAgentResponsePreference } from "./agentPreferences.js";
import type { RuntimeObservationContext } from "@talent-signal/agent";
import type { HarnessContinuationFactory } from "@talent-signal/agent";
import { createHarnessContinuationFactory } from "./harnessSessions.js";
import { measureLabServerStage } from "../lib/labDiagnostics.js";
import { createHash, randomUUID } from "node:crypto";

import {
  CONTRACT_VERSION,
  type ChatResponseBlock,
  type UnscopedChatTaskRequest,
  type UnscopedChatTaskResponse,
} from "@talent-signal/contracts";
import type { Pool } from "pg";

import { inTransaction, type DatabaseClient } from "../database/pool.js";
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
import { boundedConversationHistory } from "./chatAnswerProvider.js";
import { readAgentSessionConversation } from "./agentSessions.js";
import { firstTurnSessionTitle } from "./sessionTitles.js";
import { productObservationContext } from "./runtimeObservationSources.js";
import { assertSessionChatSourcesAvailable, assertSessionForChat, purgeUnavailableSessionChatSources, recordSessionChatSources, markSessionContextAnswer, type AgentSessionChatSource } from "./agentSessionSources.js";
import {
  executeWorkspaceConversationAgent,
  isWorkspaceConversationAgentProvider,
} from "./workspaceConversationAgent.js";

export interface UnscopedChatTaskMutationResult {
  labProductOutcome?: "accepted" | "fallback";
  body: UnscopedChatTaskResponse;
  replayed: boolean;
  status: number;
}

interface UnscopedChatExecution {
  body: UnscopedChatTaskResponse;
  conversationMessageIDs: string[];
  conversationSources?: AgentSessionChatSource[];
  previousTaskIDs: string[];
  remoteStatus: "agent_completed" | "completed" | "disabled" | "fallback";
  providerResult: RemoteChatAnswerResult | null;
  agentProviderResult: {
    providerID: string;
    model: string;
    providerRequestID: string | null;
    inputTokens: number;
    outputTokens: number;
    prompt?: import("@talent-signal/agent").PromptReference;
  } | null;
}

function responseBlock(answer: RemoteChatAnswerResult): ChatResponseBlock {
  return {
    id: randomUUID(),
    kind: answer.kind,
    title: answer.title.slice(0, 240),
    body: answer.body,
    status: answer.kind === "clarification" ? "needs_review" : "informational",
    citation_dependency_ids: [],
    requires_user_decision: answer.kind === "clarification" || Boolean(answer.calendarDraft),
    ...(answer.calendarDraft ? { calendar_draft: answer.calendarDraft, status: "needs_review" as const } : {}),
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
      ? usesChinese ? "这次未完成" : "Request not completed"
      : usesChinese ? "你好" : "Hello",
    body: remoteFailed
      ? usesChinese
        ? "这次处理未完成，没有执行外部操作。请重试；如果仍未完成，可以保留这条请求稍后继续。"
        : "This request did not complete. No external action was taken. Please retry, or keep this request to continue later."
      : usesChinese
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
  database?: DatabaseClient;
  probePool?: Pool;
  auth?: AuthContext;
  createdAt?: Date;
  referenceTime?: Date;
  continuation?: (sources: () => { expiresAt: Date; personIDs: readonly string[] }) => HarnessContinuationFactory;
}): Promise<UnscopedChatExecution> {
  const taskID = randomUUID();
  const calendarContext = calendarDraftContextForRequest(taskID, input.request.time_zone, input.referenceTime ?? input.createdAt ?? new Date());
  let observation: RuntimeObservationContext | undefined;
  // Ephemeral contact reads also need authority, even without an observation
  // retention owner or a persisted product Session.
  const sourcePeople = new Set<string>();
  const runExpiresAt = new Date(Date.now() + 7 * 86_400_000);
  const sources = () => {
    const refs = observation?.source_refs;
    return { expiresAt: refs?.kind === "product" ? new Date(refs.expires_at) : runExpiresAt,
      personIDs: [...new Set([...sourcePeople, ...(refs?.kind === "product" ? refs.person_ids : [])])] };
  };
  const assertCurrent = input.provider?.providerId === "claude-agent-sdk" && input.database && input.auth
    ? await createHarnessSourceGuard(input.database, input.auth, input.request.session_id, sources, input.probePool ?? input.database) : undefined;
  // Scope failures must escape before provider fallbacks; they are not model errors.
  const responsePreference = assertCurrent && input.database && input.auth
    ? await loadAgentResponsePreference(input.database, input.auth) : undefined;
  const sessionConversation = input.request.session_id && input.database && input.auth
    ? await readAgentSessionConversation(
        input.database, input.auth, input.request.session_id,
        { personId: null, relationshipContextId: null },
      )
    : { messages: [] };
  const conversationHistory = boundedConversationHistory(sessionConversation.messages, input.request.message_id);
  observation = input.database && input.auth ? await productObservationContext(input.database, input.auth, taskID,
    "unscoped_conversation", { sessionID: input.request.session_id,
      screenshotTaskIDs: sessionConversation.sources?.map((source) => source.taskID) ?? [] }) : undefined;
  if (sessionConversation.unavailableScreenshotContext && !sessionConversation.sources?.length)
    throw new ApiError(409, "AGENT_SESSION_CONTEXT_UNAVAILABLE", "The screenshot summary is not currently available. Review its current task before continuing from it.");
  const continuation = input.provider?.providerId === "claude-agent-sdk" && observation?.source_refs?.kind === "product"
    ? input.continuation?.(sources) : undefined;
  let providerResult: RemoteChatAnswerResult | null = null;
  let proposedSessionTitle: string | null = null;
  let agentProviderResult: UnscopedChatExecution["agentProviderResult"] = null;
  let remoteStatus: UnscopedChatExecution["remoteStatus"] = input.provider
    ? "fallback"
    : "disabled";
  let block: ChatResponseBlock;
  let agentEvent: UnscopedChatTaskResponse["agent_event"] = null;
  // A Session title belongs only to the first recorded result: no prior
  // dialogue and no carried screenshot context.
  const hasPriorConversationContext = conversationHistory.length > 0 || Boolean(sessionConversation.sources?.length);
  if (input.provider) {
    try {
      await assertCurrent?.();
      if (
        input.database &&
        input.auth &&
        isWorkspaceConversationAgentProvider(input.provider)
      ) {
        const execution = await executeWorkspaceConversationAgent({
          database: input.database,
          auth: input.auth,
          objective: input.request.objective,
          provider: input.provider,
          sessionID: input.request.session_id ?? null,
          ...(input.request.message_id ? { messageID: input.request.message_id } : {}),
          conversationHistory,
          runID: taskID,
          ...(continuation ? { continuation } : {}),
          ...(assertCurrent ? { assertCurrent } : {}),
          ...(responsePreference ? { responsePreference } : {}),
          ...(calendarContext ? { calendarContext } : {}),
          recordSourcePerson: personID => { sourcePeople.add(personID); },
          ...(observation ? { observation: { ...observation, authorization_scope: "workspace_conversation" } } : {}),
        });
        block = execution.providerResult.calendarDraft ? { ...execution.block, calendar_draft: execution.providerResult.calendarDraft,
          status: "needs_review", requires_user_decision: true } : execution.block;
        agentEvent = execution.event;
        agentProviderResult = {
          providerID: input.provider.id,
          model: input.provider.model,
          providerRequestID: execution.providerResult.sessionID ?? null,
          inputTokens: execution.providerResult.inputTokens,
          outputTokens: execution.providerResult.outputTokens,
          ...(execution.providerResult.prompt ? { prompt: execution.providerResult.prompt } : {}),
        };
        proposedSessionTitle = execution.providerResult.sessionTitle ?? execution.block.title;
        remoteStatus = "agent_completed";
      } else {
        providerResult = await measureLabServerStage("model_adapter", () => input.provider!.answer({
          mode: "unscoped_conversation",
          ...(continuation ? { continuation } : {}),
          ...(assertCurrent ? { assertCurrent } : {}),
          ...(responsePreference ? { responsePreference } : {}),
          ...(calendarContext ? { calendarContext } : {}),
          objective: input.request.objective,
          ...(conversationHistory.length > 0 ? { conversation_history: conversationHistory } : {}),
          context_blocks: [],
          allowed_citation_ids: [],
          images: [],
          ...(observation ? { observation } : {}),
        }));
        if (providerResult.kind === "question_set") {
          throw new Error("Unscoped Chat cannot return an evidence question set.");
        }
        block = responseBlock(providerResult);
        proposedSessionTitle = providerResult.title;
        remoteStatus = "completed";
      }
    } catch {
      providerResult = null;
      agentProviderResult = null;
      if (input.provider.providerId === "claude-agent-sdk") {
        // The SDK owns retries within the admitted Run. A second remote call
        // here would bypass its source/lease checks and reset the Run budget.
        block = localFallbackBlock(input.request.objective, true);
      } else try {
        providerResult = await measureLabServerStage("model_adapter", () => input.provider!.answer({
          mode: "unscoped_conversation",
          objective: input.request.objective,
          ...(conversationHistory.length > 0 ? { conversation_history: conversationHistory } : {}),
          context_blocks: [],
          allowed_citation_ids: [],
          images: [],
          ...(observation ? { observation } : {}),
        }));
        if (providerResult.kind === "question_set") {
          throw new Error("Unscoped Chat cannot return an evidence question set.");
        }
        block = responseBlock(providerResult);
        proposedSessionTitle = providerResult.title;
      } catch {
        providerResult = null;
        block = localFallbackBlock(input.request.objective, true);
      }
      remoteStatus = "fallback";
    }
  } else {
    block = localFallbackBlock(input.request.objective, false);
  }

  // Prefer the title proposed by the current answer model call; otherwise use
  // a bounded objective-derived fallback. Never generic, never over budget.
  const firstTurnTitle = hasPriorConversationContext ? null : firstTurnSessionTitle(
    input.request.objective,
    proposedSessionTitle,
  );

  return {
    conversationMessageIDs: conversationHistory.map((message) => message.message_id),
    previousTaskIDs: conversationHistory.filter((message) => message.role === "assistant").map((message) => message.message_id),
    ...(sessionConversation.sources ? { conversationSources: sessionConversation.sources } : {}),
    body: {
      contract_version: CONTRACT_VERSION,
      task_id: taskID,
      disposition: block.kind === "clarification" ? "clarify" : "answer",
      blocks: [sessionConversation.sources?.length ? markSessionContextAnswer(block, input.request.objective) : block],
      agent_event: agentEvent,
      external_effects: [],
      ...(firstTurnTitle ? { session_title: firstTurnTitle } : {}),
      created_at: (input.createdAt ?? new Date()).toISOString(),
    },
    remoteStatus,
    providerResult,
    agentProviderResult,
  };
}

export async function createUnscopedChatTask(
  pool: Pool,
  auth: AuthContext,
  request: UnscopedChatTaskRequest,
  provider: RemoteChatAnswerProviding | null,
  selectRemoteProvider?: (client: DatabaseClient) => Promise<RemoteChatAnswerProviding | null>,
  referenceTime?: Date,
): Promise<UnscopedChatTaskMutationResult> {
  if (request.session_id) await purgeUnavailableSessionChatSources(pool, auth);
  return inTransaction(pool, async (client) => {
    if (request.session_id) await assertSessionForChat(client, auth, request.session_id);
    const requestIdentity = {
      objective_hash: createHash("sha256")
        .update(request.objective)
        .digest("hex"),
      // Preserve the original request fingerprint so an in-flight retry from
      // an older iOS build can still replay safely across this server upgrade.
      context_scope: "none",
      ...(request.time_zone ? { time_zone: request.time_zone } : {}),
      external_effects: [],
      ...(request.session_id ? { session_id: request.session_id } : {}),
      ...(request.message_id ? { message_id: request.message_id } : {}),
    };
    const idempotency = await claimIdempotency(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "create_unscoped_chat_task",
      request.idempotency_key,
      requestIdentity,
    );
    if (idempotency.replay) {
      if (request.session_id) await assertSessionForChat(client, auth, request.session_id, true);
      const replay = idempotency.replay.body as UnscopedChatTaskResponse;
      if (replay?.task_id) await assertSessionChatSourcesAvailable(client, auth, replay.task_id);
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

    if (selectRemoteProvider) provider = await selectRemoteProvider(client);
    const protectContinuation = provider?.providerId === "claude-agent-sdk" && Boolean(request.session_id);
    if (protectContinuation) await client.query("SAVEPOINT harness_product_reply");
    const execution = await executeUnscopedChatTask({
      request,
      provider,
      database: client,
      probePool: pool,
      auth,
      ...(referenceTime ? { referenceTime } : {}),
      ...(request.session_id ? { continuation: (sources: () => { expiresAt: Date; personIDs: readonly string[] }) => createHarnessContinuationFactory(client, pool, auth, request.session_id!, { kind: "workspace_conversation" }, sources) } : {}),
    });
    // A failed SDK run must not consume this client intent with a cached 201.
    // The transaction rollback preserves same-key retry after the user chooses
    // Retry; this does not start an automatic second provider run.
    if (provider?.providerId === "claude-agent-sdk" && execution.remoteStatus === "fallback") {
      throw new ApiError(503, "CLAUDE_CHAT_RETRYABLE_FAILURE", "这次处理未完成，没有执行外部操作。请重试本次请求。");
    }
    if (protectContinuation) {
      if (execution.remoteStatus === "fallback") await client.query("ROLLBACK TO SAVEPOINT harness_product_reply");
      await client.query("RELEASE SAVEPOINT harness_product_reply");
    }
    await appendAudit(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "unscoped_chat_task.completed",
      "unscoped_chat_task",
      execution.body.task_id,
      {
        context_scope: "agent_bounded_contact_lookup",
        conversation_session_id: request.session_id ?? null,
        conversation_message_ids: execution.conversationMessageIDs,
        current_message_id: request.message_id ?? null,
        evidence_count: 0,
        external_effect_count: 0,
        disposition: execution.body.disposition,
        remote_chat_status: execution.remoteStatus,
        remote_chat_provider_id:
          execution.agentProviderResult?.providerID
            ?? execution.providerResult?.provider_id
            ?? null,
        remote_chat_model:
          execution.agentProviderResult?.model
            ?? execution.providerResult?.model
            ?? null,
        remote_chat_provider_request_id:
          execution.agentProviderResult?.providerRequestID
            ?? execution.providerResult?.provider_request_id
            ?? null,
        contact_agent_event_kind: execution.body.agent_event?.kind ?? null,
        prompt: execution.agentProviderResult?.prompt ?? (execution.providerResult?.prompt_snapshot
          ? { name: execution.providerResult.prompt_snapshot.name, revision: execution.providerResult.prompt_snapshot.revision,
            versionId: execution.providerResult.prompt_snapshot.versionId, source: execution.providerResult.prompt_snapshot.source } : null),
      },
    );
    await recordSessionChatSources(client, auth, request.session_id, execution.body.task_id, execution.conversationSources ?? [], execution.previousTaskIDs);
    await completeIdempotency(client, idempotency, 201, execution.body);
    return { body: execution.body, replayed: false, status: 201,
      labProductOutcome: execution.remoteStatus === "agent_completed" || execution.remoteStatus === "completed" ? "accepted" : "fallback" };
  });
}
