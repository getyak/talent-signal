import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  isIntegrationMode,
  reviseBackendActionForEvaluation,
  type IntegrationRevisionVariant,
} from "@/lib/server/localBackend";

type RevisionBody = {
  variant?: IntegrationRevisionVariant;
};

export async function POST(
  request: Request,
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
  const body = (await request.json()) as RevisionBody;
  if (
    !/^[0-9a-f-]{36}$/i.test(actionId) ||
    !body.variant ||
    !["stale_approval", "timeout_after_effect"].includes(body.variant)
  ) {
    return NextResponse.json({ code: "revision_invalid" }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await reviseBackendActionForEvaluation(actionId, body.variant),
    );
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { code: "revision_failed" },
      { status: 503 },
    );
  }
}
