import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { isAllowedMutationOrigin } from "@/lib/request-origin";
import {
  getLatestRelationshipResearch,
  isIntegrationMode,
  runRelationshipResearch,
  type RunRelationshipResearchInput,
} from "@/lib/server/localBackend";

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: Request) {
  if (!isIntegrationMode()) {
    return response({ code: "local_integration_disabled" }, 404);
  }
  const session = await auth();
  if (!session?.user) {
    return response({ code: "authentication_required" }, 401);
  }
  const seedResourceId = new URL(request.url).searchParams.get(
    "seed_resource_id",
  );
  if (!seedResourceId) {
    return response({ code: "seed_resource_id_required" }, 400);
  }
  try {
    return response(
      await getLatestRelationshipResearch(seedResourceId),
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
        code: "public_research_status_failed",
        message:
          error instanceof Error
            ? error.message
            : "无法恢复此前的公开研究状态。",
      },
      503,
    );
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
    return response({ code: "cross_origin_research_denied" }, 403);
  }
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    return response({ code: "research_content_type_invalid" }, 415);
  }

  let body: RunRelationshipResearchInput;
  try {
    body = (await request.json()) as RunRelationshipResearchInput;
  } catch {
    return response({ code: "research_request_invalid" }, 400);
  }
  try {
    const result = await runRelationshipResearch(body);
    return response(result, result.status === "running" ? 202 : 201);
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return response(
        { code: error.code, message: error.message },
        error.status,
      );
    }
    return response(
      {
        code: "public_research_failed",
        message:
          error instanceof Error
            ? error.message
            : "有边界的公开研究未能完成。",
      },
      503,
    );
  }
}
