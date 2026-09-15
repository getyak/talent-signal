import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONTRACT_VERSION,
  type AgentSessionListResponse,
  type AgentSessionRecord,
  type AgentSessionResponse,
  type TalentSignalClient,
} from "@talent-signal/contracts";

const mocked = vi.hoisted(() => ({ authenticatedClient: vi.fn() }));
vi.mock("./backendAuth", () => ({
  authSecret: () => "synthetic-session-test-secret",
  authenticatedBackendClient: mocked.authenticatedClient,
}));

import {
  createUnscopedWorkspaceSession,
  loadWorkspaceSessionDirectory,
  saveWorkspaceSessionDraft,
  workspaceSessionDirectory,
  workspaceSessionDisplayTitle,
  workspaceSessionReturnHref,
  workspaceSessionScope,
  workspaceSessionState,
} from "./workspaceSessions";

const sessionId = "10000000-0000-4000-8000-000000000001";
const requestId = "10000000-0000-4000-8000-000000000002";

function record(overrides: Partial<AgentSessionRecord> = {}): AgentSessionRecord {
  return {
    deleted_at: null,
    display_authority: "stale_unconfirmed",
    expires_at: "2099-01-31T00:00:00.000Z",
    payload: {
      contextDisplayLabel: "",
      id: sessionId,
      isUnread: false,
      personDisplayLabel: "",
      scopeKind: "unresolved_intent",
      title: "继续候选人沟通",
      turns: [],
      updatedAt: "2099-01-01T00:00:00.000Z",
    },
    revision: 3,
    session_id: sessionId,
    updated_at: "2099-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function response(value = record()): AgentSessionResponse {
  return { contract_version: CONTRACT_VERSION, session: value };
}

beforeEach(() => vi.clearAllMocks());

describe("workspace Session projection", () => {
  it("keeps deleted, expired, unavailable, and active states distinct", () => {
    expect(workspaceSessionState(record({ deleted_at: "2099-01-02T00:00:00.000Z" }), 0)).toBe("deleted");
    expect(workspaceSessionState(record({ expires_at: "2020-01-01T00:00:00.000Z" }))).toBe("expired");
    expect(workspaceSessionState(record({ payload: null }), 0)).toBe("unavailable");
    expect(workspaceSessionState(record(), 0)).toBe("active");
  });

  it("lists only resumable records and preserves incomplete pagination", () => {
    const older = record({
      session_id: "10000000-0000-4000-8000-000000000003",
      updated_at: "2098-12-01T00:00:00.000Z",
    });
    const input: AgentSessionListResponse = {
      complete: false,
      contract_version: CONTRACT_VERSION,
      next_cursor: older.session_id,
      sessions: [older, record(), record({ payload: null })],
    };
    const result = workspaceSessionDirectory(input, 0);
    expect(result.sessions.map((item) => item.sessionId)).toEqual([sessionId, older.session_id]);
    expect(result.complete).toBe(false);
    expect(result.nextCursor).toBe(older.session_id);
  });

  it("bounds display titles without mutating stored content", () => {
    expect(workspaceSessionDisplayTitle(" \n  继续   沟通 \t ")).toBe("继续 沟通");
    expect(Array.from(workspaceSessionDisplayTitle("候".repeat(80)))).toHaveLength(32);
  });

  it("creates explicit governed return links without claiming an unscoped bind", () => {
    const relationship = workspaceSessionScope({
      contextDisplayLabel: "产品负责人寻访",
      personDisplayLabel: "林珊",
      personID: "10000000-0000-4000-8000-000000000004",
      relationshipContextID: "10000000-0000-4000-8000-000000000005",
      scopeKind: "relationship",
    });
    const linked = workspaceSessionReturnHref({ sessionId, scope: relationship });
    expect(linked.href).toContain(`session=${sessionId}`);
    const unscoped = workspaceSessionReturnHref({
      sessionId,
      scope: workspaceSessionScope({
        contextDisplayLabel: "",
        personDisplayLabel: "",
        scopeKind: "unresolved_intent",
      }),
    });
    expect(unscoped.href).toBe("/workspace/people");
    expect(unscoped.note).toContain("没有绑定");
  });
});

describe("workspace Session service adapter", () => {
  it("creates an unscoped canonical record without model work", async () => {
    const saveAgentSession = vi.fn().mockResolvedValue(response(record({ revision: 1 })));
    mocked.authenticatedClient.mockResolvedValue({ saveAgentSession } as unknown as TalentSignalClient);
    await createUnscopedWorkspaceSession({ sessionId });
    expect(saveAgentSession).toHaveBeenCalledWith(sessionId, expect.objectContaining({
      expected_revision: 0,
      idempotency_key: sessionId,
      payload: expect.objectContaining({ scopeKind: "unresolved_intent", turns: [] }),
    }));
  });

  it("saves only the draft while preserving the exact revision and payload", async () => {
    const current = record();
    const getAgentSession = vi.fn().mockResolvedValue(response(current));
    const saveAgentSession = vi.fn().mockImplementation(async (_id, request) =>
      response(record({ revision: 4, payload: request.payload })),
    );
    mocked.authenticatedClient.mockResolvedValue({ getAgentSession, saveAgentSession } as unknown as TalentSignalClient);
    const detail = await saveWorkspaceSessionDraft({
      composerDraft: "保留这个草稿",
      expectedRevision: 3,
      idempotencyKey: requestId,
      sessionId,
    });
    expect(saveAgentSession).toHaveBeenCalledWith(sessionId, expect.objectContaining({
      expected_revision: 3,
      idempotency_key: requestId,
      payload: expect.objectContaining({ composerDraft: "保留这个草稿", title: current.payload?.title }),
    }));
    expect(detail.record.revision).toBe(4);
  });

  it("fails closed when no authenticated backend client exists", async () => {
    mocked.authenticatedClient.mockResolvedValue(null);
    await expect(loadWorkspaceSessionDirectory()).rejects.toMatchObject({ status: 401 });
  });
});

