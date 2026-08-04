import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  deleteBackendCapture,
  isIntegrationMode,
} from "@/lib/server/localBackend";

export async function POST(
  _request: Request,
  context: { params: Promise<{ captureId: string }> },
) {
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
  const { captureId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(captureId)) {
    return NextResponse.json({ code: "capture_invalid" }, { status: 400 });
  }
  try {
    return NextResponse.json(await deleteBackendCapture(captureId));
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { code: "deletion_failed" },
      { status: 503 },
    );
  }
}
