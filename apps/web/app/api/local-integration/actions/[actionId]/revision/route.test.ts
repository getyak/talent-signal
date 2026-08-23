import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, isIntegrationModeMock, reviseActionMock } = vi.hoisted(
  () => ({
    authMock: vi.fn(),
    isIntegrationModeMock: vi.fn(),
    reviseActionMock: vi.fn(),
  }),
);

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/server/localBackend", () => ({
  isIntegrationMode: isIntegrationModeMock,
  reviseBackendActionForEvaluation: reviseActionMock,
}));

import { POST } from "./route";

const ACTION_ID = "11111111-1111-4111-8111-111111111111";
const CAPTURE_ID = "22222222-2222-4222-8222-222222222222";

function request(body: unknown) {
  return new Request(
    `http://127.0.0.1:3000/api/local-integration/actions/${ACTION_ID}/revision`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function context(actionId = ACTION_ID) {
  return { params: Promise.resolve({ actionId }) };
}

describe("action revision route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isIntegrationModeMock.mockReturnValue(true);
    authMock.mockResolvedValue({ user: { id: "recruiter" } });
    reviseActionMock.mockResolvedValue({ contract_version: "2026-08-07.1" });
  });

  it("reads back the exact non-default capture after revision", async () => {
    const result = await POST(
      request({ capture_id: CAPTURE_ID, variant: "stale_approval" }),
      context(),
    );

    expect(result.status).toBe(200);
    expect(reviseActionMock).toHaveBeenCalledWith(
      ACTION_ID,
      "stale_approval",
      CAPTURE_ID,
    );
  });

  it("rejects malformed capture identifiers", async () => {
    const result = await POST(
      request({ capture_id: "not-a-capture", variant: "stale_approval" }),
      context(),
    );

    expect(result.status).toBe(400);
    await expect(result.json()).resolves.toEqual({ code: "capture_invalid" });
    expect(reviseActionMock).not.toHaveBeenCalled();
  });
});
