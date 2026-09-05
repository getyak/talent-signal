import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { labJobInputSchema } from "@/lib/labInput";
import { isAllowedMutationOrigin } from "@/lib/request-origin";
import { createLabJob, loadLabJobCatalog } from "@/lib/server/labBackend";

export const dynamic = "force-dynamic";

function failure(error: unknown, code: string, message: string) {
  if (error instanceof TalentSignalHttpError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  return NextResponse.json({ error: { code, message } }, { status: 503 });
}

export async function GET() {
  if (!(await auth())?.user) {
    return NextResponse.json(
      { error: { code: "AUTH_REQUIRED", message: "需要登录。" } },
      { status: 401 },
    );
  }
  try {
    return NextResponse.json(await loadLabJobCatalog(), {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    return failure(error, "LAB_JOB_CATALOG_UNAVAILABLE", "批量实验目录当前不可用。");
  }
}

export async function POST(request: Request) {
  if (!(await auth())?.user) {
    return NextResponse.json(
      { error: { code: "AUTH_REQUIRED", message: "需要登录。" } },
      { status: 401 },
    );
  }
  if (!isAllowedMutationOrigin(request.headers)) {
    return NextResponse.json(
      { error: { code: "ORIGIN_DENIED", message: "请求来源无效。" } },
      { status: 403 },
    );
  }
  const parsed = labJobInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "LAB_INPUT_INVALID", message: "请重新检查冻结案例、配置和调用预算。" } },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(await createLabJob(parsed.data), { status: 202 });
  } catch (error) {
    return failure(error, "LAB_JOB_UNAVAILABLE", "批量实验未能创建。");
  }
}
