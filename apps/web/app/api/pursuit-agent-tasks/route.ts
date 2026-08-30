import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { pursuitAgentTaskInputSchema } from "@/lib/pursuitApiInput";
import { createPursuitAgentTask } from "@/lib/server/pursuitBackend";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: { code: "AUTH_REQUIRED", message: "需要登录。" } },
      { status: 401 },
    );
  }
  const parsed = pursuitAgentTaskInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "AGENT_TASK_INPUT_INVALID",
          message: "需要准确的寻访范围、版本、来源与任务目标。",
        },
      },
      { status: 400 },
    );
  }
  const { pursuit_id: pursuitId, ...body } = parsed.data;
  try {
    return NextResponse.json(
      await createPursuitAgentTask(pursuitId, body),
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error: {
          code: "AGENT_TASK_UNAVAILABLE",
          message: "任务未能可靠接受；没有规范状态或外部系统被改变。",
        },
      },
      { status: 503 },
    );
  }
}
