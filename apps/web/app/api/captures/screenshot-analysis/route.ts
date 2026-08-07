import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  analyzeScreenshotWithArk,
  getArkAvailability,
} from "@/lib/server/ark";
import { isAllowedMutationOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_IMAGE_BYTES + 512 * 1024;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 6;
const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const attempts = new Map<string, { count: number; resetAt: number }>();

function noStoreHeaders() {
  return {
    "Cache-Control": "no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  };
}

function boundedFormText(
  value: FormDataEntryValue | null,
  maximum: number,
) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maximum
    ? normalized
    : null;
}

function rateLimitKey(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

function consumeRateLimit(request: NextRequest) {
  const now = Date.now();
  const key = rateLimitKey(request);
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return null;
  }
  if (current.count >= RATE_LIMIT_REQUESTS) {
    return Math.max(1, Math.ceil((current.resetAt - now) / 1_000));
  }
  current.count += 1;
  return null;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Sign in before analyzing candidate evidence." },
      { status: 401, headers: noStoreHeaders() },
    );
  }
  if (!isAllowedMutationOrigin(request.headers)) {
    return NextResponse.json(
      { error: "Cross-origin screenshot analysis is not allowed." },
      { status: 403, headers: noStoreHeaders() },
    );
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_REQUEST_BYTES
  ) {
    return NextResponse.json(
      { error: "The screenshot request is larger than 8 MB." },
      { status: 413, headers: noStoreHeaders() },
    );
  }
  const retryAfter = consumeRateLimit(request);
  if (retryAfter !== null) {
    return NextResponse.json(
      {
        error:
          "Screenshot analysis is temporarily rate limited. Try again shortly.",
        code: "rate_limited",
      },
      {
        status: 429,
        headers: {
          ...noStoreHeaders(),
          "Retry-After": String(retryAfter),
        },
      },
    );
  }
  if (!getArkAvailability().enabled) {
    return NextResponse.json(
      {
        error:
          "Screenshot analysis is not configured. Add the server-side Ark key and enable private AI processing.",
        code: "provider_unavailable",
      },
      { status: 503, headers: noStoreHeaders() },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "The screenshot form could not be read." },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  const image = formData.get("image");
  const contactName = boundedFormText(formData.get("contactName"), 160);
  const assignmentLabel = boundedFormText(
    formData.get("assignmentLabel"),
    200,
  );
  if (
    !(image instanceof File) ||
    !contactName ||
    !assignmentLabel ||
    !ACCEPTED_IMAGE_TYPES.has(image.type) ||
    image.size <= 0 ||
    image.size > MAX_IMAGE_BYTES
  ) {
    return NextResponse.json(
      {
        error:
          "Choose a JPEG, PNG, or WebP screenshot under 8 MB and add the contact and relationship context.",
      },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  try {
    const analysis = await analyzeScreenshotWithArk({
      bytes: new Uint8Array(await image.arrayBuffer()),
      mimeType: image.type as "image/jpeg" | "image/png" | "image/webp",
      contactName,
      assignmentLabel,
    });
    return NextResponse.json(analysis, { headers: noStoreHeaders() });
  } catch {
    return NextResponse.json(
      {
        error:
          "The private screenshot analysis could not complete. The source was not saved by Talent Signal.",
        code: "analysis_failed",
      },
      { status: 502, headers: noStoreHeaders() },
    );
  }
}
