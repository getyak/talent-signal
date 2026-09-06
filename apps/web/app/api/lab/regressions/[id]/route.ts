import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { isLabId } from "@/lib/labInput";
import { loadLabRegression } from "@/lib/server/labBackend";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await auth())?.user) {
    return NextResponse.json({ error: { code: "AUTH_REQUIRED", message: "需要登录。" } }, { status: 401 });
  }
  const { id } = await context.params;
  if (!isLabId(id)) {
    return NextResponse.json({ error: { code: "LAB_INPUT_INVALID", message: "回归案例 ID 无效。" } }, { status: 400 });
  }
  try {
    return NextResponse.json(await loadLabRegression(id), {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    return NextResponse.json({ error: { code: "LAB_REGRESSION_UNAVAILABLE", message: "回归案例当前不可读取。" } }, { status: 503 });
  }
}
