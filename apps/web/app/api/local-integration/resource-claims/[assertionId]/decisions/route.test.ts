import { TalentSignalHttpError } from "@talent-signal/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  decideRelationshipClaimMock,
  isIntegrationModeMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  decideRelationshipClaimMock: vi.fn(),
  isIntegrationModeMock: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/server/localBackend", () => ({
  decideRelationshipClaim: decideRelationshipClaimMock,
  isIntegrationMode: isIntegrationModeMock,
}));

import { POST } from "./route";

const ASSERTION_ID = "11111111-1111-4111-8111-111111111111";
const IDEMPOTENCY_KEY = "22222222-2222-4222-8222-222222222222";

function request(
  body: unknown,
  {
    origin = "http://127.0.0.1:3000",
    host = "127.0.0.1:3000",
    contentType = "application/json",
  }: {
    origin?: string;
    host?: string;
    contentType?: string;
  } = {},
) {
  return new Request(
    `http://${host}/api/local-integration/resource-claims/${ASSERTION_ID}/decisions`,
    {
      method: "POST",
      headers: {
        host,
        origin,
        "content-type": contentType,
      },
      body: JSON.stringify(body),
    },
  );
}

function context(assertionId = ASSERTION_ID) {
  return { params: Promise.resolve({ assertionId }) };
}

describe("relationship claim decision route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isIntegrationModeMock.mockReturnValue(true);
    authMock.mockResolvedValue({ user: { id: "recruiter" } });
    decideRelationshipClaimMock.mockResolvedValue({
      decision_id: "33333333-3333-4333-8333-333333333333",
      assertion_id: ASSERTION_ID,
      decision: "confirm",
      decided_by_user_id: "44444444-4444-4444-8444-444444444444",
      confirmed_state_id: "55555555-5555-4555-8555-555555555555",
      decided_at: "2026-08-06T00:00:00.000Z",
    });
  });

  it("rejects cross-origin mutation before reading or forwarding the body", async () => {
    const result = await POST(
      request(
        {
          idempotency_key: IDEMPOTENCY_KEY,
          expected_assertion_version: 1,
          decision: "confirm",
        },
        { origin: "https://attacker.example" },
      ),
      context(),
    );

    expect(result.status).toBe(403);
    await expect(result.json()).resolves.toEqual({
      code: "cross_origin_claim_decision_denied",
    });
    expect(decideRelationshipClaimMock).not.toHaveBeenCalled();
  });

  it("rejects malformed identifiers, bodies, and content types locally", async () => {
    const invalidId = await POST(
      request({
        idempotency_key: IDEMPOTENCY_KEY,
        expected_assertion_version: 1,
        decision: "confirm",
      }),
      context("not-an-assertion"),
    );
    const invalidBody = await POST(
      request({
        idempotency_key: "not-a-uuid",
        expected_assertion_version: 0,
        decision: "overwrite",
      }),
      context(),
    );
    const invalidContentType = await POST(
      request(
        {
          idempotency_key: IDEMPOTENCY_KEY,
          expected_assertion_version: 1,
          decision: "confirm",
        },
        { contentType: "text/plain" },
      ),
      context(),
    );

    expect(invalidId.status).toBe(400);
    expect(invalidBody.status).toBe(400);
    expect(invalidContentType.status).toBe(415);
    expect(decideRelationshipClaimMock).not.toHaveBeenCalled();
  });

  it("preserves the expected version and idempotency key on repeated submission", async () => {
    const input = {
      idempotency_key: IDEMPOTENCY_KEY,
      expected_assertion_version: 7,
      decision: "confirm" as const,
      corrected_value: "  VP Product  ",
    };

    const first = await POST(request(input), context());
    const replay = await POST(request(input), context());

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(decideRelationshipClaimMock).toHaveBeenNthCalledWith(
      1,
      ASSERTION_ID,
      {
        idempotency_key: IDEMPOTENCY_KEY,
        expected_assertion_version: 7,
        decision: "confirm",
        corrected_value: "VP Product",
      },
    );
    expect(decideRelationshipClaimMock).toHaveBeenNthCalledWith(
      2,
      ASSERTION_ID,
      {
        idempotency_key: IDEMPOTENCY_KEY,
        expected_assertion_version: 7,
        decision: "confirm",
        corrected_value: "VP Product",
      },
    );
    await expect(first.json()).resolves.toEqual(
      await replay.clone().json(),
    );
  });

  it("returns stale-version conflicts without converting them into generic failures", async () => {
    decideRelationshipClaimMock.mockRejectedValue(
      new TalentSignalHttpError(
        409,
        "ASSERTION_VERSION_CONFLICT",
        "The assertion changed; review the current version.",
        { current_version: 8 },
      ),
    );

    const result = await POST(
      request({
        idempotency_key: IDEMPOTENCY_KEY,
        expected_assertion_version: 7,
        decision: "confirm",
      }),
      context(),
    );

    expect(result.status).toBe(409);
    await expect(result.json()).resolves.toEqual({
      code: "ASSERTION_VERSION_CONFLICT",
      message: "The assertion changed; review the current version.",
    });
  });
});
