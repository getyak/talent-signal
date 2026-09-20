import { describe, expect, it } from "vitest";

import {
  clearPendingSessionDraft,
  createPendingSessionDraft,
  findPendingSessionDraft,
  readPendingSessionDraft,
  writePendingSessionDraft,
} from "./session-draft-pending";

const SCOPE = "a".repeat(64);
const OTHER_SCOPE = "b".repeat(64);
const SESSION_A = "11111111-1111-4111-8111-111111111111";
const SESSION_B = "22222222-2222-4222-8222-222222222222";
const REQUEST_A = "33333333-3333-4333-8333-333333333333";

function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, value),
  } as Storage;
}

function draft(input: {
  storageScope: string;
  sessionId: string;
  requestId: string;
  objective: string;
  updatedAt: string;
  now?: number;
}) {
  return createPendingSessionDraft({
    baseRevision: 1,
    draft: input.objective,
    idempotencyKey: input.requestId,
    now: input.now,
    predecessor: null,
    sessionId: input.sessionId,
    storageScope: input.storageScope,
    updatedAt: input.updatedAt,
  });
}

describe("scoped pending-intent lookup", () => {
  it("returns the newest still-valid intent for the same partition", () => {
    const storage = memoryStorage();
    writePendingSessionDraft(
      draft({
        objective: "第一条",
        requestId: REQUEST_A,
        sessionId: SESSION_A,
        storageScope: SCOPE,
        updatedAt: "2026-09-20T00:00:00.000Z",
      }),
      storage,
    );
    const newer = draft({
      objective: "第二条",
      requestId: "44444444-4444-4444-8444-444444444444",
      sessionId: SESSION_B,
      storageScope: SCOPE,
      updatedAt: "2026-09-20T02:00:00.000Z",
    });
    writePendingSessionDraft(newer, storage);

    expect(findPendingSessionDraft(SCOPE, storage)?.sessionId).toBe(SESSION_B);
    // Another account's partition is never returned or counted.
    expect(findPendingSessionDraft(OTHER_SCOPE, storage)).toBe(null);
  });

  it("prunes expired or foreign records instead of reporting them", () => {
    const storage = memoryStorage();
    const expired = draft({
      objective: "过期",
      requestId: REQUEST_A,
      sessionId: SESSION_A,
      storageScope: SCOPE,
      updatedAt: "2026-09-18T00:00:00.000Z",
    });
    storage.setItem(
      `talent-signal:session-draft-pending:v1:${SCOPE}:${SESSION_A}`,
      JSON.stringify(expired),
    );
    const now = Date.parse(expired.expiresAt) + 1;
    expect(findPendingSessionDraft(SCOPE, storage, now)).toBe(null);
    expect(readPendingSessionDraft(SCOPE, SESSION_A, storage, now)).toBe(null);
    expect(storage.length).toBe(0);
  });

  it("keeps reload-after-failed-send a same-intent retry, then clears it on send", () => {
    const storage = memoryStorage();
    const pending = draft({
      objective: "发送失败也要恢复",
      requestId: REQUEST_A,
      sessionId: SESSION_A,
      storageScope: SCOPE,
      updatedAt: "2026-09-20T01:00:00.000Z",
    });
    expect(writePendingSessionDraft(pending, storage)).toBe(true);

    // A reload reads the same scoped record back unchanged.
    const recovered = findPendingSessionDraft(SCOPE, storage);
    expect(recovered?.sessionId).toBe(pending.sessionId);
    expect(recovered?.latest.idempotencyKey).toBe(REQUEST_A);
    expect(recovered?.latest.draft).toBe(pending.latest.draft);

    // Only the exact intent key may clear the record after a success.
    clearPendingSessionDraft(SCOPE, SESSION_A, "55555555-5555-4555-8555-555555555555", storage);
    expect(findPendingSessionDraft(SCOPE, storage)?.sessionId).toBe(SESSION_A);
    clearPendingSessionDraft(SCOPE, SESSION_A, REQUEST_A, storage);
    expect(findPendingSessionDraft(SCOPE, storage)).toBe(null);
  });
});

it("does not mistake a normal session draft for a home composer intent", () => {
  const storage = memoryStorage();
  const now = Date.now();
  const base = draft({ storageScope: SCOPE, sessionId: SESSION_A, requestId: REQUEST_A, objective: "saved editor", updatedAt: new Date(now).toISOString(), now });
  writePendingSessionDraft(base, storage, now);
  expect(findPendingSessionDraft(SCOPE, storage, now, "conversation-home")).toBeNull();
  writePendingSessionDraft({ ...base, purpose: "conversation-home" } as typeof base, storage, now);
  expect(findPendingSessionDraft(SCOPE, storage, now, "conversation-home")?.latest.draft).toBe("saved editor");
});
