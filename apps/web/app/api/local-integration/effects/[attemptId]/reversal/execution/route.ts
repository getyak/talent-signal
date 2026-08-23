import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  executeBackendEffectReversal,
  isIntegrationMode,
} from "@/lib/server/localBackend";

const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(
  request: Request,
  context: { params: Promise<{ attemptId: string }> },
) {
  if (!isIntegrationMode()) {
    return NextResponse.json({ code: "local_integration_disabled" }, { status: 404 });
  }
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ code: "authentication_required" }, { status: 401 });
  }
  const { attemptId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (
    !UUID.test(attemptId) ||
    typeof body.approval_id !== "string" ||
    !UUID.test(body.approval_id) ||
    (body.capture_id !== undefined &&
      (typeof body.capture_id !== "string" || !UUID.test(body.capture_id)))
  ) {
    return NextResponse.json({ code: "reversal_execution_invalid" }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await executeBackendEffectReversal(
        attemptId,
        body.approval_id,
        typeof body.capture_id === "string" ? body.capture_id : undefined,
      ),
    );
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json({ code: "reversal_execution_failed" }, { status: 503 });
  }
}
