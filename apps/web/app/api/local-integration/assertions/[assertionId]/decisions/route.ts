import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  decideBackendAssertion,
  isIntegrationMode,
} from "@/lib/server/localBackend";

type DecisionBody = {
  capture_id?: string;
  decision?: "confirm" | "dismiss" | "leave_unresolved";
  corrected_value?: string;
  expected_assertion_version?: number;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ assertionId: string }> },
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
  const { assertionId } = await context.params;
  const body = (await request.json()) as DecisionBody;
  if (
    !/^[0-9a-f-]{36}$/i.test(assertionId) ||
    (body.capture_id !== undefined &&
      !/^[0-9a-f-]{36}$/i.test(body.capture_id)) ||
    !body.decision ||
    !Number.isInteger(body.expected_assertion_version) ||
    (body.corrected_value !== undefined &&
      (typeof body.corrected_value !== "string" ||
        body.corrected_value.trim().length === 0))
  ) {
    return NextResponse.json(
      { code: "decision_invalid" },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(
      await decideBackendAssertion(assertionId, {
        idempotency_key: `web:${assertionId}:${body.decision}:v${body.expected_assertion_version}`,
        expected_assertion_version: body.expected_assertion_version!,
        decision: body.decision,
        ...(body.corrected_value === undefined
          ? {}
          : { corrected_value: body.corrected_value.trim() }),
      }, body.capture_id),
    );
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { code: "decision_failed" },
      { status: 503 },
    );
  }
}
