import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { cancelAgentTaskInputSchema } from "@/lib/pursuitApiInput";
import { cancelPursuitAgentTask } from "@/lib/server/pursuitBackend";

const Id = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function POST(
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
  const parsed = cancelAgentTaskInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!Id.test(id) || !parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "AGENT_TASK_CANCEL_INPUT_INVALID",
          message: "取消需要当前任务版本与明确原因。",
        },
      },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(await cancelPursuitAgentTask(id, parsed.data));
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
          code: "AGENT_TASK_CANCEL_UNAVAILABLE",
          message: "无法核验取消结果；请先重新读取任务状态。",
        },
      },
      { status: 503 },
    );
  }
}
