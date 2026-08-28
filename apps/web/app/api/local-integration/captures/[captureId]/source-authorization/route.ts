import type { SourceAuthorizationDecisionRequest } from "@talent-signal/contracts";
import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { isAllowedMutationOrigin } from "@/lib/request-origin";
import {
  decideRelationshipSourceAuthorization,
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

const REQUEST_KEYS = new Set([
  "authorization_expires_at",
  "decision",
  "expected_capture_version",
  "idempotency_key",
  "reason",
]);

class InvalidSourceAuthorizationRequest extends Error {}

function parseBody(value: unknown): SourceAuthorizationDecisionRequest {
  if (typeof value !== "object" || value === null) {
    throw new InvalidSourceAuthorizationRequest();
  }
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !REQUEST_KEYS.has(key))) {
    throw new InvalidSourceAuthorizationRequest();
  }
  const authorizationExpiryValid =
    body.authorization_expires_at === undefined ||
    (body.decision === "restore" &&
      typeof body.authorization_expires_at === "string" &&
      Number.isFinite(
        new Date(body.authorization_expires_at).getTime(),
      ));
  if (
    !UUID.test(String(body.idempotency_key ?? "")) ||
    !Number.isInteger(body.expected_capture_version) ||
    Number(body.expected_capture_version) < 1 ||
    (body.decision !== "revoke" && body.decision !== "restore") ||
    typeof body.reason !== "string" ||
    body.reason.trim().length === 0 ||
    body.reason.length > 500 ||
    !authorizationExpiryValid
  ) {
    throw new InvalidSourceAuthorizationRequest();
  }
  return {
    idempotency_key: String(body.idempotency_key),
    expected_capture_version: Number(body.expected_capture_version),
    decision: body.decision,
    reason: body.reason.trim(),
    ...(body.authorization_expires_at === undefined
      ? {}
      : { authorization_expires_at: String(body.authorization_expires_at) }),
  };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ captureId: string }> },
) {
  if (!isIntegrationMode()) {
    return response({ code: "local_integration_disabled" }, 404);
  }
  const session = await auth();
  if (!session?.user) {
    return response({ code: "authentication_required" }, 401);
  }
  if (!isAllowedMutationOrigin(request.headers)) {
    return response(
      { code: "cross_origin_source_authorization_denied" },
      403,
    );
  }
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    return response(
      { code: "source_authorization_content_type_invalid" },
      415,
    );
  }
  const { captureId } = await context.params;
  if (!UUID.test(captureId)) {
    return response({ code: "capture_id_invalid" }, 400);
  }
  try {
    const body = parseBody(await request.json());
    return response(
      await decideRelationshipSourceAuthorization(captureId, body),
      201,
    );
  } catch (error) {
    if (error instanceof InvalidSourceAuthorizationRequest) {
      return response({ code: "source_authorization_invalid" }, 400);
    }
    if (error instanceof TalentSignalHttpError) {
      return response(
        { code: error.code, message: error.message },
        error.status,
      );
    }
    return response(
      {
        code: "source_authorization_failed",
        message:
          "The source authorization could not be changed. Review its current state and try again.",
      },
      422,
    );
  }
}
