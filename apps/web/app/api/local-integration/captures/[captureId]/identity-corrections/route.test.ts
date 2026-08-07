import { TalentSignalHttpError } from "@talent-signal/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  correctIdentityMock,
  isIntegrationModeMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  correctIdentityMock: vi.fn(),
  isIntegrationModeMock: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/server/localBackend", () => ({
  correctRelationshipResourceIdentity: correctIdentityMock,
  isIntegrationMode: isIntegrationModeMock,
}));

import { POST } from "./route";

const CAPTURE_ID = "11111111-1111-4111-8111-111111111111";
const IDEMPOTENCY_KEY = "22222222-2222-4222-8222-222222222222";
const PRIOR_PERSON_ID = "33333333-3333-4333-8333-333333333333";
const PRIOR_CONTEXT_ID = "44444444-4444-4444-8444-444444444444";
const TARGET_PERSON_ID = "55555555-5555-4555-8555-555555555555";
const TARGET_CONTEXT_ID = "66666666-6666-4666-8666-666666666666";

const validBody = {
  idempotency_key: IDEMPOTENCY_KEY,
  expected_capture_version: 3,
  expected_person_id: PRIOR_PERSON_ID,
  expected_relationship_context_id: PRIOR_CONTEXT_ID,
  reason: "  Email and employment history match.  ",
  binding_basis: "  Recruiter explicitly reviewed the source.  ",
  target: {
    status: "existing_person",
    person_id: TARGET_PERSON_ID,
    relationship_context: {
      status: "existing",
      relationship_context_id: TARGET_CONTEXT_ID,
    },
  },
} as const;

function request(
  body: unknown,
  origin = "http://127.0.0.1:3000",
) {
  return new Request(
    `http://127.0.0.1:3000/api/local-integration/captures/${CAPTURE_ID}/identity-corrections`,
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

describe("capture identity correction route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isIntegrationModeMock.mockReturnValue(true);
    authMock.mockResolvedValue({ user: { id: "recruiter" } });
    correctIdentityMock.mockResolvedValue({
      contract_version: "2026-08-07.1",
      decision_id: "77777777-7777-4777-8777-777777777777",
      root_capture_id: CAPTURE_ID,
      capture_ids_rebound: [CAPTURE_ID],
      prior_person_id: PRIOR_PERSON_ID,
      prior_relationship_context_id: PRIOR_CONTEXT_ID,
      person_id: TARGET_PERSON_ID,
      relationship_context_id: TARGET_CONTEXT_ID,
      root_capture_version: 4,
      states_retracted: 1,
      prior_states_reopened_for_review: 0,
      claims_reopened: 1,
      actions_revoked: 0,
      completed_actions_requiring_follow_up: 0,
      identity_handles_returned_to_review: 0,
      knowledge_snapshots_invalidated: [],
      decided_at: "2026-08-07T00:00:00.000Z",
    });
  });

  it("rejects a cross-origin correction before the backend mutation", async () => {
    const result = await POST(
      request(validBody, "https://attacker.example"),
      context(),
    );

    expect(result.status).toBe(403);
    expect(correctIdentityMock).not.toHaveBeenCalled();
  });

  it("rejects malformed capture and target identifiers", async () => {
    const invalidCapture = await POST(
      request(validBody),
      context("not-a-capture"),
    );
    const invalidTarget = await POST(
      request({
        ...validBody,
        target: {
          ...validBody.target,
          person_id: "not-a-person",
        },
      }),
      context(),
    );

    expect(invalidCapture.status).toBe(400);
    expect(invalidTarget.status).toBe(400);
    expect(correctIdentityMock).not.toHaveBeenCalled();
  });

  it("forwards exact stale-state guards and trims human rationale", async () => {
    const result = await POST(request(validBody), context());

    expect(result.status).toBe(201);
    expect(correctIdentityMock).toHaveBeenCalledWith(CAPTURE_ID, {
      ...validBody,
      reason: "Email and employment history match.",
      binding_basis: "Recruiter explicitly reviewed the source.",
    });
  });

  it("preserves a backend stale-version conflict", async () => {
    correctIdentityMock.mockRejectedValue(
      new TalentSignalHttpError(
        409,
        "IDENTITY_CORRECTION_STALE",
        "The source identity changed before this correction.",
        { current_capture_version: 4 },
      ),
    );

    const result = await POST(request(validBody), context());

    expect(result.status).toBe(409);
    await expect(result.json()).resolves.toEqual({
      code: "IDENTITY_CORRECTION_STALE",
      message:
        "The source identity changed before this correction.",
    });
  });
});
