import { TalentSignalClient, TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";
import { backendAuthBaseUrl, readBackendSessionClaims } from "@/lib/server/backendAuth";
import { contactHandoffSessionVersion } from "@/lib/server/contact-handoff-session";
import { backendSessionIsExpired } from "@/lib/backend-session";
import { isAllowedMutationOrigin } from "@/lib/request-origin";
import { askWorkspaceChat, type WorkspaceChatInput } from "@/lib/server/workspaceChat";

const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
export async function POST(request: Request) {
  if (!isAllowedMutationOrigin(request.headers)) return reply({ message: "跨站请求已拒绝。" }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return reply({ message: "请求格式无效。" }, 415);
  try {
  const claims = await readBackendSessionClaims();
  if (!claims || backendSessionIsExpired(claims.backendExpiresAt)) return reply({ code: "backend_session_expired", message: "请先登录。" }, 401);
  if (request.headers.get("x-workspace-session") !== contactHandoffSessionVersion(claims)) return reply({ code: "session_stale", message: "登录已改变，请重新打开工作台再发送。" }, 409);
  const client = new TalentSignalClient(backendAuthBaseUrl(), claims.backendAccessToken);
  let input: WorkspaceChatInput;
  try { input = await request.json() as WorkspaceChatInput; }
  catch { return reply({ message: "消息格式无效。" }, 400); }
  return reply(await askWorkspaceChat(client, input));
  }
  catch (error) {
    if (error instanceof TalentSignalHttpError) return reply({ code: error.code, message: error.message }, error.status);
    return reply({ code: "workspace_chat_unavailable", message: "本次回复未完成。可以重试同一条消息。" }, 503);
  }
}
