import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  isIntegrationMode,
  submitBrowserHandoff,
} from "@/lib/server/localBackend";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isIntegrationMode()) {
    return NextResponse.json(
      { code: "local_integration_disabled" },
      { status: 404 },
    );
  }
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { code: "session_stale", status: "not_ready" },
      { status: 401 },
    );
  }
  try {
    const payload: unknown = await request.json();
    return NextResponse.json(
      await submitBrowserHandoff(payload, {
        idempotencyKey: request.headers.get("idempotency-key"),
        sessionVersion: request.headers.get(
          "x-talent-signal-session-version",
        ),
      }),
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        code: "handoff_rejected",
        message:
          error instanceof Error
            ? error.message
            : "The reviewed handoff was rejected.",
      },
      { status: 400 },
    );
  }
}
