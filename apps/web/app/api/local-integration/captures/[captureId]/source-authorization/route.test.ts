import { TalentSignalHttpError } from "@talent-signal/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  decideAuthorizationMock,
  isIntegrationModeMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  decideAuthorizationMock: vi.fn(),
  isIntegrationModeMock: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/server/localBackend", () => ({
  decideRelationshipSourceAuthorization: decideAuthorizationMock,
  isIntegrationMode: isIntegrationModeMock,
}));

import { POST } from "./route";

const CAPTURE_ID = "11111111-1111-4111-8111-111111111111";
const IDEMPOTENCY_KEY = "22222222-2222-4222-8222-222222222222";

const validBody = {
  idempotency_key: IDEMPOTENCY_KEY,
  expected_capture_version: 3,
  decision: "revoke",
  reason: "  The candidate withdrew permission for this purpose.  ",
} as const;

function request(
  body: unknown,
  origin = "http://127.0.0.1:3000",
) {
  return new Request(
    `http://127.0.0.1:3000/api/local-integration/captures/${CAPTURE_ID}/source-authorization`,
    {
      method: "POST",
      headers: {
        host: "127.0.0.1:3000",
        origin,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
}

function context(captureId = CAPTURE_ID) {
  return { params: Promise.resolve({ captureId }) };
}

describe("capture source authorization route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isIntegrationModeMock.mockReturnValue(true);
    authMock.mockResolvedValue({ user: { id: "recruiter" } });
    decideAuthorizationMock.mockResolvedValue({
      contract_version: "2026-08-07.1",
      decision_id: "33333333-3333-4333-8333-333333333333",
      root_capture_id: CAPTURE_ID,
      affected_capture_ids: [CAPTURE_ID],
      decision: "revoke",
      prior_authorization_state: "authorized",
      authorization_state: "revoked",
      authorization_expires_at: null,
      person_id: "44444444-4444-4444-8444-444444444444",
      relationship_context_id:
        "55555555-5555-4555-8555-555555555555",
      root_capture_version: 4,
      states_retracted: 1,
      prior_states_reopened_for_review: 0,
      claims_reopened: 1,
      actions_revoked: 0,
      completed_actions_requiring_follow_up: 0,
      external_effects_requiring_follow_up: 0,
      identity_handles_returned_to_review: 0,
      knowledge_snapshots_invalidated: [],
      compilation: {
        snapshot_id: "66666666-6666-4666-8666-666666666666",
        status: "published",
        verdict: "gold",
        block_count: 4,
      },
      compilation_error: null,
      decided_at: "2026-08-07T00:00:00.000Z",
    });
  });

  it("rejects cross-origin permission changes", async () => {
    const result = await POST(
      request(validBody, "https://attacker.example"),
      context(),
    );

    expect(result.status).toBe(403);
    expect(decideAuthorizationMock).not.toHaveBeenCalled();
  });

  it("rejects malformed identifiers and empty rationale", async () => {
    const malformedCapture = await POST(
      request(validBody),
      context("not-a-capture"),
    );
    const missingReason = await POST(
      request({ ...validBody, reason: " " }),
      context(),
    );

    expect(malformedCapture.status).toBe(400);
    expect(missingReason.status).toBe(400);
    expect(decideAuthorizationMock).not.toHaveBeenCalled();
  });

  it("forwards the optimistic version guard and trimmed rationale", async () => {
    const result = await POST(request(validBody), context());

    expect(result.status).toBe(201);
    expect(decideAuthorizationMock).toHaveBeenCalledWith(
      CAPTURE_ID,
      {
        ...validBody,
        reason:
          "The candidate withdrew permission for this purpose.",
      },
    );
  });

  it("forwards a restored authorization deadline and rejects it on revoke", async () => {
    const authorizationExpiresAt =
      "2026-08-08T00:00:00.000Z";
    const restored = await POST(
      request({
        ...validBody,
        decision: "restore",
        authorization_expires_at: authorizationExpiresAt,
      }),
      context(),
    );
    const invalidRevoke = await POST(
      request({
        ...validBody,
        authorization_expires_at: authorizationExpiresAt,
      }),
      context(),
    );

    expect(restored.status).toBe(201);
    expect(decideAuthorizationMock).toHaveBeenCalledWith(
      CAPTURE_ID,
      expect.objectContaining({
        decision: "restore",
        authorization_expires_at: authorizationExpiresAt,
      }),
    );
    expect(invalidRevoke.status).toBe(400);
  });

  it("preserves a backend stale-version conflict", async () => {
    decideAuthorizationMock.mockRejectedValue(
      new TalentSignalHttpError(
        409,
        "SOURCE_AUTHORIZATION_STALE",
        "The source changed before this authorization decision.",
        { current_capture_version: 4 },
      ),
    );

    const result = await POST(request(validBody), context());

    expect(result.status).toBe(409);
    await expect(result.json()).resolves.toEqual({
      code: "SOURCE_AUTHORIZATION_STALE",
      message:
        "The source changed before this authorization decision.",
    });
  });
});
