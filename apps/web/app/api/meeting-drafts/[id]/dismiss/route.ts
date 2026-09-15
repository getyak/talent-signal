import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { backendSessionIsExpired } from "@/lib/backend-session";
import { isAllowedMutationOrigin } from "@/lib/request-origin";
import { readBackendSessionClaims } from "@/lib/server/backendAuth";
import { dismissMeetingDraft } from "@/lib/server/meetingDrafts";
import {
  isWorkspaceSessionId,
  workspaceSessionsBinding,
} from "@/lib/server/workspaceSessions";

const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isAllowedMutationOrigin(request.headers)) {
    return reply({ code: "origin_rejected", message: "跨站请求已拒绝。" }, 403);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return reply({ code: "invalid_content_type", message: "请求格式无效。" }, 415);
  }
  const claims = await readBackendSessionClaims();
  if (!claims || backendSessionIsExpired(claims.backendExpiresAt)) {
    return reply({ code: "backend_session_expired", message: "请先登录。" }, 401);
  }
  if (request.headers.get("x-workspace-session") !== workspaceSessionsBinding(claims)) {
    return reply({ code: "session_stale", message: "登录已变化，请刷新后重试。" }, 409);
  }
  const { id } = await context.params;
  if (!isWorkspaceSessionId(id)) {
    return reply({ code: "meeting_draft_invalid", message: "会议草稿标识无效。" }, 400);
  }

  let body: { expected_revision?: unknown; idempotency_key?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return reply({ code: "meeting_draft_invalid", message: "请求格式无效。" }, 400);
  }
  if (
    !Number.isInteger(body.expected_revision) ||
    Number(body.expected_revision) < 1 ||
    !isWorkspaceSessionId(body.idempotency_key)
  ) {
    return reply({ code: "meeting_draft_invalid", message: "撤销参数无效。" }, 400);
  }

  try {
    const draft = await dismissMeetingDraft(id, {
      expected_revision: Number(body.expected_revision),
      idempotency_key: body.idempotency_key,
    });
    return reply({ draft, session_version: workspaceSessionsBinding(claims) });
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return reply({ code: error.code, message: error.message }, error.status);
    }
    return reply(
      {
        code: "meeting_draft_unavailable",
        message: "会议草稿状态暂时无法保存；页面没有假设操作成功。",
      },
      503,
    );
  }
}
