import { describe, expect, it } from "vitest";

import type { SessionDetail } from "./session-detail-state";
import {
  beginPendingSessionDraft,
  clearAllPendingSessionDrafts,
  clearPendingSessionDraft,
  createPendingSessionDraft,
  pendingSessionDraftRequest,
  prunePendingSessionDrafts,
  readPendingSessionDraft,
  resolvePendingSessionDraft,
  writePendingSessionDraft,
} from "./session-draft-pending";
import { SessionSaveDrain } from "./session-save-drain";

const storageScope = "a".repeat(64);
const sessionId = "10000000-0000-4000-8000-000000000001";
const firstKey = "20000000-0000-4000-8000-000000000002";
const latestKey = "30000000-0000-4000-8000-000000000003";
const firstTime = "2026-09-16T00:00:00.000Z";
const latestTime = "2026-09-16T00:00:01.000Z";
const clock = Date.parse("2026-09-16T00:00:02.000Z");

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

function detail(overrides: Partial<SessionDetail> = {}): SessionDetail {
  return {
    composer_draft: "server",
    composer_draft_updated_at: "2026-09-15T00:00:00.000Z",
    context_label: "",
    deleted_at: null,
    display_authority: "stale_unconfirmed",
    expires_at: "2099-09-16T00:00:00.000Z",
    is_unread: false,
    person_id: null,
    person_label: "",
    relationship_context_id: null,
    revision: 3,
    scope_kind: "unresolved_intent",
    session_id: sessionId,
    state: "active",
    title: "Synthetic",
    turn_count: 0,
    turns: [],
    updated_at: "2026-09-16T00:00:00.000Z",
    ...overrides,
  };
}

describe("pending Session draft recovery", () => {
  it("recovers latest B after A was in flight during pagehide and unmount", async () => {
    const target = memoryStorage();
    const drain = new SessionSaveDrain();
    let settleFirst!: () => void;
    const first = new Promise<void>((resolve) => { settleFirst = resolve; });
    const firstRequest = {
      composer_draft: "A",
      composer_draft_updated_at: firstTime,
      expected_revision: 3,
      idempotency_key: firstKey,
    };
    const active = drain.run(async () => first);
    const latest = createPendingSessionDraft({
      baseRevision: 3,
      draft: "B",
      idempotencyKey: latestKey,
      now: clock,
      predecessor: firstRequest,
      sessionId,
      storageScope,
      updatedAt: latestTime,
    });
    expect(writePendingSessionDraft(latest, target, clock)).toBe(true);

    // pagehide can only queue B while A is active; unmount fences that queue.
    void drain.run(async () => undefined, true);
    drain.invalidate();
    settleFirst();
    await active;

    const restarted = readPendingSessionDraft(storageScope, sessionId, target, clock + 1);
    expect(restarted?.latest.draft).toBe("B");
    const resolution = resolvePendingSessionDraft(
      restarted!,
      detail({
        composer_draft: "A",
        composer_draft_updated_at: firstTime,
        revision: 4,
      }),
      clock + 2,
    );
    expect(resolution.kind).toBe("continue");
    if (resolution.kind !== "continue") throw new Error("expected recovery");
    expect(pendingSessionDraftRequest(resolution.pending, 4)).toEqual({
      composer_draft: "B",
      composer_draft_updated_at: latestTime,
      expected_revision: 4,
      idempotency_key: latestKey,
    });
  });

  it("settles an exact unknown-response replay and conflicts on unrelated change", () => {
    const pending = beginPendingSessionDraft(
      createPendingSessionDraft({
        baseRevision: 3,
        draft: "B",
        idempotencyKey: latestKey,
        now: clock,
        predecessor: null,
        sessionId,
        storageScope,
        updatedAt: latestTime,
      }),
      3,
      clock,
    );
    expect(resolvePendingSessionDraft(
      pending,
      detail({
        composer_draft: "B",
        composer_draft_updated_at: latestTime,
        revision: 4,
      }),
      clock + 1,
    )).toEqual({ kind: "settled" });
    expect(resolvePendingSessionDraft(
      pending,
      detail({
        composer_draft: "other device",
        composer_draft_updated_at: "2026-09-16T00:00:03.000Z",
        revision: 4,
      }),
      clock + 1,
    )).toEqual({ kind: "conflict" });
  });

  it("rejects malformed records and prunes expired or other-account entries", () => {
    const target = memoryStorage();
    const pending = createPendingSessionDraft({
      baseRevision: 3,
      draft: "B",
      idempotencyKey: latestKey,
      now: clock,
      predecessor: null,
      sessionId,
      storageScope,
      updatedAt: latestTime,
    });
    expect(writePendingSessionDraft(pending, target, clock)).toBe(true);
    const otherScope = "b".repeat(64);
    expect(writePendingSessionDraft(
      { ...pending, storageScope: otherScope },
      target,
      clock,
    )).toBe(true);
    target.setItem(
      `talent-signal:session-draft-pending:v1:${storageScope}:malformed`,
      JSON.stringify({ draft: "private" }),
    );

    prunePendingSessionDrafts(storageScope, target, clock + 1);
    expect(readPendingSessionDraft(storageScope, sessionId, target, clock + 1)).toEqual(pending);
    expect(readPendingSessionDraft(otherScope, sessionId, target, clock + 1)).toBeNull();
    expect(target.length).toBe(1);

    clearAllPendingSessionDrafts(target);
    expect(target.length).toBe(0);
  });

  it("keeps the last durable predecessor when a replacement cannot be stored", () => {
    const target = memoryStorage();
    const first = createPendingSessionDraft({
      baseRevision: 3,
      draft: "A",
      idempotencyKey: firstKey,
      now: clock,
      predecessor: null,
      sessionId,
      storageScope,
      updatedAt: firstTime,
    });
    expect(writePendingSessionDraft(first, target, clock)).toBe(true);
    const replacement = createPendingSessionDraft({
      baseRevision: 3,
      draft: "B",
      idempotencyKey: latestKey,
      now: clock + 1,
      predecessor: pendingSessionDraftRequest(first, 3),
      sessionId,
      storageScope,
      updatedAt: latestTime,
    });
    const failing = {
      clear: target.clear,
      getItem: target.getItem,
      key: target.key,
      get length() { return target.length; },
      removeItem: target.removeItem,
      setItem: () => { throw new Error("quota"); },
    } satisfies Storage;

    expect(writePendingSessionDraft(replacement, failing, clock + 1)).toBe(false);
    expect(readPendingSessionDraft(storageScope, sessionId, target, clock + 2)).toEqual(first);
  });

  it("rejects a future-dated record instead of extending retention beyond 24 hours", () => {
    const target = memoryStorage();
    const future = createPendingSessionDraft({
      baseRevision: 3,
      draft: "future",
      idempotencyKey: latestKey,
      now: Date.parse("2099-01-01T00:00:00.000Z"),
      predecessor: null,
      sessionId,
      storageScope,
      updatedAt: latestTime,
    });
    target.setItem(
      `talent-signal:session-draft-pending:v1:${storageScope}:${sessionId}`,
      JSON.stringify(future),
    );

    expect(readPendingSessionDraft(storageScope, sessionId, target, clock)).toBeNull();
    expect(target.length).toBe(0);
  });

  it("never throws when browser storage inventory and removal are denied", () => {
    const denied = {
      clear: () => { throw new Error("denied"); },
      getItem: () => { throw new Error("denied"); },
      key: () => { throw new Error("denied"); },
      get length(): number { throw new Error("denied"); },
      removeItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("denied"); },
    } satisfies Storage;

    expect(() => readPendingSessionDraft(storageScope, sessionId, denied, clock)).not.toThrow();
    expect(() => prunePendingSessionDrafts(storageScope, denied, clock)).not.toThrow();
    expect(() => clearPendingSessionDraft(storageScope, sessionId, undefined, denied)).not.toThrow();
    expect(() => clearAllPendingSessionDrafts(denied)).not.toThrow();
    expect(writePendingSessionDraft(
      createPendingSessionDraft({
        baseRevision: 3,
        draft: "B",
        idempotencyKey: latestKey,
        now: clock,
        predecessor: null,
        sessionId,
        storageScope,
        updatedAt: latestTime,
      }),
      denied,
      clock,
    )).toBe(false);
  });
});
