import { TalentSignalHttpError } from "@talent-signal/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  isIntegrationModeMock,
  loadHistoryMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  isIntegrationModeMock: vi.fn(),
  loadHistoryMock: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/server/localBackend", () => ({
  isIntegrationMode: isIntegrationModeMock,
  loadRelationshipAgentHistory: loadHistoryMock,
}));

import { GET } from "./route";

const PERSON_ID = "11111111-1111-4111-8111-111111111111";
const CONTEXT_ID = "22222222-2222-4222-8222-222222222222";

function context(
  personId = PERSON_ID,
  contextId = CONTEXT_ID,
) {
  return { params: Promise.resolve({ personId, contextId }) };
}

describe("relationship Agent history route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isIntegrationModeMock.mockReturnValue(true);
    authMock.mockResolvedValue({ user: { id: "recruiter" } });
    loadHistoryMock.mockResolvedValue({
      contract_version: "2026-08-07.1",
      person_id: PERSON_ID,
      relationship_context_id: CONTEXT_ID,
      operations: [],
      external_effect_follow_ups: [],
      next_cursor: 0,
    });
  });

  it("requires authentication before loading relationship history", async () => {
    authMock.mockResolvedValue(null);

    const result = await GET(
      new Request("http://127.0.0.1:3000/api/history"),
      context(),
    );

    expect(result.status).toBe(401);
    expect(loadHistoryMock).not.toHaveBeenCalled();
  });

  it("rejects malformed relationship identifiers locally", async () => {
    const result = await GET(
      new Request("http://127.0.0.1:3000/api/history"),
      context("not-a-person"),
    );

    expect(result.status).toBe(400);
    expect(loadHistoryMock).not.toHaveBeenCalled();
  });

  it("loads only the authenticated person-context projection", async () => {
    const result = await GET(
      new Request("http://127.0.0.1:3000/api/history"),
      context(),
    );

    expect(result.status).toBe(200);
    expect(loadHistoryMock).toHaveBeenCalledWith(
      PERSON_ID,
      CONTEXT_ID,
    );
    expect(result.headers.get("cache-control")).toContain("no-store");
  });

  it("preserves an account-scoped backend not-found response", async () => {
    loadHistoryMock.mockRejectedValue(
      new TalentSignalHttpError(
        404,
        "RELATIONSHIP_CONTEXT_NOT_FOUND",
        "The relationship was not found.",
        null,
      ),
    );

    const result = await GET(
      new Request("http://127.0.0.1:3000/api/history"),
      context(),
    );

    expect(result.status).toBe(404);
    await expect(result.json()).resolves.toEqual({
      code: "RELATIONSHIP_CONTEXT_NOT_FOUND",
      message: "The relationship was not found.",
    });
  });
});
