import {
  AppendTelemetryBatchRequestSchema,
  TalentSignalHttpError,
  type AppendTelemetryBatchRequest,
} from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { isAllowedMutationOrigin } from "@/lib/request-origin";
import { appendWebTelemetryBatch } from "@/lib/server/telemetryBackend";
import { matchesTypeBox } from "@/lib/typebox-validation";

const TRACE_ID = /^[0-9a-f]{32}$/;

export async function POST(
  request: Request,
  context: { params: Promise<{ traceId: string }> },
) {
  if (!(await auth())?.user) return NextResponse.json({ code: "authentication_required" }, { status: 401 });
  if (!isAllowedMutationOrigin(request.headers)) {
    return NextResponse.json({ code: "cross_origin_telemetry_denied" }, { status: 403 });
  }
  const { traceId } = await context.params;
  const body = await request.json().catch(() => null) as AppendTelemetryBatchRequest | null;
  if (!TRACE_ID.test(traceId) || !body || !matchesTypeBox(AppendTelemetryBatchRequestSchema, body)) {
    return NextResponse.json({ code: "telemetry_batch_invalid" }, { status: 400 });
  }
  try {
    return NextResponse.json(await appendWebTelemetryBatch(traceId, body));
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    return NextResponse.json({ code: "telemetry_backend_unavailable" }, { status: 503 });
  }
}
