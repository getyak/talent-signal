import { beforeEach, describe, expect, it, vi } from "vitest";

const { approveMock, authMock, integrationMock, previewMock } = vi.hoisted(
  () => ({
    approveMock: vi.fn(),
    authMock: vi.fn(),
    integrationMock: vi.fn(),
    previewMock: vi.fn(),
  }),
);

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/server/localBackend", () => ({
  approveBackendEffectReversal: approveMock,
  isIntegrationMode: integrationMock,
  previewBackendEffectReversal: previewMock,
}));

import { GET, POST } from "./route";

const ATTEMPT_ID = "11111111-1111-4111-8111-111111111111";
const CAPTURE_ID = "22222222-2222-4222-8222-222222222222";
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const DIGEST = "a".repeat(64);

function context(attemptId = ATTEMPT_ID) {
  return { params: Promise.resolve({ attemptId }) };
}

describe("effect reversal review route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    integrationMock.mockReturnValue(true);
    authMock.mockResolvedValue({ user: { id: "recruiter" } });
    previewMock.mockResolvedValue({ preview_digest: DIGEST });
    approveMock.mockResolvedValue({ contract_version: "2026-08-11.1" });
  });

  it("loads a read-only current-destination preview", async () => {
    const result = await GET(new Request("http://localhost"), context());

    expect(result.status).toBe(200);
    expect(previewMock).toHaveBeenCalledWith(ATTEMPT_ID);
    expect(approveMock).not.toHaveBeenCalled();
  });

  it("binds approval to the viewed digest, destination version, and request", async () => {
    const result = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          capture_id: CAPTURE_ID,
          expected_destination_version: 1,
          expected_preview_digest: DIGEST,
          reason: "The recruiter no longer needs this item.",
          request_id: REQUEST_ID,
        }),
      }),
      context(),
    );

    expect(result.status).toBe(200);
    expect(approveMock).toHaveBeenCalledWith(
      ATTEMPT_ID,
      {
        expected_destination_version: 1,
        expected_preview_digest: DIGEST,
        reason: "The recruiter no longer needs this item.",
        request_id: REQUEST_ID,
      },
      CAPTURE_ID,
    );
  });

  it("rejects approval without a stable retry request id", async () => {
    const result = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expected_destination_version: 1,
          expected_preview_digest: DIGEST,
          reason: "Remove it.",
        }),
      }),
      context(),
    );

    expect(result.status).toBe(400);
    expect(approveMock).not.toHaveBeenCalled();
  });
});
