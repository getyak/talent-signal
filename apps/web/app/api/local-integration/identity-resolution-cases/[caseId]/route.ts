import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  isIntegrationMode,
  loadIdentityResolutionCase,
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

export async function GET(
  _request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  if (!isIntegrationMode()) {
    return response({ code: "local_integration_disabled" }, 404);
  }
  const session = await auth();
  if (!session?.user) {
    return response({ code: "authentication_required" }, 401);
  }
  const { caseId } = await context.params;
  if (!UUID.test(caseId)) {
    return response({ code: "identity_case_id_invalid" }, 400);
  }
  try {
    return response(await loadIdentityResolutionCase(caseId));
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return response(
        { code: error.code, message: error.message },
        error.status,
      );
    }
    return response({ code: "identity_case_unavailable" }, 503);
  }
}
