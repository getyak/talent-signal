import {
  TalentSignalHttpError,
  type PersonMergeReversalRequest,
} from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { isAllowedMutationOrigin } from "@/lib/request-origin";
import {
  isIntegrationMode,
  loadPersonMergeReversalPreview,
  reverseRelationshipPersonMerge,
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

function validBody(
  value: unknown,
): value is PersonMergeReversalRequest {
  if (!value || typeof value !== "object") {
    return false;
  }
  const body = value as Record<string, unknown>;
  return (
    UUID.test(String(body.idempotency_key ?? "")) &&
    body.decision === "reverse_person_merge" &&
    typeof body.reason === "string" &&
    body.reason.trim().length > 0 &&
    body.reason.length <= 500
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ operationId: string }> },
) {
  if (!isIntegrationMode()) {
    return response({ code: "local_integration_disabled" }, 404);
  }
  const session = await auth();
  if (!session?.user) {
    return response({ code: "authentication_required" }, 401);
  }
  const { operationId } = await context.params;
  if (!UUID.test(operationId)) {
    return response({ code: "person_merge_operation_invalid" }, 400);
  }
  try {
    return response(
      await loadPersonMergeReversalPreview(operationId),
    );
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return response(
        {
          code: error.code,
          message: error.message,
          details: error.details,
        },
        error.status,
      );
    }
    return response(
      {
        code: "person_merge_reversal_preview_unavailable",
        message:
          "The merge history could not be reopened for reversal review.",
      },
      503,
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ operationId: string }> },
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
      { code: "cross_origin_person_merge_reversal_denied" },
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
      { code: "person_merge_reversal_content_type_invalid" },
      415,
    );
  }
  const { operationId } = await context.params;
  if (!UUID.test(operationId)) {
    return response({ code: "person_merge_operation_invalid" }, 400);
  }
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return response({ code: "person_merge_reversal_invalid" }, 400);
  }
  if (!validBody(value)) {
    return response({ code: "person_merge_reversal_invalid" }, 400);
  }
  try {
    return response(
      await reverseRelationshipPersonMerge(operationId, {
        ...value,
        reason: value.reason.trim(),
      }),
      201,
    );
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return response(
        {
          code: error.code,
          message: error.message,
          details: error.details,
        },
        error.status,
      );
    }
    return response(
      {
        code: "person_merge_reversal_unavailable",
        message:
          "The person merge could not be reversed. The applied merge remains unchanged.",
      },
      503,
    );
  }
}
