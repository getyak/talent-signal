import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  isIntegrationMode,
  loadBrowserReceipt,
} from "@/lib/server/localBackend";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
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
  const { requestId } = await context.params;
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(requestId)) {
    return NextResponse.json({ code: "receipt_not_found" }, { status: 404 });
  }
  try {
    const retention = await loadBrowserReceipt(requestId);
    return NextResponse.json({
      status: "received",
      receipt_id: retention.receipt_id,
      capture_id: retention.capture_id,
      retention,
    });
  } catch (error) {
    if (error instanceof TalentSignalHttpError && error.status === 404) {
      return NextResponse.json(
        { code: "receipt_not_found" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { code: "receipt_readback_unavailable" },
      { status: 503 },
    );
  }
}
