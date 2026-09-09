import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { readBackendSessionClaims } from "@/lib/server/backendAuth";
import { backendSessionIsExpired } from "@/lib/backend-session";
import { contactHandoffSessionVersion } from "@/lib/server/contact-handoff-session";
import {
  isIntegrationMode,
  localSessionStatus,
} from "@/lib/server/localBackend";

export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await readBackendSessionClaims();
  if (claims && !backendSessionIsExpired(claims.backendExpiresAt)) return NextResponse.json({ status: "ready",
    workspace_label: claims.backendAccountName, session_version: contactHandoffSessionVersion(claims),
    contact_agent: true }, { headers: { "cache-control": "no-store" } });
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
