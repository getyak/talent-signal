import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  isIntegrationMode,
  revokeBackendApproval,
} from "@/lib/server/localBackend";

export async function POST(
  _request: Request,
  context: { params: Promise<{ approvalId: string }> },
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
  const { approvalId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(approvalId)) {
    return NextResponse.json({ code: "approval_invalid" }, { status: 400 });
  }
  try {
    return NextResponse.json(await revokeBackendApproval(approvalId));
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { code: "revocation_failed" },
      { status: 503 },
    );
  }
}
