import { NextRequest, NextResponse } from "next/server";

import { backendAuthBaseUrl } from "@/lib/server/backendAuth";
import {
  McpBodyError,
  readBoundedRequestBody,
} from "@/lib/server/mcpBoundedBody";

/**
 * Published, same-origin Streamable HTTP MCP endpoint.
 *
 * External clients authenticate with their own scoped bearer token. Browser
 * login cookies are never attached, and the incoming Origin must match the
 * configured public origin exactly. Only the MCP transport headers cross the
 * proxy boundary, under a bounded total deadline.
 */
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 128 * 1024;
const MCP_PUBLIC_TIMEOUT_MS = 15_000;

/**
 * Only a bare HTTPS origin, or an HTTP loopback origin for local development.
 * Userinfo, path, query, and fragment are rejected so a request Host header or
 * a misconfigured value can never redirect the published endpoint.
 */
function configuredPublicOrigin(): string | null {
  const raw = process.env.TALENT_SIGNAL_MCP_PUBLIC_ORIGIN?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (
      parsed.origin === "null" ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname.replace(/\/+$/u, "") !== ""
    ) {
      return null;
    }
    const loopback =
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "localhost" ||
      parsed.hostname === "[::1]";
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function jsonError(code: number, message: string, status: number, headers: Record<string, string> = {}) {
  return NextResponse.json(
    { error: { code, message }, id: null, jsonrpc: "2.0" },
    {
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json",
        "x-content-type-options": "nosniff",
        ...headers,
      },
      status,
    },
  );
}

async function boundedBody(request: NextRequest): Promise<string | null> {
  return await readBoundedRequestBody(request, MAX_BODY_BYTES);
}

export async function GET() {
  return jsonError(
    -32000,
    "This MCP server does not offer a GET stream.",
    405,
    { allow: "POST" },
  );
}

export async function POST(request: NextRequest) {
  const publicOrigin = configuredPublicOrigin();
  if (!publicOrigin) {
    return jsonError(
      -32000,
      "The MCP endpoint is not configured for this deployment.",
      503,
    );
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== publicOrigin) {
    return jsonError(-32000, "Origin not allowed.", 403);
  }
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return jsonError(-32001, "Unauthorized.", 401, {
      "www-authenticate": "Bearer",
    });
  }
  let body: string | null;
  try {
    body = await boundedBody(request);
  } catch (error) {
    if (error instanceof McpBodyError && error.failure === "too_large") {
      return jsonError(-32000, "Request body too large.", 413);
    }
    return jsonError(-32000, "Request body timed out.", 408);
  }
  const upstreamHeaders: Record<string, string> = {
    accept:
      request.headers.get("accept") ?? "application/json, text/event-stream",
    authorization,
    "content-type": request.headers.get("content-type") ?? "application/json",
  };
  for (const name of ["mcp-session-id", "mcp-protocol-version"]) {
    const value = request.headers.get(name);
    if (value) upstreamHeaders[name] = value;
  }
  if (origin) upstreamHeaders.origin = origin;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MCP_PUBLIC_TIMEOUT_MS);
  try {
    const upstream = await fetch(`${backendAuthBaseUrl()}/v1/mcp`, {
      body: body ?? undefined,
      cache: "no-store",
      headers: upstreamHeaders,
      method: "POST",
      signal: controller.signal,
    });
    const responseHeaders: Record<string, string> = {
      "cache-control": "no-store",
      "content-type":
        upstream.headers.get("content-type") ?? "application/json",
      "x-content-type-options": "nosniff",
    };
    for (const name of ["www-authenticate", "allow"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders[name] = value;
    }
    // Reading the body under the same signal bounds a stalled stream.
    const text = await upstream.text();
    return new NextResponse(text || null, {
      headers: responseHeaders,
      status: upstream.status,
    });
  } catch {
    if (controller.signal.aborted) {
      return jsonError(-32000, "The MCP endpoint timed out.", 504);
    }
    return jsonError(-32000, "The MCP endpoint is temporarily unavailable.", 503);
  } finally {
    clearTimeout(timer);
  }
}
