import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getPursuitAgentTask } from "@/lib/server/pursuitBackend";

const Id = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function GET(
  _request: Request,
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
    return NextResponse.json(await getPursuitAgentTask(id));
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error: {
          code: "AGENT_TASK_READBACK_UNAVAILABLE",
          message: "无法核验任务状态；请稍后重试。",
        },
      },
      { status: 503 },
    );
  }
}
