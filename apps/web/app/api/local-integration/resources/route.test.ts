import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  commitRelationshipResourceMock,
  isIntegrationModeMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  commitRelationshipResourceMock: vi.fn(),
  isIntegrationModeMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/server/localBackend", () => ({
  commitRelationshipResource: commitRelationshipResourceMock,
  isIntegrationMode: isIntegrationModeMock,
  loadRelationshipResource: vi.fn(),
  loadRelationshipResources: vi.fn(),
}));

import { POST } from "./route";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const PERSON_ID = "22222222-2222-4222-8222-222222222222";
const CONTEXT_ID = "33333333-3333-4333-8333-333333333333";

function request(body: unknown, origin = "http://127.0.0.1:3000") {
  return new Request(
    "http://127.0.0.1:3000/api/local-integration/resources",
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

const transcriptBody = {
  request_id: REQUEST_ID,
  captured_at: "2026-08-11T02:45:00.000Z",
  person_id: PERSON_ID,
  relationship_context_id: CONTEXT_ID,
  type: "conversation",
  title: "Synthetic follow-up transcript",
  value: "",
  attribution_reviewed: true,
  transcript_messages: [
    { speaker: "candidate", text: "Availability: 2026-09-15" },
    { speaker: "recruiter", text: "I will confirm the interview window." },
    { speaker: "unknown", text: "Work mode: Remote" },
  ],
} as const;

describe("governed conversation resource intake", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isIntegrationModeMock.mockReturnValue(true);
    authMock.mockResolvedValue({ user: { id: "recruiter" } });
    commitRelationshipResourceMock.mockResolvedValue({
      contract_version: "2026-08-07.1",
      identity: {
        status: "bound",
        person_id: PERSON_ID,
        relationship_context_id: CONTEXT_ID,
      },
      resource: { id: "44444444-4444-4444-8444-444444444444" },
    });
  });

  it("requires an explicit speaker review decision", async () => {
    const result = await POST(
      request({ ...transcriptBody, attribution_reviewed: false }),
    );

    expect(result.status).toBe(422);
    await expect(result.json()).resolves.toMatchObject({
      code: "resource_intake_failed",
      message: expect.stringMatching(/review every transcript speaker/i),
    });
    expect(commitRelationshipResourceMock).not.toHaveBeenCalled();
  });

  it("commits addressable proposed messages with exact reviewed attribution", async () => {
    const result = await POST(request(transcriptBody));

    expect(result.status).toBe(201);
    expect(commitRelationshipResourceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        request_id: REQUEST_ID,
        captured_at: "2026-08-11T02:45:00.000Z",
        kind: "conversation_transcript",
        display_name: "Synthetic follow-up transcript",
        fragments: [
          expect.objectContaining({
            sequence: 0,
            text: "Availability: 2026-09-15",
            attribution: { actor_kind: "candidate", status: "confirmed" },
            review_status: "proposed",
          }),
          expect.objectContaining({
            sequence: 1,
            attribution: { actor_kind: "recruiter", status: "confirmed" },
            review_status: "proposed",
          }),
          expect.objectContaining({
            sequence: 2,
            attribution: { actor_kind: "unknown", status: "unknown" },
            review_status: "proposed",
          }),
        ],
      }),
    );
  });

  it("rejects cross-origin transcript mutation before commit", async () => {
    const result = await POST(
      request(transcriptBody, "https://attacker.example"),
    );

    expect(result.status).toBe(403);
    expect(commitRelationshipResourceMock).not.toHaveBeenCalled();
  });
});

describe("observation time validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isIntegrationModeMock.mockReturnValue(true);
    authMock.mockResolvedValue({ user: { id: "recruiter" } });
    commitRelationshipResourceMock.mockResolvedValue({
      contract_version: "2026-08-07.1",
      identity: {
        status: "bound",
        person_id: PERSON_ID,
        relationship_context_id: CONTEXT_ID,
      },
      resource: { id: "44444444-4444-4444-8444-444444444444" },
    });
  });

  function noteBody(overrides: Record<string, unknown>) {
    return {
      request_id: REQUEST_ID,
      person_id: PERSON_ID,
      relationship_context_id: CONTEXT_ID,
      type: "note",
      title: "Synthetic note",
      value: "Synthetic note body",
      ...overrides,
    };
  }

  it("rejects a missing captured_at with a friendly validation error before commit", async () => {
    const result = await POST(request(noteBody({})));

    expect(result.status).toBe(422);
    await expect(result.json()).resolves.toMatchObject({
      code: "resource_intake_failed",
      message:
        "无法确认该来源的观察时间，未保存任何内容。请刷新页面后重新提交。",
    });
    expect(commitRelationshipResourceMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed captured_at with concise actionable copy, never a raw error", async () => {
    const result = await POST(
      request(noteBody({ captured_at: "Friday, August 7" })),
    );

    expect(result.status).toBe(422);
    const body = (await result.json()) as { message: string };
    expect(body.message).toBe(
      "无法确认该来源的观察时间，未保存任何内容。请刷新页面后重新提交。",
    );
    // Product copy must not expose internal format names or request plumbing.
    expect(body.message).not.toMatch(/ISO|时间戳|request/i);
    expect(body.message).not.toMatch(/invalid time value|rangeerror/i);
    expect(commitRelationshipResourceMock).not.toHaveBeenCalled();
  });

  it("rejects a confirmed clue submission without an observation time", async () => {
    const result = await POST(
      request({
        request_id: REQUEST_ID,
        person_id: PERSON_ID,
        relationship_context_id: CONTEXT_ID,
        scope_mode: "existing",
        type: "contact",
        value: "wechat:synthetic-handle",
        identity_clue_confirmed: true,
      }),
    );

    expect(result.status).toBe(422);
    await expect(result.json()).resolves.toMatchObject({
      code: "resource_intake_failed",
      message:
        "无法确认该来源的观察时间，未保存任何内容。请刷新页面后重新提交。",
    });
    expect(commitRelationshipResourceMock).not.toHaveBeenCalled();
  });

  it("rejects a document intake with an invalid observation time before extraction", async () => {
    const form = new FormData();
    form.set("request_id", REQUEST_ID);
    form.set("captured_at", "not-a-timestamp");
    form.set("person_id", PERSON_ID);
    form.set("relationship_context_id", CONTEXT_ID);
    form.set("document_kind", "document");
    form.set(
      "file",
      new File(["synthetic"], "synthetic.txt", { type: "text/plain" }),
    );
    const result = await POST(
      new Request("http://127.0.0.1:3000/api/local-integration/resources", {
        method: "POST",
        headers: {
          host: "127.0.0.1:3000",
          origin: "http://127.0.0.1:3000",
        },
        body: form,
      }),
    );

    expect(result.status).toBe(422);
    const body = (await result.json()) as { message: string };
    expect(body.message).toBe(
      "无法确认该来源的观察时间，未保存任何内容。请刷新页面后重新提交。",
    );
    expect(body.message).not.toMatch(/ISO|时间戳|request/i);
    expect(body.message).not.toMatch(/invalid time value|rangeerror/i);
    expect(commitRelationshipResourceMock).not.toHaveBeenCalled();
  });
});
