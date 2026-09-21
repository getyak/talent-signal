import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({ claims: vi.fn(), origin: vi.fn() }));

vi.mock("@/lib/server/backendAuth", () => ({
  readBackendSessionClaims: mocked.claims,
  backendAuthBaseUrl: () => "http://127.0.0.1:4317",
  authSecret: () => "synthetic-test-secret",
}));

vi.mock("@/lib/request-origin", () => ({ isAllowedMutationOrigin: mocked.origin }));

import { contactHandoffSessionVersion } from "@/lib/server/contact-handoff-session";
import { BackendSessionExpiredError } from "@/lib/backend-session";
import { POST } from "./route";

const claims = {
  backendAccountId: "account-a",
  backendUserId: "user-a",
  backendAccessToken: "synthetic-token-a",
  backendExpiresAt: "2099-01-01T00:00:00Z",
  backendAccountName: "a",
  backendAccountSlug: "a",
  backendRole: "member" as const,
  backendUsername: null,
};

const bindingValue = contactHandoffSessionVersion(claims);
const validBody = { messages: [{ role: "user", content: "hi" }] };

interface RequestOptions {
  body?: unknown;
  raw?: string;
  binding?: string | null;
  contentType?: string | null;
  signal?: AbortSignal;
  workspace?: string;
}

function request(options: RequestOptions = {}): Request {
  const headers: Record<string, string> = {"x-talent-signal-workspace": options.workspace ?? claims.backendAccountId};
  const contentType = options.contentType === undefined ? "application/json" : options.contentType;
  if (contentType) headers["Content-Type"] = contentType;
  const binding = options.binding === undefined ? bindingValue : options.binding;
  if (binding) headers["x-workspace-session"] = binding;
  const body = options.raw !== undefined ? options.raw : JSON.stringify(options.body ?? validBody);
  return new Request("http://localhost/api/private-conversation", {
    method: "POST",
    headers,
    body,
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

function streamedResponse(chunks: readonly string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "application/x-ndjson" } },
  );
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mocked.origin.mockReturnValue(true);
  mocked.claims.mockResolvedValue(claims);
  fetchMock.mockResolvedValue(streamedResponse(['{"type":"text","text":"hi"}\n', '{"type":"done"}\n']));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("rejects a cross-origin write before authenticating or reading messages", async () => {
  mocked.origin.mockReturnValue(false);
  const response = await POST(request());
  expect(response.status).toBe(403);
  expect(mocked.claims).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("requires the JSON content type before authentication", async () => {
  const response = await POST(request({ contentType: "text/plain" }));
  expect(response.status).toBe(415);
  expect(mocked.claims).not.toHaveBeenCalled();
});

it("requires an authenticated and unexpired backend session", async () => {
  mocked.claims.mockResolvedValue(null);
  expect((await POST(request())).status).toBe(401);
  mocked.claims.mockResolvedValue({ ...claims, backendExpiresAt: "2020-01-01T00:00:00Z" });
  const expired = await POST(request());
  expect(expired.status).toBe(401);
  expect(JSON.parse(await expired.text()).error.code).toBe("backend_session_expired");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("rejects a stale workspace login before reading messages", async () => {
  mocked.claims.mockResolvedValue({ ...claims, backendAccessToken: "new-login-token" });
  const response = await POST(request());
  expect(response.status).toBe(409);
  expect(JSON.parse(await response.text()).error.code).toBe("session_stale");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("recovers from a bound workspace login that is no longer current", async () => {
  mocked.claims.mockRejectedValue(new BackendSessionExpiredError());
  const response = await POST(request());
  expect(response.status).toBe(401);
  expect(JSON.parse(await response.text()).error.code).toBe("backend_session_expired");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("bounds the request bytes before any parsing or upstream access", async () => {
  const response = await POST(request({ raw: "x".repeat(300 * 1024) }));
  expect(response.status).toBe(413);
  expect(JSON.parse(await response.text()).error.code).toBe("private_conversation_too_large");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("proxies the raw NDJSON stream with no-store and no buffering", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("application/x-ndjson");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(await response.text()).toBe('{"type":"text","text":"hi"}\n{"type":"done"}\n');
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(url).toBe("http://127.0.0.1:4317/v1/private-conversation");
  const headers = init.headers as Record<string, string>;
  expect(headers.authorization).toBe("Bearer synthetic-token-a");
  expect(init.body).toBe(JSON.stringify(validBody));
});

it("sanitizes a backend error and preserves its status and code", async () => {
  fetchMock.mockResolvedValue(
    Response.json(
      { error: { code: "PRIVATE_CONVERSATION_RATE_LIMITED", message: "provider prose" } },
      { status: 429 },
    ),
  );
  const response = await POST(request());
  expect(response.status).toBe(429);
  const payload = await response.json();
  expect(payload.error.code).toBe("PRIVATE_CONVERSATION_RATE_LIMITED");
  expect(JSON.stringify(payload)).not.toContain("provider prose");
});

it("never forwards an unsanitized upstream error code", async () => {
  fetchMock.mockResolvedValue(
    Response.json({ error: { code: "bad code with spaces" } }, { status: 503 }),
  );
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect((await response.json()).error.code).toBe("private_conversation_unavailable");
});

it("forwards the request abort signal to the backend", async () => {
  let receivedSignal: AbortSignal | undefined;
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
    receivedSignal = init?.signal ?? undefined;
    return streamedResponse(['{"type":"done"}\n']);
  });
  const controller = new AbortController();
  const response = await POST(request({ signal: controller.signal }));
  expect(response.status).toBe(200);
  expect(receivedSignal).toBeDefined();
  expect(receivedSignal?.aborted).toBe(false);
  controller.abort();
  expect(receivedSignal?.aborted).toBe(true);
});

it("reports a sanitized 503 when the backend is unreachable", async () => {
  fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
  const response = await POST(request());
  expect(response.status).toBe(503);
  const payload = await response.json();
  expect(payload.error.code).toBe("private_conversation_unavailable");
  expect(JSON.stringify(payload)).not.toContain("ECONNREFUSED");
});


it("rejects another workspace header even if a login binding is supplied", async()=>{
  const response=await POST(request({workspace:"different-account"}));
  expect(response.status).toBe(409);
  expect(fetchMock).not.toHaveBeenCalled();
});
