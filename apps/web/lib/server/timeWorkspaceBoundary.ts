import "server-only";
import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";
import { backendSessionIsExpired } from "@/lib/backend-session";
import { isAllowedMutationOrigin } from "@/lib/request-origin";
import { readBackendSessionClaims } from "./backendAuth";
import { workspaceSessionsBinding } from "./workspaceSessions";

export const timeNoStore = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
export const timeReply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: timeNoStore });

export async function timeAccess(request: Request, mutation = false) {
  if (mutation && !isAllowedMutationOrigin(request.headers)) {
    throw new TalentSignalHttpError(403, "origin_invalid", "跨站请求已拒绝。", null);
  }
  const claims = await readBackendSessionClaims();
  if (!claims || backendSessionIsExpired(claims.backendExpiresAt)) {
    throw new TalentSignalHttpError(401, "backend_session_expired", "请重新登录。", null);
  }
  const binding = workspaceSessionsBinding(claims);
  if (request.headers.get("x-workspace-session") !== binding) {
    throw new TalentSignalHttpError(409, "session_stale", "登录已改变，请重新打开时间工作台。", null);
  }
  if (mutation && !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new TalentSignalHttpError(415, "format_invalid", "请求格式无效。", null);
  }
  return { claims, binding };
}

export function timeFailure(error: unknown) {
  if (error instanceof TalentSignalHttpError) {
    const messages: Record<number, string> = {
      400: "请核对日期、筛选条件和输入内容。", 401: "登录已失效，请重新登录。",
      403: "当前账号不能访问这条记录。", 404: "记录不存在或已无法访问。",
      409: "记录已改变或操作结果需要核实，请重新读取。", 410: "记录已过期，请重新读取。",
      422: "请核对具体日期、时区和起止时间。", 429: "请求较多，请稍后重试。",
    };
    return timeReply({ code: error.code, message: messages[error.status] ?? "处理暂未完成，请重试。" }, error.status);
  }
  if (error instanceof SyntaxError) return timeReply({ message: "请求格式无效。" }, 400);
  return timeReply({ code: "time_unavailable", message: "时间工作台暂时不可用，请重试。" }, 503);
}
