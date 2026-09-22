import type {
  MemoryDecision,
  MemoryProposalItem,
  MemoryReviewDraft,
  MemoryReviewView,
  MemoryScope,
} from "@talent-signal/contracts";

/**
 * Pure selection-intent reducer for the shared three-scope Memory review.
 *
 * Backend snapshots remain authority: this state only mirrors the user's
 * current selection, edits and judgment before an explicit commit. It is keyed
 * by authenticated account binding + proposal + review scope by the caller, so
 * one surface can never read another's private draft.
 */
export type MemoryReviewDraftState = {
  contactDecision: "existing" | "new" | "none";
  selected: Record<string, boolean>;
  editedText: Record<string, string>;
  decisions: Record<string, MemoryDecision>;
  expandedGroups: Record<MemoryScope, boolean>;
  sheetGroup: MemoryScope | null;
  detailItemId: string | null;
  detailOrigin: "inline" | "sheet" | null;
  search: string;
};

export type MemoryDraftRequest = {
  contact_decision: "existing" | "new" | "none";
  selected_item_ids: string[];
  edited_text: Record<string, string>;
  item_decisions: Record<string, MemoryDecision>;
};

/**
 * Local intent across every item authorized by the current review purpose.
 * The contactDecision projection belongs to commit only; persisting the full
 * intent is what lets a reload + restore recover dependent choices.
 */
export function buildDraftRequest(
  state: MemoryReviewDraftState,
  review: MemoryReviewView,
): MemoryDraftRequest {
  const items = review.items;
  const edited: Record<string, string> = {};
  const decisions: Record<string, MemoryDecision> = {};
  for (const item of items) {
    if (state.editedText[item.id] !== undefined) edited[item.id] = state.editedText[item.id]!;
    if (state.decisions[item.id]) decisions[item.id] = state.decisions[item.id]!;
  }
  return {
    contact_decision: state.contactDecision,
    selected_item_ids: selectedItemIds(state, items),
    edited_text: edited,
    item_decisions: decisions,
  };
}

export const MEMORY_GROUP_LABELS: Record<MemoryScope, string> = {
  self: "关于我",
  person: "关于对方",
  relationship: "我们之间",
};

export const MEMORY_GROUP_ORDER: MemoryScope[] = ["self", "person", "relationship"];

function emptyExpanded(): Record<MemoryScope, boolean> {
  return { self: false, person: false, relationship: false };
}

/** Contact-independent self item: it survives skipping the contact. */
export function selfItemDependsOnContact(item: MemoryProposalItem): boolean {
  return item.scope === "self" && item.relationship_kind !== "none";
}

function seededSelection(item: MemoryProposalItem): boolean {
  return item.admission_status === "eligible" && item.default_selected;
}

/** Initial state from a server review, or a rebase of a previous selection. */
export function createDraftState(
  review: MemoryReviewView,
  previous?: MemoryReviewDraftState | null,
): MemoryReviewDraftState {
  const selected: Record<string, boolean> = {};
  const editedText: Record<string, string> = {};
  const decisions: Record<string, MemoryDecision> = {};
  for (const item of review.items) {
    if (previous) {
      // Stable item identity drives rebase: an unchanged visible item keeps the
      // user's prior intent; new/changed items never silently become selected.
      const prior = previous.selected[item.id];
      selected[item.id] = typeof prior === "boolean" ? prior : false;
      const edit = previous.editedText[item.id];
      if (typeof edit === "string" && edit !== item.display_text) editedText[item.id] = edit;
      const decision = previous.decisions[item.id];
      if (decision) decisions[item.id] = decision;
    } else {
      selected[item.id] = seededSelection(item);
    }
  }
  if (review.draft) {
    applyServerDraft({ selected, editedText, decisions }, review.draft);
  }
  return {
    contactDecision: review.draft?.contact_decision ?? review.contact_decision,
    selected,
    editedText,
    decisions,
    expandedGroups: previous?.expandedGroups ?? emptyExpanded(),
    sheetGroup: null,
    detailItemId: null,
    detailOrigin: null,
    search: previous?.search ?? "",
  };
}

function applyServerDraft(
  into: {
    selected: Record<string, boolean>;
    editedText: Record<string, string>;
    decisions: Record<string, MemoryDecision>;
  },
  draft: MemoryReviewDraft,
): void {
  for (const id of Object.keys(into.selected)) {
    into.selected[id] = draft.selected_item_ids.includes(id);
  }
  for (const [id, text] of Object.entries(draft.edited_text)) {
    if (id in into.selected) into.editedText[id] = text;
  }
  for (const [id, decision] of Object.entries(draft.item_decisions)) {
    if (id in into.selected) into.decisions[id] = decision;
  }
}

/** Items currently visible for the contact decision. */
export function visibleItems(
  items: readonly MemoryProposalItem[],
  contactDecision: "existing" | "new" | "none",
): MemoryProposalItem[] {
  if (contactDecision !== "none") return [...items];
  return items.filter((item) => item.scope === "self" && !selfItemDependsOnContact(item));
}

export function groupItems(
  items: readonly MemoryProposalItem[],
): Array<{ scope: MemoryScope; items: MemoryProposalItem[] }> {
  return MEMORY_GROUP_ORDER.map((scope) => ({
    scope,
    items: items.filter((item) => item.scope === scope),
  })).filter((group) => group.items.length > 0);
}

export function eligibleItems(items: readonly MemoryProposalItem[]): MemoryProposalItem[] {
  return items.filter((item) => item.admission_status === "eligible");
}

export function judgmentItems(items: readonly MemoryProposalItem[]): MemoryProposalItem[] {
  return items.filter((item) => item.admission_status === "needs_judgment");
}

export function selectedItemIds(
  state: MemoryReviewDraftState,
  items: readonly MemoryProposalItem[],
): string[] {
  return items.filter((item) => state.selected[item.id]).map((item) => item.id);
}

/** Whole-card count, including folded and sheet-hidden rows. */
export function selectedCount(
  state: MemoryReviewDraftState,
  items: readonly MemoryProposalItem[],
): number {
  return selectedItemIds(state, items).length;
}

/**
 * Separate a keep-old judgment from an actual new/updated Memory save so the
 * primary action never claims to remember a kept-old value.
 */
export function selectedEffectCounts(
  state: MemoryReviewDraftState,
  items: readonly MemoryProposalItem[],
): { applied: number; keptOld: number } {
  let applied = 0;
  let keptOld = 0;
  for (const item of items) {
    if (!state.selected[item.id]) continue;
    if (state.decisions[item.id] === "keep_old") keptOld += 1;
    else applied += 1;
  }
  return { applied, keptOld };
}

export function groupSelection(
  state: MemoryReviewDraftState,
  group: readonly MemoryProposalItem[],
): { selected: number; total: number; state: "all" | "none" | "mixed" } {
  const eligible = eligibleItems(group);
  const selected = eligible.filter((item) => state.selected[item.id]).length;
  return {
    selected,
    total: eligible.length,
    state: selected === 0 ? "none" : selected === eligible.length ? "all" : "mixed",
  };
}

export function toggleItem(
  state: MemoryReviewDraftState,
  item: MemoryProposalItem,
): MemoryReviewDraftState {
  if (item.admission_status !== "eligible") {
    // Judgment items need an explicit per-item decision, not a checkbox.
    return state;
  }
  return { ...state, selected: { ...state.selected, [item.id]: !state.selected[item.id] } };
}

/** Mixed click selects all eligible ordinary items; judgment items stay out. */
export function toggleGroup(
  state: MemoryReviewDraftState,
  group: readonly MemoryProposalItem[],
): MemoryReviewDraftState {
  const eligible = eligibleItems(group);
  const current = groupSelection(state, group);
  const next = current.state !== "all";
  const selected = { ...state.selected };
  for (const item of eligible) selected[item.id] = next;
  return { ...state, selected };
}

/** Explicit subset selection; only eligible items are affected. */
export function setItemsSelected(
  state: MemoryReviewDraftState,
  items: readonly MemoryProposalItem[],
  selected: boolean,
): MemoryReviewDraftState {
  const next = { ...state.selected };
  for (const item of eligibleItems(items)) next[item.id] = selected;
  return { ...state, selected: next };
}

export function setEditedText(
  state: MemoryReviewDraftState,
  itemId: string,
  text: string,
): MemoryReviewDraftState {
  return { ...state, editedText: { ...state.editedText, [itemId]: text } };
}

export function setDecision(
  state: MemoryReviewDraftState,
  itemId: string,
  decision: MemoryDecision,
): MemoryReviewDraftState {
  return {
    ...state,
    decisions: { ...state.decisions, [itemId]: decision },
    // A keep_old / accept / retain_conflict judgment must reach the server as a
    // selected decision; only an explicit skip leaves the item out.
    selected: {
      ...state.selected,
      [itemId]: decision !== "skip",
    },
  };
}

export function expandGroup(
  state: MemoryReviewDraftState,
  scope: MemoryScope,
  expanded: boolean,
): MemoryReviewDraftState {
  return { ...state, expandedGroups: { ...state.expandedGroups, [scope]: expanded } };
}

export function openSheet(
  state: MemoryReviewDraftState,
  scope: MemoryScope | null,
): MemoryReviewDraftState {
  // The search is scoped to one group; opening another group starts clean.
  return { ...state, sheetGroup: scope, detailItemId: null, detailOrigin: null, search: "" };
}

export function openDetail(
  state: MemoryReviewDraftState,
  itemId: string | null,
  origin: "inline" | "sheet" | null = null,
): MemoryReviewDraftState {
  return { ...state, detailItemId: itemId, detailOrigin: itemId ? origin : null };
}

export function setSearch(state: MemoryReviewDraftState, search: string): MemoryReviewDraftState {
  return { ...state, search };
}

/**
 * Skip the contact: only the visible scope and commit projection change. The
 * remembered dependent selections, edits and decisions stay in the draft so a
 * restore of the same identity recovers them exactly, while independent-self
 * changes made while skipped are kept too.
 */
export function skipContact(state: MemoryReviewDraftState): MemoryReviewDraftState {
  if (state.contactDecision === "none") return state;
  return { ...state, contactDecision: "none", sheetGroup: null, detailItemId: null };
}

/** Restore the frozen review's original contact decision without touching intent. */
export function restoreContact(
  state: MemoryReviewDraftState,
  originalContactDecision: "existing" | "new" | "none",
): MemoryReviewDraftState {
  if (state.contactDecision !== "none") return state;
  return { ...state, contactDecision: originalContactDecision };
}

/** The commit body derives strictly from the frozen review and local intent. */
export function buildCommitDraft(
  state: MemoryReviewDraftState,
  review: MemoryReviewView,
): {
  contact_decision: "existing" | "new" | "none";
  selected_item_ids: string[];
  edited_text: Record<string, string>;
  item_decisions: Record<string, MemoryDecision>;
  expected_item_versions: Record<string, number>;
} {
  const items = visibleItems(review.items, state.contactDecision);
  const ids = selectedItemIds(state, items);
  const edited: Record<string, string> = {};
  const decisions: Record<string, MemoryDecision> = {};
  const versions: Record<string, number> = {};
  for (const item of items) {
    if (state.editedText[item.id] !== undefined) edited[item.id] = state.editedText[item.id]!;
    if (state.decisions[item.id]) decisions[item.id] = state.decisions[item.id]!;
    // Updates/contests must send the authoritative previous revision; an add
    // item has none. Never guess a version the server would then trust.
    if (item.previous_revision != null) versions[item.id] = item.previous_revision;
  }
  return {
    contact_decision: state.contactDecision,
    selected_item_ids: ids,
    edited_text: edited,
    item_decisions: decisions,
    expected_item_versions: versions,
  };
}
