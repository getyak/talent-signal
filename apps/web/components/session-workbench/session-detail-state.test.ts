import { describe, expect, it } from "vitest";

import {
  applyDraftInput,
  applyReload,
  buildSaveRequest,
  initialDetailState,
  markConflict,
  markSaved,
  shouldRetainDraftAfterConflict,
  type SessionDetail,
} from "./session-detail-state";

const sessionId = "10000000-0000-4000-8000-000000000001";
const requestId = "10000000-0000-4000-8000-000000000002";
const updatedAt = "2026-09-16T00:00:01.000Z";
const detail: SessionDetail = {
  composer_draft: "server draft",
  composer_draft_updated_at: "2026-09-16T00:00:00.000Z",
  context_label: "",
  deleted_at: null,
  display_authority: "stale_unconfirmed",
  expires_at: "2099-01-01T00:00:00.000Z",
  is_unread: false,
  person_id: null,
  person_label: "",
  relationship_context_id: null,
  revision: 3,
  scope_kind: "unresolved_intent",
  session_id: sessionId,
  state: "active",
  title: "会话",
  turn_count: 0,
  turns: [],
  updated_at: "2026-09-16T00:00:00.000Z",
};

describe("Session draft state", () => {
  it("preserves local draft through a revision conflict", () => {
    const conflict = markConflict(applyDraftInput(initialDetailState(detail), "local draft"));
    expect(conflict.draft).toBe("local draft");
    expect(conflict.detail.revision).toBe(3);
    expect(conflict.status).toBe("conflict");
  });

  it("preserves newer input when an older in-flight save succeeds", () => {
    const state = applyDraftInput(initialDetailState(detail), "newer draft");
    const saved = markSaved(state, { ...detail, composer_draft: "sent draft", revision: 4 }, "sent draft");
    expect(saved.draft).toBe("newer draft");
    expect(saved.lastSavedDraft).toBe("sent draft");
    expect(saved.status).toBe("pending");
  });

  it("reloads canonical revision without discarding the local conflict draft", () => {
    const state = markConflict(applyDraftInput(initialDetailState(detail), "local draft"));
    const reloaded = applyReload(state, { ...detail, composer_draft: "other device", revision: 4 });
    expect(reloaded.detail.revision).toBe(4);
    expect(reloaded.draft).toBe("local draft");
    expect(reloaded.lastSavedDraft).toBe("other device");
    expect(reloaded.conflict).toBe(true);
    expect(reloaded.status).toBe("conflict");
  });

  it("does not schedule a save after editing or reverting a conflicted draft", () => {
    const conflict = markConflict(applyDraftInput(initialDetailState(detail), "local draft"));
    expect(applyDraftInput(conflict, "edited locally").status).toBe("conflict");
    const clean = applyDraftInput(initialDetailState(detail), "server draft");
    expect(clean.status).toBe("saved");
  });

  it("builds a retryable mutation with exact revision and identity", () => {
    const state = applyDraftInput(initialDetailState(detail), "changed");
    expect(buildSaveRequest(state, requestId, updatedAt)).toEqual({
      composer_draft: "changed",
      composer_draft_updated_at: updatedAt,
      expected_revision: 3,
      idempotency_key: requestId,
    });
    expect(buildSaveRequest(markConflict(state), requestId, updatedAt)).toBeNull();
  });

  it("retains recovery only for a canonical revision conflict", () => {
    expect(shouldRetainDraftAfterConflict(409, "AGENT_SESSION_REVISION_CONFLICT")).toBe(true);
    expect(shouldRetainDraftAfterConflict(409, "AGENT_SESSION_SOURCE_BUSY")).toBe(true);
    expect(shouldRetainDraftAfterConflict(409, "session_stale")).toBe(false);
    expect(shouldRetainDraftAfterConflict(409, "AGENT_SESSION_IDEMPOTENCY_CONFLICT")).toBe(false);
    expect(shouldRetainDraftAfterConflict(409, undefined)).toBe(false);
  });
});
