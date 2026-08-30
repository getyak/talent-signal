import { TalentSignalHttpError } from "@talent-signal/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  compileRelationshipKnowledgeMock,
  isIntegrationModeMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  compileRelationshipKnowledgeMock: vi.fn(),
  isIntegrationModeMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/server/localBackend", () => ({
  compileRelationshipKnowledge: compileRelationshipKnowledgeMock,
  isIntegrationMode: isIntegrationModeMock,
}));

import { POST } from "./route";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const PERSON_ID = "22222222-2222-4222-8222-222222222222";
const CONTEXT_ID = "33333333-3333-4333-8333-333333333333";

function request(
  body: unknown,
  options: {
    contentType?: string;
    origin?: string;
  } = {},
) {
  return new Request(
    "http://127.0.0.1:3000/api/local-integration/wiki-compilations",
    {
      method: "POST",
      headers: {
        host: "127.0.0.1:3000",
        origin: options.origin ?? "http://127.0.0.1:3000",
        "content-type": options.contentType ?? "application/json",
      },
      body: JSON.stringify(body),
    },
  );
}

describe("relationship Wiki compilation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isIntegrationModeMock.mockReturnValue(true);
    authMock.mockResolvedValue({ user: { id: "recruiter" } });
    compileRelationshipKnowledgeMock.mockResolvedValue({
      blocks: [],
      id: "44444444-4444-4444-8444-444444444444",
      status: "published",
    });
  });

  it("compiles the scoped Wiki snapshot through the dedicated local route", async () => {
    const result = await POST(
      request({
        request_id: REQUEST_ID,
        person_id: PERSON_ID,
        relationship_context_id: CONTEXT_ID,
      }),
    );

    expect(result.status).toBe(200);
    expect(compileRelationshipKnowledgeMock).toHaveBeenCalledWith({
      request_id: REQUEST_ID,
      person_id: PERSON_ID,
      relationship_context_id: CONTEXT_ID,
    });
    await expect(result.json()).resolves.toMatchObject({
      id: "44444444-4444-4444-8444-444444444444",
      status: "published",
    });
  });

  it("preserves malformed scope as a client error instead of a retryable outage", async () => {
    compileRelationshipKnowledgeMock.mockRejectedValueOnce(
      new TalentSignalHttpError(
        400,
        "wiki_compile_request_invalid",
        "关系 Wiki 编译范围不完整。",
        null,
      ),
    );

    const result = await POST(
      request({
        request_id: "not-a-request",
        person_id: "not-a-person",
        relationship_context_id: CONTEXT_ID,
      }),
    );

    expect(result.status).toBe(400);
    await expect(result.json()).resolves.toMatchObject({
      code: "wiki_compile_request_invalid",
      message: "关系 Wiki 编译范围不完整。",
    });
  });

  it("rejects non-JSON compile requests before invoking the backend", async () => {
    const result = await POST(
      request(
        {
          request_id: REQUEST_ID,
          person_id: PERSON_ID,
          relationship_context_id: CONTEXT_ID,
        },
        { contentType: "text/plain" },
      ),
    );

    expect(result.status).toBe(415);
    expect(compileRelationshipKnowledgeMock).not.toHaveBeenCalled();
  });
});
