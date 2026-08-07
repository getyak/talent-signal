import {
  TalentSignalHttpError,
  type EvidenceFragmentReviewRequest,
} from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { isAllowedMutationOrigin } from "@/lib/request-origin";
import {
  isIntegrationMode,
  reviewRelationshipEvidence,
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
  context: { params: Promise<{ fragmentId: string }> },
) {
  if (!isIntegrationMode()) {
    return response({ code: "local_integration_disabled" }, 404);
  }
  const session = await auth();
  if (!session?.user) {
    return response({ code: "authentication_required" }, 401);
  }
  if (!isAllowedMutationOrigin(request.headers)) {
    return response({ code: "cross_origin_review_denied" }, 403);
  }
  const { fragmentId } = await context.params;
  if (!UUID.test(fragmentId)) {
    return response({ code: "fragment_id_invalid" }, 400);
  }
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    return response({ code: "review_content_type_invalid" }, 415);
  }

  try {
    const body =
      (await request.json()) as EvidenceFragmentReviewRequest;
    return response(
      await reviewRelationshipEvidence(fragmentId, body),
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
        code: "evidence_review_failed",
        message: "The evidence review could not be saved.",
      },
      422,
    );
  }
}
