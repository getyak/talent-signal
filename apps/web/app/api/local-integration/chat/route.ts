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
        {
          code: error.code,
          message: error.code === "CHAT_COMPLETION_SOURCE_CHANGED"
            ? "生成期间的来源依据已变化，本次结果未被采用。请刷新当前来源后重试。"
            : error.message,
        },
        error.status,
      );
    }
    return response(
      {
        code: "chat_task_failed",
        message:
          "这次未能整理简报，先前已审阅的状态仍保留。请稍后重试。",
      },
      503,
    );
  }
}
