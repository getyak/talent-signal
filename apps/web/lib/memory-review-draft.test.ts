import { describe, expect, it } from "vitest";
import type {
  MemoryProposalItem,
  MemoryReviewView,
  MemoryScope,
} from "@talent-signal/contracts";

import {
  buildCommitDraft,
  buildDraftRequest,
  createDraftState,
  groupItems,
  groupSelection,
  selectedCount,
  selectedItemIds,
  setDecision,
  skipContact,
  restoreContact,
  toggleItem,
  toggleGroup,
  visibleItems,
} from "./memory-review-draft";

function item(
  overrides: Partial<MemoryProposalItem> & { id: string; scope: MemoryScope },
): MemoryProposalItem {
  const { id, scope, ...rest } = overrides;
  const text = overrides.display_text ?? `记忆 ${id}`;
  return {
    id,
    scope,
    subject_kind: scope === "self" ? "owner_self" : "resolved_subject",
    relationship_kind: "none",
    operation: "add",
    statement_kind: "fact",
    display_text: text,
    original_display_text: text,
    time_status: "known",
    sensitivity: "normal",
    admission_status: "eligible",
    judgment_kind: "ordinary",
    default_selected: true,
    reason: "以后会用得上",
    source_excerpt: text,
    source_locator: { kind: "message", session_id: null, message_id: null },
    added_revision: 1,
    status: "pending",
    ...rest,
  };
}

function review(items: MemoryProposalItem[]): MemoryReviewView {
  return {
    contract_version: "2026-08-24.10",
    review_scope_id: "11111111-1111-4111-8111-111111111111",
    review_revision: 0,
    purpose: "chat",
    proposal_id: "22222222-2222-4222-8222-222222222222",
    proposal_revision: 1,
    allowed_scope: "all",
    person_id: "33333333-3333-4333-8333-333333333333",
    relationship_context_id: "44444444-4444-4444-8444-444444444444",
    person_display_label: "陈宇",
    relationship_display_label: "设计合作",
    contact_decision: "new",
    contact_status: "pending",
    status: "open",
    expires_at: "2026-09-23T00:00:00.000Z",
    visible_item_count: items.length,
    visible_default_selected_count: items.filter((i) => i.default_selected).length,
    source_status: "available",
    source_unavailable_visible_item_count: 0,
    items,
    draft: null,
  };
}

function seventeen(): MemoryReviewView {
  const items: MemoryProposalItem[] = [
    ...Array.from({ length: 3 }, (_, i) => item({ id: `self-${i}`, scope: "self" })),
    ...Array.from({ length: 8 }, (_, i) => item({ id: `person-${i}`, scope: "person" })),
    ...Array.from({ length: 6 }, (_, i) => item({ id: `rel-${i}`, scope: "relationship" })),
  ];
  return review(items);
}

describe("shared Memory review draft reducer", () => {
  it("defaults the eligible 3/8/6 set to 17 selected", () => {
    const view = seventeen();
    const state = createDraftState(view);
    expect(selectedCount(state, visibleItems(view.items, state.contactDecision))).toBe(17);
  });

  it("toggles one person item to 16 and keeps the count stable across a re-render", () => {
    const view = seventeen();
    let state = createDraftState(view);
    const person = view.items.find((entry) => entry.id === "person-0")!;
    state = toggleItem(state, person);
    expect(selectedCount(state, view.items)).toBe(16);
    // A new snapshot of the same review rebases by stable id.
    const rebased = createDraftState({ ...view, review_revision: 1 }, state);
    expect(rebased.selected["person-0"]).toBe(false);
    expect(selectedCount(rebased, view.items)).toBe(16);
  });

  it("selects all eligible ordinary items but never judgment items", () => {
    const view = review([
      item({ id: "a", scope: "person" }),
      item({ id: "b", scope: "person", default_selected: false }),
      item({
        id: "conflict",
        scope: "person",
        admission_status: "needs_judgment",
        judgment_kind: "conflict",
        default_selected: false,
      }),
    ]);
    const state = createDraftState(view);
    const personGroup = groupItems(view.items).find((group) => group.scope === "person")!;
    const toggled = toggleGroup(state, personGroup.items);
    expect(toggled.selected.a).toBe(true);
    expect(toggled.selected.b).toBe(true);
    expect(toggled.selected.conflict).not.toBe(true);
  });

  it("excludes conflicts from the group total and selection math", () => {
    const view = review([
      item({ id: "a", scope: "relationship" }),
      item({
        id: "conflict",
        scope: "relationship",
        admission_status: "needs_judgment",
        judgment_kind: "conflict",
        default_selected: false,
      }),
    ]);
    const state = createDraftState(view);
    const group = groupItems(view.items)[0]!;
    const selection = groupSelection(state, group.items);
    expect(selection.total).toBe(1);
    expect(selection.selected).toBe(1);
  });

  it("skip contact hides person/relationship but preserves remembered intent", () => {
    const view = review([
      item({ id: "self-independent", scope: "self" }),
      item({
        id: "self-contact",
        scope: "self",
        relationship_kind: "proposal_target_context",
      }),
      item({ id: "person", scope: "person" }),
      item({ id: "rel", scope: "relationship" }),
    ]);
    let state = createDraftState(view);
    state = skipContact(state);
    const visible = visibleItems(view.items, state.contactDecision);
    // Only the independent self item is visible/submittable while skipped.
    expect(visible.map((entry) => entry.id)).toEqual(["self-independent"]);
    // The dependent intent is preserved in the draft, not cleared.
    expect(state.selected.person).toBe(true);
    expect(state.selected.rel).toBe(true);
    expect(state.selected["self-contact"]).toBe(true);
    expect(state.selected["self-independent"]).toBe(true);
    // The persisted draft keeps the complete purpose-authorized intent...
    const draftBody = buildDraftRequest(state, view);
    expect(draftBody.selected_item_ids.sort()).toEqual(["person", "rel", "self-contact", "self-independent"]);
    // ...while only the commit projection drops the hidden dependent scope.
    const commitBody = buildCommitDraft(state, view);
    expect(commitBody.selected_item_ids).toEqual(["self-independent"]);
  });

  it("restore uses the frozen original decision and keeps intent made while skipped", () => {
    const view = seventeen();
    let state = createDraftState(view);
    state = toggleItem(state, view.items.find((entry) => entry.id === "rel-3")!); // 16
    state = skipContact(state);
    state = toggleItem(state, view.items.find((entry) => entry.id === "self-0")!); // 15 intent
    state = restoreContact(state, view.contact_decision);
    expect(state.contactDecision).toBe("new");
    expect(selectedCount(state, view.items)).toBe(15);
    expect(state.selected["rel-3"]).toBe(false);
    expect(state.selected["self-0"]).toBe(false);
  });

  it("a reload derives the original mode from the frozen review and saved draft intent", () => {
    const view = seventeen();
    let state = createDraftState(view);
    state = toggleItem(state, view.items.find((entry) => entry.id === "person-0")!); // 16
    state = skipContact(state);
    const visibleSkipped = visibleItems(view.items, state.contactDecision);
    const draft = {
      contact_decision: "none" as const,
      selected_item_ids: selectedItemIds(state, visibleSkipped),
      edited_text: {},
      item_decisions: {},
      revision: 1,
      updated_at: new Date().toISOString(),
    };
    // A fresh open with the saved draft restores the skipped mode and intent,
    // with no ephemeral client snapshot involved.
    const reloaded = createDraftState({ ...view, draft });
    expect(reloaded.contactDecision).toBe("none");
    const restored = restoreContact(reloaded, view.contact_decision);
    expect(restored.contactDecision).toBe("new");
    expect(restored.selected["person-0"]).toBe(false);
  });

  it("a keep-old judgment reaches the server as a selected decision without claiming a new save", () => {
    const view = review([
      item({
        id: "conflict",
        scope: "person",
        admission_status: "needs_judgment",
        judgment_kind: "conflict",
        default_selected: false,
      }),
    ]);
    let state = createDraftState(view);
    expect(state.selected.conflict).not.toBe(true);
    state = setDecision(state, "conflict", "keep_old");
    expect(state.decisions.conflict).toBe("keep_old");
    expect(state.selected.conflict).toBe(true);
    const body = buildCommitDraft(state, view);
    expect(body.item_decisions.conflict).toBe("keep_old");
    expect(body.selected_item_ids).toContain("conflict");
    // Skip is the only decision that leaves the item out of the selection.
    const skipped = setDecision(state, "conflict", "skip");
    expect(skipped.selected.conflict).toBe(false);
  });

  it("builds a commit body bounded to the current visible scope", () => {
    const view = seventeen();
    let state = createDraftState(view);
    state = skipContact(state);
    const body = buildCommitDraft(state, view);
    expect(body.contact_decision).toBe("none");
    expect(body.selected_item_ids).toEqual(["self-0", "self-1", "self-2"]);
    // Add items carry no previous revision; the server must not trust a guess.
    expect(Object.keys(body.expected_item_versions)).toHaveLength(0);
  });

  it("sends the authoritative previous revision for an update", () => {
    const view = review([
      item({ id: "update-1", scope: "person", operation: "update", previous_revision: 4 }),
    ]);
    const state = createDraftState(view);
    const body = buildCommitDraft(state, view);
    expect(body.expected_item_versions["update-1"]).toBe(4);
  });

  it("a whole-card count includes folded rows while the group total does not", () => {
    const view = review([
      ...Array.from({ length: 9 }, (_, i) => item({ id: `person-${i}`, scope: "person" })),
    ]);
    const state = createDraftState(view);
    const group = groupItems(view.items)[0]!;
    expect(groupSelection(state, group.items).total).toBe(9);
    expect(selectedCount(state, view.items)).toBe(9);
  });
});
