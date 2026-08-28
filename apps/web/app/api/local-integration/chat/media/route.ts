import {
  TalentSignalHttpError,
  type ChatMediaAsset,
} from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  isIntegrationMode,
  uploadRelationshipChatMedia,
} from "@/lib/server/localBackend";
import { isAllowedMutationOrigin } from "@/lib/request-origin";

const ALLOWED_MEDIA_TYPES = new Set<ChatMediaAsset["media_type"]>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  if (!isIntegrationMode()) return response({ code: "local_integration_disabled" }, 404);
  const session = await auth();
  if (!session?.user) return response({ code: "authentication_required" }, 401);
  if (!isAllowedMutationOrigin(request.headers)) return response({ code: "cross_origin_media_denied" }, 403);

  try {
    const form = await request.formData();
    const file = form.get("file");
    const requestId = String(form.get("request_id") ?? "");
    const personId = String(form.get("person_id") ?? "");
    const relationshipContextId = String(form.get("relationship_context_id") ?? "");
    if (
      !(file instanceof File) ||
      !UUID.test(requestId) ||
      !UUID.test(personId) ||
      !UUID.test(relationshipContextId) ||
      !ALLOWED_MEDIA_TYPES.has(file.type as ChatMediaAsset["media_type"]) ||
      file.size < 1 ||
      file.size > 8 * 1024 * 1024
    ) {
      return response({ code: "chat_media_request_invalid", message: "Choose a supported image up to 8 MB." }, 400);
    }
    return response(
      await uploadRelationshipChatMedia({
        request_id: requestId,
        person_id: personId,
        relationship_context_id: relationshipContextId,
        file_name: file.name,
        media_type: file.type as ChatMediaAsset["media_type"],
        bytes: new Uint8Array(await file.arrayBuffer()),
      }),
      201,
    );
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return response({ code: error.code, message: error.message }, error.status);
    }
    return response(
      {
        code: "chat_media_upload_failed",
        message: error instanceof Error ? error.message : "The image could not be uploaded.",
      },
      503,
    );
  }
}
