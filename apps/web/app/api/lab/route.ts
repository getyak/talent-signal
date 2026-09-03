import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { loadLabManifest } from "@/lib/server/labBackend";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await auth())?.user) {
    return NextResponse.json(
      { error: { code: "AUTH_REQUIRED", message: "需要登录。" } },
      { status: 401 },
    );
  }
  try {
    return NextResponse.json(await loadLabManifest(), {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: { code: "LAB_UNAVAILABLE", message: "Lab 控制面当前不可用。" } },
      { status: 503 },
    );
  }
}
