import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  deleteRelationshipChatMedia,
  isIntegrationMode,
  readRelationshipChatMedia,
} from "@/lib/server/localBackend";
import { isAllowedMutationOrigin } from "@/lib/request-origin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

async function authorizedMediaId(
  context: { params: Promise<{ mediaId: string }> },
): Promise<string | null> {
  const session = await auth();
  if (!session?.user) return null;
  const { mediaId } = await context.params;
  return UUID.test(mediaId) ? mediaId : null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ mediaId: string }> },
) {
  if (!isIntegrationMode()) return json({ code: "local_integration_disabled" }, 404);
  const mediaId = await authorizedMediaId(context);
  if (!mediaId) return json({ code: "chat_media_unavailable" }, 401);
  try {
    const upstream = await readRelationshipChatMedia(mediaId);
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Cache-Control": "private, max-age=300",
        "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return json({ code: error.code, message: error.message }, error.status);
    }
    return json({ code: "chat_media_unavailable" }, 503);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ mediaId: string }> },
) {
  if (!isIntegrationMode()) return json({ code: "local_integration_disabled" }, 404);
  if (!isAllowedMutationOrigin(request.headers)) return json({ code: "cross_origin_media_denied" }, 403);
  const mediaId = await authorizedMediaId(context);
  if (!mediaId) return json({ code: "chat_media_unavailable" }, 401);
  try {
    return json(await deleteRelationshipChatMedia(mediaId));
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return json({ code: error.code, message: error.message }, error.status);
    }
    return json({ code: "chat_media_delete_failed" }, 503);
  }
}
