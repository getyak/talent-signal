import {
  CreateTelemetryTraceRequestSchema,
  TalentSignalHttpError,
  type CreateTelemetryTraceRequest,
} from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { isAllowedMutationOrigin } from "@/lib/request-origin";
import { createWebTelemetryTrace } from "@/lib/server/telemetryBackend";
import { matchesTypeBox } from "@/lib/typebox-validation";

export const runtime = "nodejs";

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: Request) {
  if (!(await auth())?.user) return response({ code: "authentication_required" }, 401);
  if (!isAllowedMutationOrigin(request.headers)) {
    return response({ code: "cross_origin_telemetry_denied" }, 403);
  }
  const body = await request.json().catch(() => null) as CreateTelemetryTraceRequest | null;
  if (!body || !matchesTypeBox(CreateTelemetryTraceRequestSchema, body)) {
    return response({ code: "telemetry_trace_invalid" }, 400);
  }
  try {
    return response(await createWebTelemetryTrace(body), 201);
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return response({ code: error.code, message: error.message }, error.status);
    }
    return response({ code: "telemetry_backend_unavailable" }, 503);
  }
}
