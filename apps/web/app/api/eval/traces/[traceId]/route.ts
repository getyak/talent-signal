import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { loadTelemetryTrace } from "@/lib/server/telemetryBackend";

const TRACE_ID = /^[0-9a-f]{32}$/;

export async function GET(
  _request: Request,
  context: { params: Promise<{ traceId: string }> },
) {
  if (!(await auth())?.user) return NextResponse.json({ code: "authentication_required" }, { status: 401 });
  const { traceId } = await context.params;
  if (!TRACE_ID.test(traceId)) return NextResponse.json({ code: "trace_id_invalid" }, { status: 400 });
  try {
    return NextResponse.json(await loadTelemetryTrace(traceId), {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    return NextResponse.json({ code: "telemetry_backend_unavailable" }, { status: 503 });
  }
}
