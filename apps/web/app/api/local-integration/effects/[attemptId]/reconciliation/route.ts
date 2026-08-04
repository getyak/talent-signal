import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  isIntegrationMode,
  reconcileBackendEffect,
} from "@/lib/server/localBackend";

export async function POST(
  _request: Request,
  context: { params: Promise<{ attemptId: string }> },
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
  const { attemptId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(attemptId)) {
    return NextResponse.json({ code: "attempt_invalid" }, { status: 400 });
  }
  try {
    return NextResponse.json(await reconcileBackendEffect(attemptId));
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { code: "reconciliation_failed" },
      { status: 503 },
    );
  }
}
