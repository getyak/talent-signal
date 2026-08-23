import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  approveBackendEffectReversal,
  isIntegrationMode,
  previewBackendEffectReversal,
} from "@/lib/server/localBackend";

function validId(value: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(value);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ attemptId: string }> },
) {
  if (!isIntegrationMode()) {
    return NextResponse.json({ code: "local_integration_disabled" }, { status: 404 });
  }
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ code: "authentication_required" }, { status: 401 });
  }
  const { attemptId } = await context.params;
  if (!validId(attemptId)) {
    return NextResponse.json({ code: "attempt_invalid" }, { status: 400 });
  }
  try {
    return NextResponse.json(await previewBackendEffectReversal(attemptId));
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json({ code: "reversal_preview_failed" }, { status: 503 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ attemptId: string }> },
) {
  if (!isIntegrationMode()) {
    return NextResponse.json({ code: "local_integration_disabled" }, { status: 404 });
  }
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ code: "authentication_required" }, { status: 401 });
  }
  const { attemptId } = await context.params;
  if (!validId(attemptId)) {
    return NextResponse.json({ code: "attempt_invalid" }, { status: 400 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (
    typeof body.reason !== "string" ||
    body.reason.trim().length === 0 ||
    body.reason.length > 500 ||
    typeof body.expected_destination_version !== "number" ||
    !Number.isInteger(body.expected_destination_version) ||
    body.expected_destination_version < 1 ||
    typeof body.expected_preview_digest !== "string" ||
    !/^[a-f0-9]{64}$/.test(body.expected_preview_digest) ||
    typeof body.request_id !== "string" ||
    !validId(body.request_id) ||
    (body.capture_id !== undefined &&
      (typeof body.capture_id !== "string" || !validId(body.capture_id)))
  ) {
    return NextResponse.json({ code: "reversal_approval_invalid" }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await approveBackendEffectReversal(
        attemptId,
        {
          expected_destination_version: body.expected_destination_version,
          expected_preview_digest: body.expected_preview_digest,
          reason: body.reason.trim(),
          request_id: body.request_id,
        },
        typeof body.capture_id === "string" ? body.capture_id : undefined,
      ),
    );
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json({ code: "reversal_approval_failed" }, { status: 503 });
  }
}
