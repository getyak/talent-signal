import { describe, expect, it } from "vitest";

import {
  boundedDraft,
  conflictView,
  directoryStateNotice,
  draftStatusAfterSave,
  sessionExpiryNotice,
  sessionScopeView,
  shouldPersistDraft,
} from "./session-view";

describe("Session workbench display decisions", () => {
  it("never silently drops a keystroke that arrives during save", () => {
    expect(draftStatusAfterSave("newer local draft", "sent draft")).toBe("pending");
    expect(draftStatusAfterSave("sent draft", "sent draft")).toBe("saved");
  });

  it("bounds drafts to the canonical contract", () => {
    expect(boundedDraft("a".repeat(12_001))).toHaveLength(12_000);
  });

  it("blocks automatic retry while a conflict needs explicit recovery", () => {
    expect(shouldPersistDraft({ debounceMs: 900, elapsedMs: 1_000, lastSaved: "a", next: "b", status: "conflict" })).toBe(false);
    expect(conflictView().message).toContain("没有生效");
  });

  it("keeps incomplete empty pages distinct from a complete empty account", () => {
    expect(directoryStateNotice({ complete: true, total: 0 })).toContain("还没有");
    expect(directoryStateNotice({ complete: false, total: 0 })).toContain("未载入");
  });

  it("links relationship scope with an exact return Session", () => {
    const result = sessionScopeView({
      contextLabel: "产品负责人寻访",
      personId: "10000000-0000-4000-8000-000000000004",
      personLabel: "林珊",
      relationshipContextId: "10000000-0000-4000-8000-000000000005",
      scopeKind: "relationship",
      sessionId: "10000000-0000-4000-8000-000000000001",
    });
    expect(result.returnHref).toContain("session=10000000-0000-4000-8000-000000000001");
    expect(result.claimsScopeChange).toBe(false);
  });

  it("shows expiry only when decision relevant", () => {
    const now = new Date("2026-09-16T00:00:00.000Z");
    expect(sessionExpiryNotice("2026-09-26T00:00:00.000Z", now)).toBeNull();
    expect(sessionExpiryNotice("2026-09-18T00:00:00.000Z", now)).toContain("2 天");
  });
});

