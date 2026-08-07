import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  askRelationshipChat,
  isIntegrationMode,
  type AskRelationshipChatInput,
} from "@/lib/server/localBackend";
import { isAllowedMutationOrigin } from "@/lib/request-origin";

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
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
    return response({ code: "cross_origin_chat_denied" }, 403);
  }
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    return response({ code: "chat_content_type_invalid" }, 415);
  }

  let body: AskRelationshipChatInput;
  try {
    body = (await request.json()) as AskRelationshipChatInput;
  } catch {
    return response({ code: "chat_request_invalid" }, 400);
  }
  try {
    return response(await askRelationshipChat(body));
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return response(
        { code: error.code, message: error.message },
        error.status,
      );
    }
    return response(
      {
        code: "chat_task_failed",
        message:
          "The brief could not be compiled. Prior reviewed state remains unchanged.",
      },
      503,
    );
  }
}
