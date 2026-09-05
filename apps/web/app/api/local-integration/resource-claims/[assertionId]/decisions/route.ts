import {
  TalentSignalHttpError,
  type AssertionDecisionRequest,
} from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { isAllowedMutationOrigin } from "@/lib/request-origin";
import {
  decideRelationshipClaim,
  isIntegrationMode,
} from "@/lib/server/localBackend";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ assertionId: string }> },
) {
  if (!isIntegrationMode()) {
    return response({ code: "local_integration_disabled" }, 404);
  }
  const session = await auth();
  if (!session?.user) {
    return response({ code: "authentication_required" }, 401);
  }
  if (!isAllowedMutationOrigin(request.headers)) {
    return response({ code: "cross_origin_claim_decision_denied" }, 403);
  }
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    return response({ code: "claim_decision_content_type_invalid" }, 415);
  }
  const { assertionId } = await context.params;
  if (!UUID.test(assertionId)) {
    return response({ code: "assertion_id_invalid" }, 400);
  }

  try {
    const body = (await request.json()) as Partial<AssertionDecisionRequest>;
    if (
      !UUID.test(body.idempotency_key ?? "") ||
      !["confirm", "dismiss", "leave_unresolved"].includes(
        body.decision ?? "",
      ) ||
      !Number.isInteger(body.expected_assertion_version) ||
      (body.expected_review_token !== undefined &&
        (typeof body.expected_review_token !== "string" || !/^[a-f0-9]{64}$/.test(body.expected_review_token))) ||
      (body.corrected_value !== undefined &&
        (typeof body.corrected_value !== "string" ||
          body.corrected_value.trim().length === 0 ||
          body.corrected_value.length > 2_000))
    ) {
      return response({ code: "claim_decision_invalid" }, 400);
    }
    return response(
      await decideRelationshipClaim(assertionId, {
        idempotency_key: body.idempotency_key!,
        decision: body.decision!,
        expected_assertion_version: body.expected_assertion_version!,
        ...(body.expected_review_token ? { expected_review_token: body.expected_review_token } : {}),
        ...(body.corrected_value
          ? { corrected_value: body.corrected_value.trim() }
          : {}),
      }),
      201,
    );
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return response(
        { code: error.code, message: error.message },
        error.status,
      );
    }
    return response(
      {
        code: "claim_decision_failed",
        message: "无法保存事实决定。",
      },
      422,
    );
  }
}
