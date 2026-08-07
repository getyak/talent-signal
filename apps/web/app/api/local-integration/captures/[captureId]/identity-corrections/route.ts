import type { CaptureIdentityCorrectionRequest } from "@talent-signal/contracts";
import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { isAllowedMutationOrigin } from "@/lib/request-origin";
import {
  correctRelationshipResourceIdentity,
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

function validRelationshipContext(
  value: unknown,
): value is CaptureIdentityCorrectionRequest["target"]["relationship_context"] {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const context = value as Record<string, unknown>;
  if (context.status === "existing") {
    return UUID.test(String(context.relationship_context_id ?? ""));
  }
  return (
    context.status === "proposed" &&
    typeof context.label === "string" &&
    context.label.trim().length > 0 &&
    context.label.length <= 200 &&
    typeof context.purpose === "string" &&
    context.purpose.trim().length > 0 &&
    context.purpose.length <= 240
  );
}

function validBody(
  value: unknown,
): value is CaptureIdentityCorrectionRequest {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const body = value as Record<string, unknown>;
  if (
    !UUID.test(String(body.idempotency_key ?? "")) ||
    !Number.isInteger(body.expected_capture_version) ||
    Number(body.expected_capture_version) < 1 ||
    !UUID.test(String(body.expected_person_id ?? "")) ||
    !UUID.test(String(body.expected_relationship_context_id ?? "")) ||
    typeof body.reason !== "string" ||
    body.reason.trim().length === 0 ||
    body.reason.length > 500 ||
    typeof body.binding_basis !== "string" ||
    body.binding_basis.trim().length === 0 ||
    body.binding_basis.length > 500 ||
    typeof body.target !== "object" ||
    body.target === null
  ) {
    return false;
  }
  const target = body.target as Record<string, unknown>;
  if (!validRelationshipContext(target.relationship_context)) {
    return false;
  }
  if (target.status === "existing_person") {
    return UUID.test(String(target.person_id ?? ""));
  }
  return (
    target.status === "new_person" &&
    typeof target.display_label === "string" &&
    target.display_label.trim().length > 0 &&
    target.display_label.length <= 200 &&
    target.relationship_context.status === "proposed"
  );
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
      { code: "cross_origin_identity_correction_denied" },
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
      { code: "identity_correction_content_type_invalid" },
      415,
    );
  }
  const { captureId } = await context.params;
  if (!UUID.test(captureId)) {
    return response({ code: "capture_id_invalid" }, 400);
  }

  try {
    const body = await request.json();
    if (!validBody(body)) {
      return response({ code: "identity_correction_invalid" }, 400);
    }
    const normalized: CaptureIdentityCorrectionRequest =
      body.target.status === "existing_person"
        ? {
            ...body,
            reason: body.reason.trim(),
            binding_basis: body.binding_basis.trim(),
            target: {
              ...body.target,
              relationship_context:
                body.target.relationship_context.status === "existing"
                  ? body.target.relationship_context
                  : {
                      ...body.target.relationship_context,
                      label:
                        body.target.relationship_context.label.trim(),
                      purpose:
                        body.target.relationship_context.purpose.trim(),
                    },
            },
          }
        : {
            ...body,
            reason: body.reason.trim(),
            binding_basis: body.binding_basis.trim(),
            target: {
              ...body.target,
              display_label: body.target.display_label.trim(),
              relationship_context: {
                ...body.target.relationship_context,
                label: body.target.relationship_context.label.trim(),
                purpose:
                  body.target.relationship_context.purpose.trim(),
              },
            },
          };
    return response(
      await correctRelationshipResourceIdentity(captureId, normalized),
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
        code: "identity_correction_failed",
        message:
          "The source identity could not be corrected. Prior state remains unchanged.",
      },
      422,
    );
  }
}
