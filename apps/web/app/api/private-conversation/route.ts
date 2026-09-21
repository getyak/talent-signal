import { backendAuthBaseUrl, readBackendSessionClaims } from "@/lib/server/backendAuth";
import { contactHandoffSessionVersion } from "@/lib/server/contact-handoff-session";
import { backendSessionIsExpired, isBackendSessionExpiredError } from "@/lib/backend-session";
import { isAllowedMutationOrigin } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256 * 1024;
const NDJSON_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";
const SANITIZED_CODE = /^[A-Za-z0-9_]{1,80}$/u;

function reply(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function rejected(code: string, message: string, status: number): Response {
  return reply({ error: { code, message } }, status);
}

type BoundedBody =
  | { ok: true; body: string }
  | { ok: false; code: string; status: number };

/** Bounds raw request bytes before any parsing so content never overflows. */
async function readBoundedBody(request: Request): Promise<BoundedBody> {
  const reader = request.body?.getReader();
  if (!reader) return { ok: false, code: "private_conversation_invalid", status: 400 };
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.length;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, code: "private_conversation_too_large", status: 413 };
      }
      chunks.push(item.value);
    }
  } catch {
    return { ok: false, code: "private_conversation_invalid", status: 400 };
  }
  if (size === 0) return { ok: false, code: "private_conversation_invalid", status: 400 };
  return { ok: true, body: Buffer.concat(chunks).toString("utf8") };
}

export async function POST(request: Request): Promise<Response> {
  if (!isAllowedMutationOrigin(request.headers)) {
    return rejected("private_conversation_origin_rejected", "跨站请求已拒绝。", 403);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return rejected("private_conversation_invalid", "请求格式无效。", 415);
  }
  try {
    // The authenticated login is established before any message is read.
    const claims = await readBackendSessionClaims();
    if (!claims || backendSessionIsExpired(claims.backendExpiresAt)) {
      return rejected("backend_session_expired", "请先登录。", 401);
    }
    if (request.headers.get("x-workspace-session") !== contactHandoffSessionVersion(claims)
      || request.headers.get("x-talent-signal-workspace") !== claims.backendAccountId) {
      return rejected("session_stale", "登录已改变，请重新打开工作台再发送。", 409);
    }

    const bounded = await readBoundedBody(request);
    if (!bounded.ok) return rejected(bounded.code, "消息格式无效。", bounded.status);

    let upstream: Response;
    try {
      upstream = await fetch(`${backendAuthBaseUrl()}/v1/private-conversation`, {
        method: "POST",
        headers: {
          accept: NDJSON_CONTENT_TYPE,
          authorization: `Bearer ${claims.backendAccessToken}`,
          "content-type": "application/json",
        },
        body: bounded.body,
        cache: "no-store",
        signal: request.signal,
      });
    } catch {
      return rejected("private_conversation_unavailable", "本次对话未完成。", 503);
    }

    if (!upstream.ok || !upstream.body) {
      // Never forward backend or provider prose; keep one sanitized code only.
      let code = "private_conversation_unavailable";
      try {
        const payload = (await upstream.json()) as { error?: { code?: unknown } };
        const candidate = payload?.error?.code;
        if (typeof candidate === "string" && SANITIZED_CODE.test(candidate)) code = candidate;
      } catch {
        // A non-JSON upstream error is reported by code only.
      }
      const status = upstream.status >= 400 && upstream.status <= 599 ? upstream.status : 503;
      return rejected(code, "本次对话未完成。", status);
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-transform",
        "Content-Type": NDJSON_CONTENT_TYPE,
        "X-Accel-Buffering": "no",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (isBackendSessionExpiredError(error)) {
      return rejected("backend_session_expired", "请重新登录。", 401);
    }
    return rejected("private_conversation_unavailable", "本次对话未完成。", 503);
  }
}
