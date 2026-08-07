import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  isIntegrationMode,
  loadBackendWorkspace,
} from "@/lib/server/localBackend";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isIntegrationMode()) {
    return NextResponse.json(
      { code: "local_integration_disabled" },
      { status: 404 },
    );
  }
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ code: "authentication_required" }, { status: 401 });
  }
  const captureId = request.nextUrl.searchParams.get("capture_id") ?? undefined;
  if (captureId && !/^[0-9a-f-]{36}$/i.test(captureId)) {
    return NextResponse.json({ code: "capture_invalid" }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await loadBackendWorkspace("web-workspace", captureId),
    );
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { code: "backend_unavailable" },
      { status: 503 },
    );
  }
}
