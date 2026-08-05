import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  approveBackendAction,
  isIntegrationMode,
} from "@/lib/server/localBackend";

export async function POST(
  _request: Request,
  context: { params: Promise<{ actionId: string }> },
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
  const { actionId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(actionId)) {
    return NextResponse.json({ code: "action_invalid" }, { status: 400 });
  }
  try {
    return NextResponse.json(await approveBackendAction(actionId));
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { code: "approval_failed" },
      { status: 503 },
    );
  }
}
