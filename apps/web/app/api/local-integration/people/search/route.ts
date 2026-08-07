import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { isAllowedMutationOrigin } from "@/lib/request-origin";
import {
  isIntegrationMode,
  searchPeopleDirectory,
} from "@/lib/server/localBackend";

export const dynamic = "force-dynamic";

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: NextRequest) {
  if (!isIntegrationMode()) {
    return response({ code: "local_integration_disabled" }, 404);
  }
  const session = await auth();
  if (!session?.user) {
    return response({ code: "authentication_required" }, 401);
  }
  if (!isAllowedMutationOrigin(request.headers)) {
    return response({ code: "origin_not_allowed" }, 403);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return response({ code: "people_search_invalid" }, 400);
  }
  const query =
    typeof body === "object" &&
    body !== null &&
    "query" in body &&
    typeof body.query === "string"
      ? body.query.normalize("NFKC").trim()
      : "";
  if (!query || query.length > 500) {
    return response({ code: "people_search_invalid" }, 400);
  }
  try {
    return response(await searchPeopleDirectory(query));
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return response(
        { code: error.code, message: error.message },
        error.status,
      );
    }
    return response({ code: "people_directory_unavailable" }, 503);
  }
}
