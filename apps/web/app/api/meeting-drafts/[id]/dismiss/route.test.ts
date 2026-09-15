import { TalentSignalHttpError } from "@talent-signal/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  claims: vi.fn(),
  dismiss: vi.fn(),
  origin: vi.fn(),
}));

vi.mock("@/lib/server/backendAuth", () => ({ readBackendSessionClaims: mocked.claims }));
vi.mock("@/lib/request-origin", () => ({ isAllowedMutationOrigin: mocked.origin }));
vi.mock("@/lib/server/meetingDrafts", () => ({ dismissMeetingDraft: mocked.dismiss }));
vi.mock("@/lib/server/workspaceSessions", () => ({
  isWorkspaceSessionId: (value: unknown) =>
    typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value),
  workspaceSessionsBinding: () => "binding",
}));

import { POST } from "./route";

const draftId = "10000000-0000-4000-8000-000000000001";
const requestId = "20000000-0000-4000-8000-000000000002";
const context = { params: Promise.resolve({ id: draftId }) };

function request(
  body: unknown,
  binding = "binding",
  origin = "http://localhost:3000",
) {
  return new Request(`http://localhost:3000/api/meeting-drafts/${draftId}/dismiss`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "x-workspace-session": binding,
      host: "localhost:3000",
      origin,
    },
    method: "POST",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.claims.mockResolvedValue({ backendExpiresAt: "2099-01-01T00:00:00.000Z" });
  mocked.origin.mockReturnValue(true);
  mocked.dismiss.mockResolvedValue({ id: draftId, status: "dismissed", revision: 2 });
});

describe("meeting draft dismissal route", () => {
  it("passes the exact optimistic revision and idempotency key", async () => {
    const response = await POST(
      request({ expected_revision: 1, idempotency_key: requestId }),
      context,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocked.dismiss).toHaveBeenCalledWith(draftId, {
      expected_revision: 1,
      idempotency_key: requestId,
    });
  });

  it("rejects cross-origin and stale-browser requests before mutation", async () => {
    mocked.origin.mockReturnValue(false);
    expect((await POST(request({}, "binding", "https://other.invalid"), context)).status).toBe(403);
    expect(mocked.claims).not.toHaveBeenCalled();
    mocked.origin.mockReturnValue(true);
    expect((await POST(request({}, "stale"), context)).status).toBe(409);
    expect(mocked.dismiss).not.toHaveBeenCalled();
  });

  it("preserves a backend concurrency conflict and does not retry", async () => {
    mocked.dismiss.mockRejectedValue(
      new TalentSignalHttpError(409, "MEETING_DRAFT_REVISION_CONFLICT", "请刷新", null),
    );
    const response = await POST(
      request({ expected_revision: 1, idempotency_key: requestId }),
      context,
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "MEETING_DRAFT_REVISION_CONFLICT",
    });
    expect(mocked.dismiss).toHaveBeenCalledTimes(1);
  });
});
