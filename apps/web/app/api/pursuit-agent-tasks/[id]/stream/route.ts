import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { parseAgentTaskStreamCursor } from "@/lib/agentTaskStream";
import { createPursuitAgentTaskEventStream } from "@/lib/server/pursuitBackend";

const Id = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function afterSequence(request: Request): number {
  const url = new URL(request.url);
  const candidate =
    request.headers.get("last-event-id") ?? url.searchParams.get("after") ?? "0";
  return parseAgentTaskStreamCursor(candidate);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: { code: "AUTH_REQUIRED", message: "需要登录。" } },
      { status: 401 },
    );
  }
  const { id } = await context.params;
  if (!Id.test(id)) {
    return NextResponse.json(
      { error: { code: "AGENT_TASK_ID_INVALID", message: "任务 ID 无效。" } },
      { status: 400 },
    );
  }

  try {
    const stream = await createPursuitAgentTaskEventStream(
      id,
      afterSequence(request),
      request.signal,
    );
    return new Response(stream, {
      headers: {
        "Cache-Control": "no-cache, no-store, max-age=0, must-revalidate",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "AGENT_TASK_STREAM_UNAVAILABLE",
          message: "暂时无法连接任务事件流；规范任务状态没有改变。",
        },
      },
      { status: 503 },
    );
  }
}
