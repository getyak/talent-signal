import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { isLabId } from "@/lib/labInput";
import { isAllowedMutationOrigin } from "@/lib/request-origin";
import { cancelLabJob } from "@/lib/server/labBackend";

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
  const { id } = await context.params;
  if (!isLabId(id)) {
    return NextResponse.json({ error: { code: "LAB_INPUT_INVALID", message: "批量实验 ID 无效。" } }, { status: 400 });
  }
  try {
    return NextResponse.json(await cancelLabJob(id));
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    return NextResponse.json({ error: { code: "LAB_JOB_CANCEL_UNAVAILABLE", message: "停止请求未能保存。" } }, { status: 503 });
  }
}
