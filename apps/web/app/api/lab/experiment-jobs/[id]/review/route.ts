import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { isLabId, labJobReviewInputSchema } from "@/lib/labInput";
import { isAllowedMutationOrigin } from "@/lib/request-origin";
import { reviewLabJob } from "@/lib/server/labBackend";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await auth())?.user) {
    return NextResponse.json({ error: { code: "AUTH_REQUIRED", message: "需要登录。" } }, { status: 401 });
  }
  if (!isAllowedMutationOrigin(request.headers)) {
    return NextResponse.json({ error: { code: "ORIGIN_DENIED", message: "请求来源无效。" } }, { status: 403 });
  }
  const [{ id }, body] = await Promise.all([
    context.params,
    request.json().catch(() => null),
  ]);
  const parsed = labJobReviewInputSchema.safeParse(body);
  if (!isLabId(id) || !parsed.success) {
    return NextResponse.json({ error: { code: "LAB_INPUT_INVALID", message: "人工比较结论无效。" } }, { status: 400 });
  }
  try {
    return NextResponse.json(await reviewLabJob(id, parsed.data));
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    return NextResponse.json({ error: { code: "LAB_JOB_REVIEW_UNAVAILABLE", message: "人工比较结论未能保存。" } }, { status: 503 });
  }
}
