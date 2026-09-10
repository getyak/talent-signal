import { NextRequest, NextResponse } from "next/server";
import { TalentSignalClient, TalentSignalHttpError, type AgentPreferenceMutation } from "@talent-signal/contracts";
import { backendAuthBaseUrl, readBackendSessionClaims } from "@/lib/server/backendAuth";
import { contactHandoffSessionVersion } from "@/lib/server/contact-handoff-session";
import { isAllowedMutationOrigin } from "@/lib/request-origin";
import { backendSessionIsExpired, isBackendSessionExpiredError } from "@/lib/backend-session";

export const dynamic = "force-dynamic";
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
async function handle(request: NextRequest) {
  if (request.method !== "GET" && !isAllowedMutationOrigin(request.headers)) return response({ message: "请求来源不受支持。" }, 403);
  try {
    const claims = await readBackendSessionClaims();
    if (!claims || backendSessionIsExpired(claims.backendExpiresAt)) return response({ code: "backend_session_expired", message: "请重新登录。" }, 401);
    if (request.headers.get("x-workspace-session") !== contactHandoffSessionVersion(claims)) return response({ code: "session_stale", message: "登录已改变，请重新打开偏好设置。" }, 409);
    const client = new TalentSignalClient(backendAuthBaseUrl(), claims.backendAccessToken);
    if (request.method === "GET") return response(await client.getAgentPreference());
    const reader = request.body?.getReader();
    if (!reader) return response({ message: "请选择回复偏好。" }, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const item = await reader.read(); if (item.done) break;
      size += item.value.length;
      if (size > 4096) { await reader.cancel(); return response({ message: "请求内容过长。" }, 413); }
      chunks.push(item.value);
    }
    let input: AgentPreferenceMutation;
    try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { return response({ message: "请求格式无效。" }, 400); }
    return response(await client.saveAgentPreference(input));
  } catch (error) {
    if (isBackendSessionExpiredError(error)) return response({ message: "请重新登录。" }, 401);
    if (error instanceof TalentSignalHttpError) return response({ message: error.message, code: error.code }, error.status);
    return response({ message: "暂时无法确认偏好，请重新读取或重试。" }, 503);
  }
}
export const GET = handle;
export const PUT = handle;
