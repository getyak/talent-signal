import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  isIntegrationMode,
  revokeBackendEffectReversalApproval,
} from "@/lib/server/localBackend";

const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(
  request: Request,
  context: { params: Promise<{ approvalId: string }> },
) {
  if (!isIntegrationMode()) {
    return NextResponse.json({ code: "local_integration_disabled" }, { status: 404 });
  }
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ code: "authentication_required" }, { status: 401 });
  }
  const { approvalId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (
    !UUID.test(approvalId) ||
    (body.capture_id !== undefined &&
      (typeof body.capture_id !== "string" || !UUID.test(body.capture_id)))
  ) {
    return NextResponse.json({ code: "reversal_approval_invalid" }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await revokeBackendEffectReversalApproval(
        approvalId,
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
    return NextResponse.json({ code: "reversal_revocation_failed" }, { status: 503 });
  }
}
