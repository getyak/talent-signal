import { describe, expect, it } from "vitest";

import {
  applyDraftInput,
  buildSaveRequest,
  initialDetailState,
  type SessionDetail,
} from "./session-detail-state";
import {
  createPendingSessionDraft,
  readPendingSessionDraft,
  writePendingSessionDraft,
} from "./session-draft-pending";
import {
  captureSessionSendCleanupIdentity,
  clearSentDraftStorage,
  forcedNoopCleanupKey,
  planDraftPersistence,
  planSessionSendCleanup,
  readbackMatchesSentDraft,
  resolveSessionSendCompletion,
} from "./session-send-cleanup";

const storageScope = "a".repeat(64);
const sessionId = "10000000-0000-4000-8000-000000000001";
const sendKey = "20000000-0000-4000-8000-000000000002";
const otherKey = "30000000-0000-4000-8000-000000000003";
const clock = Date.now();
const persistedAt = new Date(clock - 2_000).toISOString();
const newerAt = new Date(clock - 1_000).toISOString();

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
    composer_draft_updated_at: persistedAt,
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

function pendingDraft(input: {
  idempotencyKey: string;
  draft: string;
  updatedAt: string;
}) {
  return createPendingSessionDraft({
    baseRevision: 3,
    draft: input.draft,
    idempotencyKey: input.idempotencyKey,
    now: clock,
    predecessor: null,
    sessionId,
    storageScope,
    updatedAt: input.updatedAt,
  });
}

describe("Session send cleanup identity", () => {
  it("captures the untrimmed persisted draft distinct from the trimmed objective", () => {
    const identity = captureSessionSendCleanupIdentity({
      detail: detail({
        composer_draft: "  hello  ",
        composer_draft_updated_at: persistedAt,
      }),
      lastSavedDraft: "  hello  ",
    });

    expect(identity).toEqual({
      composerDraft: "  hello  ",
      composerDraftUpdatedAt: persistedAt,
    });
    expect(identity?.composerDraft).not.toBe(identity?.composerDraft.trim());
  });

  it("fails closed when saved and canonical drafts disagree or the timestamp is absent", () => {
    expect(captureSessionSendCleanupIdentity({
      detail: detail({ composer_draft: "server" }),
      lastSavedDraft: "local",
    })).toBeNull();
    expect(captureSessionSendCleanupIdentity({
      detail: detail({ composer_draft: "same", composer_draft_updated_at: null }),
      lastSavedDraft: "same",
    })).toBeNull();
  });

  it("matches only the exact draft text and updated-at", () => {
    const identity = { composerDraft: "hello", composerDraftUpdatedAt: persistedAt };

    expect(readbackMatchesSentDraft(identity, {
      composer_draft: "hello",
      composer_draft_updated_at: persistedAt,
    })).toBe(true);
    // Same text, newer canonical timestamp means another write happened.
    expect(readbackMatchesSentDraft(identity, {
      composer_draft: "hello",
      composer_draft_updated_at: newerAt,
    })).toBe(false);
    // New text at the captured timestamp is still a different draft.
    expect(readbackMatchesSentDraft(identity, {
      composer_draft: "newer",
      composer_draft_updated_at: persistedAt,
    })).toBe(false);
    // Old records have no identity; they must never match.
    expect(readbackMatchesSentDraft(undefined, {
      composer_draft: "hello",
      composer_draft_updated_at: persistedAt,
    })).toBe(false);
  });
});

describe("Session send cleanup planning", () => {
  const identity = { composerDraft: "hello", composerDraftUpdatedAt: persistedAt };
  const unchanged = {
    composer_draft: "hello",
    composer_draft_updated_at: persistedAt,
  };

  it("clears an unchanged draft successful cleanup", () => {
    expect(planSessionSendCleanup({
      identity,
      readback: unchanged,
      storage: "cleared",
    })).toEqual({ kind: "clear" });
  });

  it("preserves a newer server draft or a same-text newer timestamp", () => {
    expect(planSessionSendCleanup({
      identity,
      readback: { composer_draft: "new text", composer_draft_updated_at: newerAt },
      storage: "cleared",
    })).toEqual({ kind: "preserve", reason: "server-mismatch" });
    expect(planSessionSendCleanup({
      identity,
      readback: { composer_draft: "hello", composer_draft_updated_at: newerAt },
      storage: "cleared",
    })).toEqual({ kind: "preserve", reason: "server-mismatch" });
  });

  it("fails closed for old records without a cleanup identity", () => {
    expect(planSessionSendCleanup({
      identity: undefined,
      readback: unchanged,
      storage: "cleared",
    })).toEqual({ kind: "preserve", reason: "missing-identity" });
  });

  it("preserves a competing pending record even when the server draft matches", () => {
    expect(planSessionSendCleanup({
      identity,
      readback: unchanged,
      storage: "competing",
    })).toEqual({ kind: "preserve", reason: "competing-pending" });
    expect(planSessionSendCleanup({
      identity,
      readback: unchanged,
      storage: "unavailable",
    })).toEqual({ kind: "preserve", reason: "storage-unavailable" });
  });

  it("builds the empty cleanup write with the readback revision as CAS", () => {
    const readback = detail({
      composer_draft: "hello",
      composer_draft_updated_at: persistedAt,
      revision: 7,
    });
    const state = applyDraftInput(initialDetailState(readback), "");

    expect(state.draft).toBe("");
    expect(state.status).toBe("pending");
    expect(buildSaveRequest(state, otherKey, newerAt)).toEqual({
      composer_draft: "",
      composer_draft_updated_at: newerAt,
      expected_revision: 7,
      idempotency_key: otherKey,
    });
  });
});

describe("Session send durable record", () => {
  it("clears only its own pending record and preserves a competing one", () => {
    const target = memoryStorage();
    expect(writePendingSessionDraft(pendingDraft({
      idempotencyKey: sendKey,
      draft: "hello",
      updatedAt: persistedAt,
    }), target, clock)).toBe(true);

    expect(clearSentDraftStorage(storageScope, sessionId, sendKey, target)).toBe("cleared");
    expect(readPendingSessionDraft(storageScope, sessionId, target, clock)).toBeNull();

    expect(writePendingSessionDraft(pendingDraft({
      idempotencyKey: otherKey,
      draft: "typed in another tab",
      updatedAt: newerAt,
    }), target, clock)).toBe(true);

    expect(clearSentDraftStorage(storageScope, sessionId, sendKey, target)).toBe("competing");
    expect(readPendingSessionDraft(storageScope, sessionId, target, clock)?.latest.draft)
      .toBe("typed in another tab");
  });

  it("round-trips the cleanup identity across a reload and tolerates old records", () => {
    const target = memoryStorage();
    const send = {
      ...pendingDraft({
        idempotencyKey: sendKey,
        draft: "hello",
        updatedAt: persistedAt,
      }),
      purpose: "session-send",
      cleanup: { composerDraft: " hello ", composerDraftUpdatedAt: persistedAt },
    };
    expect(writePendingSessionDraft(send, target, clock)).toBe(true);

    const recovered = readPendingSessionDraft(storageScope, sessionId, target, clock);
    expect(recovered?.purpose).toBe("session-send");
    expect(recovered?.cleanup).toEqual({
      composerDraft: " hello ",
      composerDraftUpdatedAt: persistedAt,
    });

    // Records written before cleanup identity existed still recover for a
    // retry, but their drafts are preserved because cleanup cannot be proven.
    const legacy = {
      ...pendingDraft({
        idempotencyKey: otherKey,
        draft: "legacy draft",
        updatedAt: newerAt,
      }),
      purpose: "session-send",
    };
    expect(writePendingSessionDraft(legacy, target, clock)).toBe(true);
    const legacyRecovered = readPendingSessionDraft(storageScope, sessionId, target, clock);

    expect(legacyRecovered?.cleanup).toBeUndefined();
    expect(planSessionSendCleanup({
      identity: legacyRecovered?.cleanup,
      readback: detail({
        composer_draft: legacy.latest.draft,
        composer_draft_updated_at: legacy.latest.updatedAt,
      }),
      storage: "cleared",
    })).toEqual({ kind: "preserve", reason: "missing-identity" });
  });

  it("rejects a corrupt cleanup identity instead of trusting it", () => {
    const target = memoryStorage();
    const corrupt = {
      ...pendingDraft({
        idempotencyKey: sendKey,
        draft: "hello",
        updatedAt: persistedAt,
      }),
      purpose: "session-send",
      cleanup: { composerDraft: 7, composerDraftUpdatedAt: persistedAt },
    } as unknown as ReturnType<typeof pendingDraft>;

    expect(writePendingSessionDraft(corrupt, target, clock)).toBe(false);
    expect(readPendingSessionDraft(storageScope, sessionId, target, clock)).toBeNull();
  });

  it("never throws when the storage boundary is unavailable", () => {
    expect(clearSentDraftStorage(storageScope, sessionId, sendKey, null)).toBe("unavailable");
    expect(planSessionSendCleanup({
      identity: { composerDraft: "hello", composerDraftUpdatedAt: persistedAt },
      readback: { composer_draft: "hello", composer_draft_updated_at: persistedAt },
      storage: clearSentDraftStorage(storageScope, sessionId, sendKey, null),
    })).toEqual({ kind: "preserve", reason: "storage-unavailable" });
  });
});

describe("Session send completion transitions", () => {
  const identity = { composerDraft: "hello", composerDraftUpdatedAt: persistedAt };

  it("persists a newer server draft without adopting a competing record", () => {
    const completion = resolveSessionSendCompletion({
      competing: null,
      identity,
      readback: detail({
        composer_draft: "newer remote",
        composer_draft_updated_at: newerAt,
        revision: 9,
      }),
      storage: "cleared",
    });

    expect(completion.cleanupWrite).toBe(false);
    expect(completion.foreign).toBe(false);
    expect(completion.pending).toBeNull();
    expect(completion.state.draft).toBe("newer remote");
    expect(completion.state.conflict).toBe(false);
    expect(completion.notice).toContain("更新的草稿");
  });

  it("does not claim a clean local state when storage is unavailable", () => {
    const completion = resolveSessionSendCompletion({
      competing: null,
      identity,
      readback: detail({
        composer_draft: "hello",
        composer_draft_updated_at: persistedAt,
      }),
      storage: "unavailable",
    });

    expect(completion.cleanupWrite).toBe(false);
    expect(completion.foreign).toBe(false);
    expect(completion.notice).toContain("无法确认");
  });

  it("empties an unchanged draft only through the CAS cleanup path", () => {
    const completion = resolveSessionSendCompletion({
      competing: null,
      identity,
      readback: detail({
        composer_draft: "hello",
        composer_draft_updated_at: persistedAt,
        revision: 9,
      }),
      storage: "cleared",
    });

    expect(completion.cleanupWrite).toBe(true);
    expect(completion.state.draft).toBe("");
    expect(completion.state.status).toBe("pending");
    expect(buildSaveRequest(completion.state, otherKey, newerAt)?.expected_revision)
      .toBe(9);
  });

  it("recovers a competing draft, survives a forced no-op save, then an edit owns the slot", () => {
    const target = memoryStorage();
    const competing = pendingDraft({
      idempotencyKey: otherKey,
      draft: "hello",
      updatedAt: persistedAt,
    });
    expect(writePendingSessionDraft(competing, target, clock)).toBe(true);
    const readback = detail({
      composer_draft: "hello",
      composer_draft_updated_at: persistedAt,
      revision: 9,
    });

    // Completion detects the foreign record and adopts it with an explicit
    // conflict instead of rendering the readback and dropping the content.
    const storageStatus = clearSentDraftStorage(
      storageScope,
      sessionId,
      sendKey,
      target,
    );
    expect(storageStatus).toBe("competing");
    const completion = resolveSessionSendCompletion({
      competing,
      identity,
      readback,
      storage: storageStatus,
    });

    expect(completion.cleanupWrite).toBe(false);
    expect(completion.foreign).toBe(true);
    expect(completion.pending).toBe(competing);
    expect(completion.state.draft).toBe("hello");
    expect(completion.state.conflict).toBe(true);
    expect(completion.state.lastSavedDraft).toBe("hello");

    // A user pressing immediate-save with nothing new must not erase the
    // foreign record: there is no owned key to clear.
    const cleanupKey = forcedNoopCleanupKey({
      foreign: completion.foreign,
      pending: completion.pending,
    });
    expect(cleanupKey).toBeNull();
    expect(readPendingSessionDraft(storageScope, sessionId, target, clock)?.latest.idempotencyKey)
      .toBe(otherKey);

    // A real edit takes ownership and replaces the slot with the new draft.
    const edit = planDraftPersistence({
      adopted: completion.pending,
      current: completion.state,
      idempotencyKey: sendKey,
      now: clock,
      predecessor: null,
      sessionId,
      storageScope,
      updatedAt: newerAt,
      value: "edited after adoption",
    });

    expect(edit.foreign).toBe(false);
    expect(edit.clear).toBe(false);
    expect(edit.write).toBe(true);
    expect(edit.pending?.latest.draft).toBe("edited after adoption");
    expect(edit.pending?.latest.idempotencyKey).toBe(sendKey);
    expect(writePendingSessionDraft(edit.pending!, target, clock)).toBe(true);
    expect(readPendingSessionDraft(storageScope, sessionId, target, clock)?.latest.draft)
      .toBe("edited after adoption");
  });

  it("reverting an adopted competing draft keeps the foreign record", () => {
    const target = memoryStorage();
    const competing = pendingDraft({
      idempotencyKey: otherKey,
      draft: "other tab draft",
      updatedAt: newerAt,
    });
    expect(writePendingSessionDraft(competing, target, clock)).toBe(true);
    const readback = detail({
      composer_draft: "hello",
      composer_draft_updated_at: persistedAt,
      revision: 9,
    });
    const completion = resolveSessionSendCompletion({
      competing,
      identity,
      readback,
      storage: "competing",
    });

    const revert = planDraftPersistence({
      adopted: completion.pending,
      current: completion.state,
      idempotencyKey: sendKey,
      now: clock,
      predecessor: null,
      sessionId,
      storageScope,
      updatedAt: newerAt,
      value: "hello",
    });

    expect(revert.clear).toBe(false);
    expect(revert.write).toBe(false);
    expect(revert.foreign).toBe(true);
    expect(revert.pending).toBe(competing);
    expect(readPendingSessionDraft(storageScope, sessionId, target, clock)?.latest.draft)
      .toBe("other tab draft");
  });

  it("clears only a record this tab owns on a forced no-op save", () => {
    const owned = pendingDraft({
      idempotencyKey: sendKey,
      draft: "mine",
      updatedAt: persistedAt,
    });

    expect(forcedNoopCleanupKey({ foreign: false, pending: owned })).toBe(sendKey);
    expect(forcedNoopCleanupKey({ foreign: true, pending: owned })).toBeNull();
    expect(forcedNoopCleanupKey({ foreign: false, pending: null })).toBeNull();
  });
});
