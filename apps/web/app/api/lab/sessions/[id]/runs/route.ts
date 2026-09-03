import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { isLabId, runLabScenarioInputSchema } from "@/lib/labInput";
import { isAllowedMutationOrigin } from "@/lib/request-origin";
import { createLabRun } from "@/lib/server/labBackend";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await auth())?.user) return NextResponse.json({ error: { code: "AUTH_REQUIRED", message: "需要登录。" } }, { status: 401 });
  if (!isAllowedMutationOrigin(request.headers)) return NextResponse.json({ error: { code: "ORIGIN_DENIED", message: "请求来源无效。" } }, { status: 403 });
  const { id } = await context.params;
  const parsed = runLabScenarioInputSchema.safeParse(await request.json().catch(() => null));
  if (!isLabId(id) || !parsed.success) return NextResponse.json({ error: { code: "LAB_INPUT_INVALID", message: "Lab Session 或运行版本无效。" } }, { status: 400 });
  try {
    return NextResponse.json(await createLabRun(id, parsed.data), { status: 201 });
  } catch (error) {
    if (error instanceof TalentSignalHttpError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    return NextResponse.json({ error: { code: "LAB_RUN_UNAVAILABLE", message: "场景无法稳定重放。" } }, { status: 503 });
  }
}
