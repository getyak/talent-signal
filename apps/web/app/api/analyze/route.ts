import { NextRequest, NextResponse } from "next/server";
import {
  analyzeWithAi,
  getAiAvailability,
} from "@/lib/server/ai-analysis";

export const runtime = "nodejs";

const MAX_CONVERSATION_LENGTH = 12_000;
const MAX_CONTEXT_LENGTH = 300;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 8;
const attempts = new Map<string, { count: number; resetAt: number }>();

function noStoreHeaders() {
  return {
    "Cache-Control": "no-store, max-age=0",
  };
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || process.env.NODE_ENV !== "production") {
    return true;
  }

  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

function consumeRateLimit(identifier: string) {
  const now = Date.now();
  const current = attempts.get(identifier);
  if (!current || current.resetAt <= now) {
    attempts.set(identifier, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return true;
  }

  if (current.count >= RATE_LIMIT_REQUESTS) {
    return false;
  }

  current.count += 1;
  return true;
}

function parseRequestBody(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const body = value as Record<string, unknown>;
  if (
    typeof body.conversation !== "string" ||
    body.conversation.trim().length === 0 ||
    body.conversation.length > MAX_CONVERSATION_LENGTH ||
    typeof body.candidateContext !== "string" ||
    body.candidateContext.length > MAX_CONTEXT_LENGTH ||
    body.sourceSpeaker !== "candidate"
  ) {
    return null;
  }

  return {
    conversation: body.conversation.trim(),
    candidateContext: body.candidateContext.trim(),
    sourceSpeaker: "candidate" as const,
  };
}

export async function POST(request: NextRequest) {
  if (!getAiAvailability().enabled) {
    return NextResponse.json(
      { error: "AI 分析当前不可用。" },
      { status: 503, headers: noStoreHeaders() },
    );
  }

  if (!sameOrigin(request)) {
    return NextResponse.json(
      { error: "不允许跨源请求。" },
      { status: 403, headers: noStoreHeaders() },
    );
  }

  const identifier =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "local";
  if (!consumeRateLimit(identifier)) {
    return NextResponse.json(
      { error: "分析请求过多，请稍后重试。" },
      { status: 429, headers: noStoreHeaders() },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "JSON 请求无效。" },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  const input = parseRequestBody(body);
  if (!input) {
    return NextResponse.json(
      { error: "请添加更短的对话与有效的候选人背景。" },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  try {
    const analysis = await analyzeWithAi(
      input.conversation,
      input.candidateContext,
      input.sourceSpeaker,
    );
    return NextResponse.json(analysis, {
      headers: noStoreHeaders(),
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "The private analysis route could not complete. The note was not saved.",
      },
      { status: 502, headers: noStoreHeaders() },
    );
  }
}
