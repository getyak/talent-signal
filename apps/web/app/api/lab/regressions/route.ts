import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { labRegressionInputSchema } from "@/lib/labInput";
import { isAllowedMutationOrigin } from "@/lib/request-origin";
import { createLabRegression, loadLabRegressions } from "@/lib/server/labBackend";

export const dynamic = "force-dynamic";

function failure(error: unknown, code: string, message: string) {
  if (error instanceof TalentSignalHttpError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  return NextResponse.json({ error: { code, message } }, { status: 503 });
}

export async function GET() {
  if (!(await auth())?.user) {
    return NextResponse.json({ error: { code: "AUTH_REQUIRED", message: "需要登录。" } }, { status: 401 });
  }
  try {
    return NextResponse.json(await loadLabRegressions(), {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    return failure(error, "LAB_REGRESSIONS_UNAVAILABLE", "回归案例当前不可读取。");
  }
}

export async function POST(request: Request) {
  if (!(await auth())?.user) {
    return NextResponse.json({ error: { code: "AUTH_REQUIRED", message: "需要登录。" } }, { status: 401 });
  }
  if (!isAllowedMutationOrigin(request.headers)) {
    return NextResponse.json({ error: { code: "ORIGIN_DENIED", message: "请求来源无效。" } }, { status: 403 });
  }
  const parsed = labRegressionInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "LAB_INPUT_INVALID", message: "请选择一个失败尝试、错误类别和期望行为。" } }, { status: 400 });
  }
  try {
    return NextResponse.json(await createLabRegression(parsed.data), { status: 201 });
  } catch (error) {
    return failure(error, "LAB_REGRESSION_UNAVAILABLE", "失败案例未能保存为回归证据。");
  }
}
