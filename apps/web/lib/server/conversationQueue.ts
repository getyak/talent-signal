import { TalentSignalClient, TalentSignalHttpError, type ConversationQueueAdmitRequest, type ConversationQueueMutationRequest } from "@talent-signal/contracts";
import { backendAuthBaseUrl, readBackendSessionClaims } from "./backendAuth";
import { contactHandoffSessionVersion } from "./contact-handoff-session";
import { BackendSessionExpiredError, backendSessionIsExpired } from "../backend-session";
import { isAllowedMutationOrigin } from "../request-origin";
import { workspaceSessionTitle } from "./workspaceChat";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

/** Every observation and mutation remains bound to the rendered login, including SSE. */
export async function conversationQueueRoute(request: Request, id: string, action: "read" | "admit" | "mutate" | "stream") {
  try {
    if (!uuid.test(id)) return json({ message: "对话标识无效。" }, 400);
    if (action === "admit" || action === "mutate") {
      if (!isAllowedMutationOrigin(request.headers)) return json({ message: "跨站请求已拒绝。" }, 403);
      if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ message: "请求格式无效。" }, 415);
    }
    const claims = await readBackendSessionClaims();
    if (!claims || backendSessionIsExpired(claims.backendExpiresAt)) return json({ code: "backend_session_expired", message: "请重新登录。" }, 401);
    if (request.headers.get("x-workspace-session") !== contactHandoffSessionVersion(claims)) return json({ code: "session_stale", message: "登录已改变，请重新打开对话。" }, 409);
    const client = new TalentSignalClient(backendAuthBaseUrl(), claims.backendAccessToken);
    const deadline = AbortSignal.any([request.signal, AbortSignal.timeout(12_000)]);
    if (action === "read") return json(await client.getConversationQueue(id, deadline));
    if (action === "stream") {
      const upstream = await client.openConversationQueueStream(id, request.signal);
      if (!upstream.ok) return json({ code: "queue_unavailable", message: "暂时无法连接回复。" }, upstream.status);
      return new Response(upstream.body, { headers: { ...headers, "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
    }
    let body: unknown;
    try { body = await request.json(); } catch { return json({ message: "请求格式无效。" }, 400); }
    if (action === "mutate") return json(await client.mutateConversationQueue(id, body as ConversationQueueMutationRequest, deadline));
    const input = body as ConversationQueueAdmitRequest;
    if (!input || input.session_id !== id || !uuid.test(input.message_id ?? "") || typeof input.objective !== "string" || !input.objective.trim() || input.objective.length > 1000) return json({ message: "消息须在 1–1000 字之间。" }, 400);
    try { await client.getAgentSession(id, deadline); }
    catch (error) {
      if (!(error instanceof TalentSignalHttpError) || error.status !== 404) throw error;
      try { await client.saveAgentSession(id, { expected_revision: 0, idempotency_key: id, payload: {
        id, scopeKind: "unresolved_intent", personDisplayLabel: "", contextDisplayLabel: "", title: workspaceSessionTitle(input.objective),
        turns: [], updatedAt: new Date().toISOString(), isUnread: false,
      } }, deadline); }
      catch (creationError) {
        if (!(creationError instanceof TalentSignalHttpError) || creationError.status !== 409) throw creationError;
        // Another tab can win creation of the same home intent; ownership is
        // re-read before admitting this distinct immutable message.
        await client.getAgentSession(id, deadline);
      }
    }
    return json(await client.admitConversationQueueEntry(input, deadline), 202);
  } catch (error) {
    if (error instanceof BackendSessionExpiredError) return json({ code: "backend_session_expired", message: "请重新登录。" }, 401);
    if (error instanceof TalentSignalHttpError) return json({ code: error.code, message: error.message }, error.status);
    return json({ code: "queue_unavailable", message: "连接暂时中断，消息仍保留。" }, 503);
  }
}
