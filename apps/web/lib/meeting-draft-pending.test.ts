import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearPendingMeetingDraftEdit,
  clearAllPendingMeetingDraftIntents,
  clearPendingMeetingDraftDismiss,
  clearOtherMeetingDraftBindings,
  meetingDraftDismissRejectionIsAuthoritative,
  meetingDraftIntentIsKnownClean,
  purgeUnavailableMeetingDraftIntents,
  readPendingMeetingDraftDismiss,
  readPendingMeetingDraftEdit,
  writePendingMeetingDraftEdit,
  writePendingMeetingDraftDismiss,
  type PendingMeetingDraftEdit,
} from "./meeting-draft-pending";

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

const pending = (override: Partial<PendingMeetingDraftEdit> = {}): PendingMeetingDraftEdit => ({
  draftId: "10000000-0000-4000-8000-000000000001",
  end: "2026-09-17T10:00:00",
  expectedRevision: 2,
  expiresAt: "2099-09-30T00:00:00.000Z",
  idempotencyKey: "20000000-0000-4000-8000-000000000002",
  savedAt: "2026-09-16T00:00:00.000Z",
  sessionVersion: "synthetic-binding",
  start: "2026-09-17T09:30:00",
  title: "Synthetic review",
  v: 1,
  ...override,
});

beforeEach(() => {
  vi.stubGlobal("window", { sessionStorage: memoryStorage() });
});

afterEach(() => vi.unstubAllGlobals());

describe("meeting draft pending intent", () => {
  it("keeps the exact dismissal identity for ambiguous gateway responses", () => {
    expect(meetingDraftDismissRejectionIsAuthoritative(408, "REQUEST_TIMEOUT")).toBe(false);
    expect(meetingDraftDismissRejectionIsAuthoritative(425, "TOO_EARLY")).toBe(false);
    expect(meetingDraftDismissRejectionIsAuthoritative(429, "RATE_LIMITED")).toBe(false);
    expect(meetingDraftDismissRejectionIsAuthoritative(400, undefined)).toBe(false);
    expect(meetingDraftDismissRejectionIsAuthoritative(400, "REQUEST_TIMEOUT")).toBe(false);
    expect(meetingDraftDismissRejectionIsAuthoritative(412, "MEETING_DRAFT_INVALID")).toBe(false);
    expect(meetingDraftDismissRejectionIsAuthoritative(
      409,
      "MEETING_DRAFT_REVISION_CONFLICT",
    )).toBe(true);
  });

  it("never treats a baseline-looking edit as clean after an unknown response", () => {
    const baseline = {
      title: "Initial",
      starts_at: "2026-09-17T01:00:00.000Z",
      ends_at: "2026-09-17T02:00:00.000Z",
    };
    expect(meetingDraftIntentIsKnownClean(baseline, baseline, false)).toBe(true);
    expect(meetingDraftIntentIsKnownClean(baseline, baseline, true)).toBe(false);
  });

  it("persists the exact operation identity before an unknown response retry", () => {
    const intent = pending();
    expect(writePendingMeetingDraftEdit(intent)).toBe(true);
    expect(readPendingMeetingDraftEdit(intent.draftId, intent.sessionVersion)).toEqual(intent);
    clearPendingMeetingDraftEdit(intent.draftId, intent.sessionVersion);
    expect(readPendingMeetingDraftEdit(intent.draftId, intent.sessionVersion)).toBeNull();
  });

  it("rejects malformed or unbounded recovery data", () => {
    const malformed = pending({ expiresAt: "not-a-date" });
    expect(writePendingMeetingDraftEdit(malformed)).toBe(true);
    expect(readPendingMeetingDraftEdit(malformed.draftId, malformed.sessionVersion)).toBeNull();
  });

  it("rejects a payload whose identity does not match its storage key", () => {
    const intent = pending();
    expect(writePendingMeetingDraftEdit(intent)).toBe(true);
    const storedKey = window.sessionStorage.key(0);
    expect(storedKey).not.toBeNull();
    window.sessionStorage.setItem(
      storedKey!,
      JSON.stringify({
        ...intent,
        draftId: "50000000-0000-4000-8000-000000000005",
      }),
    );
    expect(readPendingMeetingDraftEdit(intent.draftId, intent.sessionVersion)).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
  });

  it("removes an older exact intent when its replacement cannot be stored", () => {
    const previous = pending();
    expect(writePendingMeetingDraftEdit(previous)).toBe(true);
    const backing = window.sessionStorage;
    const failing = {
      ...backing,
      get length() { return backing.length; },
      key: (index: number) => backing.key(index),
      removeItem: (itemKey: string) => backing.removeItem(itemKey),
      setItem: () => { throw new Error("quota"); },
    } satisfies Storage;
    vi.stubGlobal("window", { sessionStorage: failing });

    expect(writePendingMeetingDraftEdit(previous)).toBe(false);
    expect(readPendingMeetingDraftEdit(
      previous.draftId,
      previous.sessionVersion,
    )).toBeNull();
  });

  it("purges another binding and unavailable drafts only after an authoritative list", () => {
    const active = pending();
    const inactive = pending({ draftId: "30000000-0000-4000-8000-000000000003" });
    const oldBinding = pending({
      draftId: "40000000-0000-4000-8000-000000000004",
      sessionVersion: "old-binding",
    });
    for (const item of [active, inactive, oldBinding]) {
      expect(writePendingMeetingDraftEdit(item)).toBe(true);
    }
    purgeUnavailableMeetingDraftIntents(
      active.sessionVersion,
      new Set([active.draftId]),
    );
    expect(readPendingMeetingDraftEdit(active.draftId, active.sessionVersion)).toEqual(active);
    expect(readPendingMeetingDraftEdit(inactive.draftId, inactive.sessionVersion)).toBeNull();
    expect(readPendingMeetingDraftEdit(oldBinding.draftId, oldBinding.sessionVersion)).toBeNull();
  });

  it("reuses the exact dismiss operation after a reload until readback succeeds", () => {
    const intent = {
      draftId: pending().draftId,
      expectedRevision: 2,
      expiresAt: pending().expiresAt,
      idempotencyKey: "60000000-0000-4000-8000-000000000006",
      savedAt: pending().savedAt,
      sessionVersion: pending().sessionVersion,
      v: 1 as const,
    };
    expect(writePendingMeetingDraftDismiss(intent)).toBe(true);
    expect(readPendingMeetingDraftDismiss(
      intent.draftId,
      intent.sessionVersion,
    )).toEqual(intent);
    clearPendingMeetingDraftDismiss(intent.draftId, intent.sessionVersion);
    expect(readPendingMeetingDraftDismiss(
      intent.draftId,
      intent.sessionVersion,
    )).toBeNull();
  });

  it("clears sensitive projections immediately on binding change and logout", () => {
    const current = pending();
    const previous = pending({
      draftId: "40000000-0000-4000-8000-000000000004",
      sessionVersion: "old-binding",
    });
    expect(writePendingMeetingDraftEdit(current)).toBe(true);
    expect(writePendingMeetingDraftEdit(previous)).toBe(true);
    window.sessionStorage.setItem("unrelated", "preserve");

    clearOtherMeetingDraftBindings(current.sessionVersion);
    expect(readPendingMeetingDraftEdit(current.draftId, current.sessionVersion)).toEqual(current);
    expect(readPendingMeetingDraftEdit(previous.draftId, previous.sessionVersion)).toBeNull();
    expect(window.sessionStorage.getItem("unrelated")).toBe("preserve");

    const dismiss = {
      draftId: current.draftId,
      expectedRevision: current.expectedRevision,
      expiresAt: current.expiresAt,
      idempotencyKey: "60000000-0000-4000-8000-000000000006",
      savedAt: current.savedAt,
      sessionVersion: current.sessionVersion,
      v: 1 as const,
    };
    expect(writePendingMeetingDraftDismiss(dismiss)).toBe(true);

    clearAllPendingMeetingDraftIntents();
    expect(readPendingMeetingDraftEdit(current.draftId, current.sessionVersion)).toBeNull();
    expect(readPendingMeetingDraftDismiss(
      dismiss.draftId,
      dismiss.sessionVersion,
    )).toBeNull();
    expect(window.sessionStorage.getItem("unrelated")).toBe("preserve");
  });
});
