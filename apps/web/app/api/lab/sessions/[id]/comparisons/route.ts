import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { compareLabScenarioInputSchema, isLabId } from "@/lib/labInput";
import { isAllowedMutationOrigin } from "@/lib/request-origin";
import { createLabComparison } from "@/lib/server/labBackend";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await auth())?.user) return NextResponse.json({ error: { code: "AUTH_REQUIRED", message: "需要登录。" } }, { status: 401 });
  if (!isAllowedMutationOrigin(request.headers)) return NextResponse.json({ error: { code: "ORIGIN_DENIED", message: "请求来源无效。" } }, { status: 403 });
  const { id } = await context.params;
  const parsed = compareLabScenarioInputSchema.safeParse(await request.json().catch(() => null));
  if (!isLabId(id) || !parsed.success) return NextResponse.json({ error: { code: "LAB_INPUT_INVALID", message: "Lab Session 或比较请求无效。" } }, { status: 400 });
  try {
    return NextResponse.json(await createLabComparison(id, parsed.data), { status: 201 });
  } catch (error) {
    if (error instanceof TalentSignalHttpError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    return NextResponse.json({ error: { code: "LAB_COMPARISON_UNAVAILABLE", message: "无法在同一快照上完成比较。" } }, { status: 503 });
  }
}
