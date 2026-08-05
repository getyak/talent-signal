import { NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  isIntegrationMode,
  localSessionStatus,
} from "@/lib/server/localBackend";

export const dynamic = "force-dynamic";

export async function GET() {
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
    return NextResponse.json(await localSessionStatus());
  } catch {
    return NextResponse.json(
      { code: "backend_unavailable", status: "not_ready" },
      { status: 503 },
    );
  }
}
