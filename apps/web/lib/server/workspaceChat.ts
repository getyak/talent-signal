import { CONTRACT_VERSION, TalentSignalHttpError, type TalentSignalClient, type AgentSessionResponse } from "@talent-signal/contracts";

export type WorkspaceChatInput = { request_id: string; session_id: string; objective: string; time_zone: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** The browser submits intent; canonical product results supply conversation history. */
export async function askWorkspaceChat(client: TalentSignalClient, input: WorkspaceChatInput) {
  if (!input || !uuid.test(input.request_id) || !uuid.test(input.session_id) ||
      typeof input.objective !== "string" || !input.objective.trim() || input.objective.length > 1000 ||
      typeof input.time_zone !== "string" || input.time_zone.length > 100) {
    throw new TalentSignalHttpError(400, "workspace_chat_invalid", "消息格式无效。", null);
  }
  const now = new Date().toISOString();
  let session: AgentSessionResponse;
  try { session = await client.getAgentSession(input.session_id); }
  catch (error) {
    if (!(error instanceof TalentSignalHttpError) || error.status !== 404) throw error;
    session = await client.saveAgentSession(input.session_id, {
      expected_revision: 0, idempotency_key: input.session_id,
      payload: { id: input.session_id, scopeKind: "unresolved_intent", personDisplayLabel: "",
        contextDisplayLabel: "", title: "工作台对话", turns: [], updatedAt: now, isUnread: false },
    });
  }
  const payload = session.session.payload;
  if (!payload || session.session.deleted_at || payload.scopeKind !== "unresolved_intent") {
    throw new TalentSignalHttpError(409, "workspace_session_unavailable", "这段对话已不可用，请重新打开工作台。", null);
  }
  const output = await client.createUnscopedChatTask({
    idempotency_key: `web-chat:${input.request_id}`, session_id: input.session_id,
    message_id: input.request_id, objective: input.objective.trim(), time_zone: input.time_zone,
  });
  if (!payload.turns.some(turn => turn.id === input.request_id)) {
    await client.saveAgentSession(input.session_id, {
      expected_revision: session.session.revision, idempotency_key: input.request_id,
      payload: { ...payload, updatedAt: output.created_at, turns: [...payload.turns, {
        id: input.request_id, objective: input.objective.trim(), createdAt: now,
        response: { contractVersion: CONTRACT_VERSION, taskID: output.task_id, contextManifestID: "",
          knowledgeSnapshotID: "", disposition: output.disposition, createdAt: output.created_at },
      }] },
    });
  }
  return output;
}
