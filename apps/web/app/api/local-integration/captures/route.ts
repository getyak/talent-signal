import { TalentSignalHttpError } from "@talent-signal/contracts";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  commitScreenshotCapture,
  isIntegrationMode,
  type CommitScreenshotCaptureInput,
} from "@/lib/server/localBackend";
import { isAllowedMutationOrigin } from "@/lib/request-origin";

const MAX_COMMIT_BYTES = 512 * 1024;

function response(
  body: unknown,
  init: { status?: number } = {},
) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: Request) {
  if (!isIntegrationMode()) {
    return response(
      { code: "local_integration_disabled" },
      { status: 404 },
    );
  }
  const session = await auth();
  if (!session?.user) {
    return response(
      { code: "authentication_required" },
      { status: 401 },
    );
  }
  if (!isAllowedMutationOrigin(request.headers)) {
    return response(
      { code: "cross_origin_commit_denied" },
      { status: 403 },
    );
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_COMMIT_BYTES
  ) {
    return response(
      { code: "capture_too_large" },
      { status: 413 },
    );
  }
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    return response(
      { code: "capture_content_type_invalid" },
      { status: 415 },
    );
  }

  let body: CommitScreenshotCaptureInput;
  try {
    body = (await request.json()) as CommitScreenshotCaptureInput;
  } catch {
    return response(
      { code: "capture_invalid" },
      { status: 400 },
    );
  }

  try {
    return response(await commitScreenshotCapture(body));
  } catch (error) {
    if (error instanceof TalentSignalHttpError) {
      return response(
        { code: error.code, message: error.message },
        { status: error.status },
      );
    }
    return response(
      {
        code: "capture_commit_failed",
        message:
          "The reviewed screenshot could not be committed. No canonical state is claimed.",
      },
      { status: 503 },
    );
  }
}
