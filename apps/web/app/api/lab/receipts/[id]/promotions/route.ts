import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { isLabId, promoteRealityReceiptInputSchema } from "@/lib/labInput";
import { isAllowedMutationOrigin } from "@/lib/request-origin";
import { promoteLabRealityReceipt } from "@/lib/server/labBackend";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await auth())?.user) return NextResponse.json({ error: { code: "AUTH_REQUIRED", message: "需要登录。" } }, { status: 401 });
  if (!isAllowedMutationOrigin(request.headers)) return NextResponse.json({ error: { code: "ORIGIN_DENIED", message: "请求来源无效。" } }, { status: 403 });
  const { id } = await context.params;
  const parsed = promoteRealityReceiptInputSchema.safeParse(await request.json().catch(() => null));
  if (!isLabId(id) || !parsed.success) return NextResponse.json({ error: { code: "LAB_INPUT_INVALID", message: "晋升需要一条明确的人工审阅说明。" } }, { status: 400 });
  try {
    return NextResponse.json(await promoteLabRealityReceipt(id, parsed.data), { status: 201 });
  } catch (error) {
    if (error instanceof TalentSignalHttpError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    return NextResponse.json({ error: { code: "LAB_PROMOTION_UNAVAILABLE", message: "Receipt 未能晋升为 Eval Case。" } }, { status: 503 });
  }
}
