import {
  TalentSignalHttpError,
  type PersonMergeRequest,
} from "@talent-signal/contracts";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { isAllowedMutationOrigin } from "@/lib/request-origin";
import {
  isIntegrationMode,
  mergeRelationshipPeople,
  previewRelationshipPersonMerge,
} from "@/lib/server/localBackend";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST = /^[a-f0-9]{64}$/;

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function validBody(value: unknown): value is PersonMergeRequest {
  if (!value || typeof value !== "object") {
    return false;
  }
  const body = value as Record<string, unknown>;
  return (
    UUID.test(String(body.idempotency_key ?? "")) &&
    UUID.test(String(body.source_person_id ?? "")) &&
    UUID.test(String(body.target_person_id ?? "")) &&
    body.source_person_id !== body.target_person_id &&
    Number.isInteger(body.expected_source_version) &&
    Number(body.expected_source_version) >= 1 &&
    Number.isInteger(body.expected_target_version) &&
    Number(body.expected_target_version) >= 1 &&
    DIGEST.test(String(body.expected_preview_digest ?? "")) &&
    body.decision === "merge_people" &&
    typeof body.reason === "string" &&
    body.reason.trim().length > 0 &&
    body.reason.length <= 500
  );
}

function errorResponse(error: unknown, fallback: string) {
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
      code: fallback,
      message:
        "The person merge could not be completed. Prior identity state remains unchanged.",
    },
    503,
  );
}

export async function GET(request: NextRequest) {
  if (!isIntegrationMode()) {
    return response({ code: "local_integration_disabled" }, 404);
  }
  const session = await auth();
  if (!session?.user) {
    return response({ code: "authentication_required" }, 401);
  }
  const sourcePersonId =
    request.nextUrl.searchParams.get("source_person_id") ?? "";
  const targetPersonId =
    request.nextUrl.searchParams.get("target_person_id") ?? "";
  if (
    !UUID.test(sourcePersonId) ||
    !UUID.test(targetPersonId) ||
    sourcePersonId === targetPersonId
  ) {
    return response({ code: "person_merge_scope_invalid" }, 400);
  }
  try {
    return response(
      await previewRelationshipPersonMerge(
        sourcePersonId,
        targetPersonId,
      ),
    );
  } catch (error) {
    return errorResponse(error, "person_merge_preview_unavailable");
  }
}

export async function POST(request: Request) {
  if (!isIntegrationMode()) {
    return response({ code: "local_integration_disabled" }, 404);
  }
  const session = await auth();
  if (!session?.user) {
    return response({ code: "authentication_required" }, 401);
  }
  if (!isAllowedMutationOrigin(request.headers)) {
    return response({ code: "cross_origin_person_merge_denied" }, 403);
  }
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    return response({ code: "person_merge_content_type_invalid" }, 415);
  }
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return response({ code: "person_merge_request_invalid" }, 400);
  }
  if (!validBody(value)) {
    return response({ code: "person_merge_request_invalid" }, 400);
  }
  try {
    return response(
      await mergeRelationshipPeople({
        ...value,
        reason: value.reason.trim(),
      }),
      201,
    );
  } catch (error) {
    return errorResponse(error, "person_merge_unavailable");
  }
}
