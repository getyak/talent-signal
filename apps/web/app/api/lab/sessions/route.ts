import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { startLabSessionInputSchema } from "@/lib/labInput";
import { isAllowedMutationOrigin } from "@/lib/request-origin";
import { createLabSession } from "@/lib/server/labBackend";

export async function POST(request: Request) {
  if (!(await auth())?.user) {
    return NextResponse.json({ error: { code: "AUTH_REQUIRED", message: "需要登录。" } }, { status: 401 });
  }
  if (!isAllowedMutationOrigin(request.headers)) {
    return NextResponse.json({ error: { code: "ORIGIN_DENIED", message: "请求来源无效。" } }, { status: 403 });
  }
  const parsed = startLabSessionInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "LAB_INPUT_INVALID", message: "请选择一个版本化 Lab 场景。" } }, { status: 400 });
  }
  try {
    return NextResponse.json(await createLabSession(parsed.data), { status: 201 });
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    return NextResponse.json({ error: { code: "LAB_SESSION_UNAVAILABLE", message: "无法创建隔离 Lab Session。" } }, { status: 503 });
  }
}
