import { TalentSignalHttpError } from "@talent-signal/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  decideIdentityResolutionMock,
  isIntegrationModeMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  decideIdentityResolutionMock: vi.fn(),
  isIntegrationModeMock: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/server/localBackend", () => ({
  decideIdentityResolution: decideIdentityResolutionMock,
  isIntegrationMode: isIntegrationModeMock,
}));

import { POST } from "./route";

const CASE_ID = "11111111-1111-4111-8111-111111111111";
const IDEMPOTENCY_KEY = "22222222-2222-4222-8222-222222222222";
const PERSON_ID = "33333333-3333-4333-8333-333333333333";

const validBody = {
  idempotency_key: IDEMPOTENCY_KEY,
  expected_case_version: 2,
  decision: "bind_existing",
  selected_person_id: PERSON_ID,
  relationship_context: {
    status: "proposed",
    label: "  Ambiguous referral context  ",
    purpose: "  recruiter_relationship_management  ",
  },
  reason: "  Recruiter verified the source account.  ",
} as const;

function request(
  body: unknown,
  {
    origin = "http://127.0.0.1:3000",
    contentType = "application/json",
  }: {
    origin?: string;
    contentType?: string;
  } = {},
) {
  return new Request(
    `http://127.0.0.1:3000/api/local-integration/identity-resolution-cases/${CASE_ID}/decisions`,
    {
      method: "POST",
      headers: {
        host: "127.0.0.1:3000",
        origin,
        "content-type": contentType,
      },
      body: JSON.stringify(body),
    },
  );
}

function context(caseId = CASE_ID) {
  return { params: Promise.resolve({ caseId }) };
}

describe("identity resolution decision route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isIntegrationModeMock.mockReturnValue(true);
    authMock.mockResolvedValue({ user: { id: "recruiter" } });
    decideIdentityResolutionMock.mockResolvedValue({
      decision: {
        contract_version: "2026-08-07.1",
        case_id: CASE_ID,
        case_version: 3,
        status: "resolved",
        selected_person_id: PERSON_ID,
        selected_relationship_context_id:
          "44444444-4444-4444-8444-444444444444",
        decided_at: "2026-08-07T00:00:00.000Z",
      },
      identity_case: {},
      knowledge_snapshot: {},
      compilation_error: null,
    });
  });

  it("rejects cross-origin mutation before forwarding the decision", async () => {
    const result = await POST(
      request(validBody, { origin: "https://attacker.example" }),
      context(),
    );

    expect(result.status).toBe(403);
    await expect(result.json()).resolves.toEqual({
      code: "cross_origin_identity_decision_denied",
    });
    expect(decideIdentityResolutionMock).not.toHaveBeenCalled();
  });

  it("rejects malformed identifiers, bodies, and content types locally", async () => {
    const invalidCase = await POST(
      request(validBody),
      context("not-a-case"),
    );
    const invalidBody = await POST(
      request({
        ...validBody,
        expected_case_version: 0,
        selected_person_id: "not-a-person",
      }),
      context(),
    );
    const invalidContentType = await POST(
      request(validBody, { contentType: "text/plain" }),
      context(),
    );

    expect(invalidCase.status).toBe(400);
    expect(invalidBody.status).toBe(400);
    expect(invalidContentType.status).toBe(415);
    expect(decideIdentityResolutionMock).not.toHaveBeenCalled();
  });

  it("preserves stale-state guards and trims human-entered rationale", async () => {
    const result = await POST(request(validBody), context());

    expect(result.status).toBe(201);
    expect(decideIdentityResolutionMock).toHaveBeenCalledWith(CASE_ID, {
      ...validBody,
      relationship_context: {
        ...validBody.relationship_context,
        label: "Ambiguous referral context",
        purpose: "recruiter_relationship_management",
      },
      reason: "Recruiter verified the source account.",
    });
  });

  it("preserves a backend stale-version conflict", async () => {
    decideIdentityResolutionMock.mockRejectedValue(
      new TalentSignalHttpError(
        409,
        "IDENTITY_RESOLUTION_STALE",
        "The identity case changed before this decision.",
        { current_case_version: 3 },
      ),
    );

    const result = await POST(request(validBody), context());

    expect(result.status).toBe(409);
    await expect(result.json()).resolves.toEqual({
      code: "IDENTITY_RESOLUTION_STALE",
      message: "The identity case changed before this decision.",
    });
  });
});
