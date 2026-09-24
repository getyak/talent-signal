import { describe, expect, it } from "vitest";

import { applyOpenSessionRefresh } from "./session-open-refresh";
import {
  applyDraftInput,
  initialDetailState,
  type DetailState,
  type SessionDetail,
} from "./session-detail-state";

function turn(id: string, text: string) {
  return { id, role: "assistant", text, created_at: "2026-09-25T00:00:00.000Z" } as never;
}

function detail(overrides: Partial<SessionDetail> = {}): SessionDetail {
  return {
    session_id: "10000000-0000-4000-8000-000000000001",
    revision: 3,
    updated_at: "2026-09-25T00:00:00.000Z",
    expires_at: "2030-01-01T00:00:00.000Z",
    state: "active",
    title: "准备下次沟通",
    turn_count: 1,
    is_unread: false,
    scope_kind: "unresolved_intent",
    person_id: null,
    relationship_context_id: null,
    person_label: "",
    context_label: "",
    deleted_at: null,
    display_authority: "stale_unconfirmed",
    composer_draft: null,
    composer_draft_updated_at: null,
    turns: [turn("turn-1", "第一条")],
    ...overrides,
  };
}

function typedState(): DetailState {
  const base = initialDetailState(detail());
  // A reader composing a message (with IME composition in progress) must not
  // lose a single keystroke to a background refresh.
  return applyDraftInput(base, "正在写的草稿");
}

const fence = { generation: 2, activeGeneration: 2, sessionId: detail().session_id };

describe("open Session active refresh", () => {
  it("merges newly committed remote turns and keeps the local draft untouched", () => {
    const state = typedState();
    const remote = detail({
      revision: 4,
      turn_count: 2,
      turns: [turn("turn-1", "第一条"), turn("turn-2", "另一台设备的新消息")],
    });
    const result = applyOpenSessionRefresh(state, remote, fence);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(result.addedTurnIds).toEqual(["turn-2"]);
    expect(result.state.detail.turns.map((entry) => entry.id)).toEqual(["turn-1", "turn-2"]);
    expect(result.state.draft).toBe("正在写的草稿");
    expect(result.state.status).toBe("pending");
  });

  it("keeps local-only in-flight turns in place during a merge", () => {
    const state: DetailState = {
      ...typedState(),
      detail: detail({ turns: [turn("turn-1", "第一条"), turn("local-inflight", "本地在途")] }),
    };
    const remote = detail({ revision: 4, turns: [turn("turn-1", "第一条")] });
    const result = applyOpenSessionRefresh(state, remote, fence);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(result.state.detail.turns.map((entry) => entry.id)).toEqual(["turn-1", "local-inflight"]);
  });

  it("drops late responses after a scope or session switch", () => {
    const state = typedState();
    const remote = detail({ revision: 9, turns: [] });
    expect(applyOpenSessionRefresh(state, remote, { ...fence, generation: 1 })).toEqual({
      kind: "stale",
    });
    expect(
      applyOpenSessionRefresh(state, detail({ session_id: "20000000-0000-4000-8000-000000000002" }), fence),
    ).toEqual({ kind: "stale" });
  });

  it("applies remote tombstones without resurrecting deleted history", () => {
    const state = typedState();
    const remote = detail({ state: "deleted", deleted_at: "2026-09-25T01:00:00.000Z", turns: [] });
    const result = applyOpenSessionRefresh(state, remote, fence);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(result.state.detail.state).toBe("deleted");
    expect(result.state.detail.turns).toEqual([]);
  });

  it("refuses to overwrite newer local state from a regressed revision", () => {
    const state = typedState();
    const remote = detail({ revision: 2, turns: [] });
    const result = applyOpenSessionRefresh(state, remote, fence);
    expect(result.kind).toBe("conflict");
    if (result.kind !== "conflict") return;
    expect(result.state.conflict).toBe(true);
    expect(result.state.draft).toBe("正在写的草稿");
    expect(result.state.detail.turns).toHaveLength(1);
  });

  it("reports a quiet unchanged refresh without touching the editor", () => {
    const state = typedState();
    const remote = detail({ revision: 3, turns: [turn("turn-1", "第一条")] });
    const result = applyOpenSessionRefresh(state, remote, fence);
    expect(result.kind).toBe("unchanged");
    if (result.kind !== "unchanged") return;
    expect(result.state.draft).toBe("正在写的草稿");
  });
});
