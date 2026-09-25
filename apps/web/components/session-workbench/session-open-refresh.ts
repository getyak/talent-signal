/**
 * Open-Session active refresh (ADR 0018 synchronization).
 *
 * The shared workspace refresh coordinator re-reads the OPEN conversation on
 * foreground/focus/network recovery and a bounded active interval. This module
 * holds the pure merge decision so it stays directly testable: remote
 * committed turns merge over local state, tombstones win and never resurrect,
 * revision regression refuses to overwrite, and the local draft (typing, IME
 * composition, pending writes) and reader position are never touched. Scope
 * fencing drops late responses after an account, endpoint, or session switch.
 */

import {
  markConflict,
  markDeleted,
  type DetailState,
  type SessionDetail,
} from "./session-detail-state";
import type { AgentSessionPayload } from "@talent-signal/contracts";

type Turn = AgentSessionPayload["turns"][number];

export type OpenSessionRefreshFence = {
  /** Generation captured when the request was scheduled. */
  generation: number;
  /** Current generation of the shared coordinator scope. */
  activeGeneration: number;
  /** Session the reader is actually looking at. */
  sessionId: string;
};

export type OpenSessionRefreshResult =
  | { kind: "stale" }
  | { kind: "unchanged"; state: DetailState }
  | { kind: "conflict"; state: DetailState }
  | { kind: "applied"; state: DetailState; addedTurnIds: string[] };

/**
 * Merge one remote readback into the open conversation. Only `detail.turns`,
 * `detail.revision` and lifecycle state change; `draft`, `lastSavedDraft` and
 * `status` keep the reader's typing and IME composition exactly as they are.
 */
export function applyOpenSessionRefresh(
  state: DetailState,
  remote: SessionDetail,
  fence: OpenSessionRefreshFence,
): OpenSessionRefreshResult {
  // Scope fencing: a late response from a previous account, endpoint, session
  // or workspace scope is dropped, never painted.
  if (
    fence.generation !== fence.activeGeneration ||
    remote.session_id !== fence.sessionId ||
    state.detail.session_id !== fence.sessionId
  ) {
    return { kind: "stale" };
  }

  // Deleted or expired remote state is a tombstone: it wins and the content is
  // not resurrected by an offline or delayed read.
  if (remote.state === "deleted" || remote.state === "expired") {
    return { kind: "applied", state: markDeleted(state, remote), addedTurnIds: [] };
  }

  // A regressed remote revision must never overwrite newer local state.
  if (remote.revision < state.detail.revision) {
    return { kind: "conflict", state: markConflict(state) };
  }

  const remoteById = new Map<string, Turn>(
    remote.turns.map((turn) => [turn.id, turn]),
  );
  const merged: Turn[] = [];
  const addedTurnIds: string[] = [];
  const seen = new Set<string>();
  // Remote order is authoritative for committed turns; local-only turns (for
  // example an in-flight local append) survive the merge in place.
  for (const turn of state.detail.turns) {
    const committed = remoteById.get(turn.id);
    if (committed) {
      merged.push(committed);
      seen.add(turn.id);
    } else {
      merged.push(turn);
      seen.add(turn.id);
    }
  }
  for (const turn of remote.turns) {
    if (seen.has(turn.id)) continue;
    merged.push(turn);
    addedTurnIds.push(turn.id);
  }

  const unchanged =
    remote.revision === state.detail.revision &&
    addedTurnIds.length === 0 &&
    merged.length === state.detail.turns.length;
  const detail: SessionDetail = {
    ...remote,
    turns: merged,
  };
  // The editor keeps its exact local value and status; only the committed
  // canvas beneath it changes.
  const next: DetailState = {
    ...state,
    detail,
  };
  return unchanged
    ? { kind: "unchanged", state: next }
    : { kind: "applied", state: next, addedTurnIds };
}
