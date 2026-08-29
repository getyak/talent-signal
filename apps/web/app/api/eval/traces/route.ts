import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { loadTelemetryTraces } from "@/lib/server/telemetryBackend";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await auth())?.user) return NextResponse.json({ code: "authentication_required" }, { status: 401 });
  const value = Number.parseInt(new URL(request.url).searchParams.get("limit") ?? "100", 10);
  const limit = Number.isFinite(value) ? Math.min(Math.max(value, 1), 100) : 100;
  try {
    return NextResponse.json(await loadTelemetryTraces(limit), {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    return NextResponse.json({ code: "telemetry_backend_unavailable" }, { status: 503 });
  }
}
