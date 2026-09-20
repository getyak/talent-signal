/**
 * Decides whether a confirmed Session send may clear the draft it persisted,
 * and how a competing local pending record must be preserved.
 *
 * Sending persists the untrimmed composer draft and its canonical updated-at
 * before asking the Agent. After the Agent confirms, that draft may only be
 * emptied when the server readback still matches the exact captured identity.
 * A newer draft, an old send record with no identity, or a competing local
 * pending record must all preserve what the user can still see or type.
 *
 * These helpers are pure apart from the explicit storage read/clear they are
 * handed, so the consequential send completion -> forced save / edit path is
 * directly testable.
 */

import {
  applyDraftInput,
  initialDetailState,
  markConflict,
  type DetailState,
  type SaveRequestBody,
  type SessionDetail,
} from "./session-detail-state";
import {
  clearPendingSessionDraft,
  createPendingSessionDraft,
  readPendingSessionDraft,
  type PendingSessionDraft,
  type SessionSendCleanupIdentity,
} from "./session-draft-pending";

export type SessionSendCleanupPreserveReason =
  | "missing-identity"
  | "server-mismatch"
  | "competing-pending"
  | "storage-unavailable";

export type SessionSendCleanupPlan =
  | { readonly kind: "clear" }
  | {
      readonly kind: "preserve";
      readonly reason: SessionSendCleanupPreserveReason;
    };

export type SentDraftStorageStatus = "cleared" | "competing" | "unavailable";

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Capture the exact persisted draft before the ask. The returned identity is
 * the untrimmed composer draft plus the server's canonical updated-at, which
 * can differ from the trimmed message objective sent to the Agent. Fails
 * closed when the saved draft and the canonical draft do not agree.
 */
export function captureSessionSendCleanupIdentity(
  state: Pick<DetailState, "detail" | "lastSavedDraft">,
): SessionSendCleanupIdentity | null {
  const updatedAt = state.detail.composer_draft_updated_at;
  if (typeof updatedAt !== "string" || updatedAt.length === 0) return null;
  if ((state.detail.composer_draft ?? "") !== state.lastSavedDraft) return null;
  return {
    composerDraft: state.lastSavedDraft,
    composerDraftUpdatedAt: updatedAt,
  };
}

/** A readback may only be emptied when both the draft and its updated-at match. */
export function readbackMatchesSentDraft(
  identity: SessionSendCleanupIdentity | undefined | null,
  readback: Pick<SessionDetail, "composer_draft" | "composer_draft_updated_at">,
): boolean {
  if (!identity) return false;
  return (
    (readback.composer_draft ?? "") === identity.composerDraft &&
    readback.composer_draft_updated_at === identity.composerDraftUpdatedAt
  );
}

/**
 * Remove only this send's own pending record, never a competing pending record
 * keyed differently. Returns `competing` when another record still occupies the
 * session/scope key after the attempt, so the caller can preserve it.
 */
export function clearSentDraftStorage(
  storageScope: string,
  sessionId: string,
  sendIdempotencyKey: string,
  target: Storage | null = storage(),
): SentDraftStorageStatus {
  if (!target) return "unavailable";
  const existing = readPendingSessionDraft(storageScope, sessionId, target);
  if (!existing) return "cleared";
  if (existing.latest.idempotencyKey !== sendIdempotencyKey) return "competing";
  clearPendingSessionDraft(storageScope, sessionId, sendIdempotencyKey, target);
  const remaining = readPendingSessionDraft(storageScope, sessionId, target);
  return remaining ? "competing" : "cleared";
}

/**
 * Clear only when the readback matches the captured identity, the storage
 * boundary is usable, and no competing pending record would be overwritten.
 * Everything else preserves the readable draft.
 */
export function planSessionSendCleanup(input: {
  identity: SessionSendCleanupIdentity | undefined | null;
  readback: Pick<SessionDetail, "composer_draft" | "composer_draft_updated_at">;
  storage: SentDraftStorageStatus;
}): SessionSendCleanupPlan {
  if (!input.identity) return { kind: "preserve", reason: "missing-identity" };
  if (!readbackMatchesSentDraft(input.identity, input.readback)) {
    return { kind: "preserve", reason: "server-mismatch" };
  }
  if (input.storage === "competing") {
    return { kind: "preserve", reason: "competing-pending" };
  }
  if (input.storage === "unavailable") {
    return { kind: "preserve", reason: "storage-unavailable" };
  }
  return { kind: "clear" };
}

/**
 * The full post-ask completion decision. `cleanupWrite` is the only path that
 * may empty the server draft; every other path keeps the readback or adopts a
 * competing local draft into the editor with an explicit conflict.
 */
export type SessionSendCompletion = {
  readonly state: DetailState;
  readonly pending: PendingSessionDraft | null;
  readonly foreign: boolean;
  readonly cleanupWrite: boolean;
  readonly notice: string;
};

export function resolveSessionSendCompletion(input: {
  readback: SessionDetail;
  identity: SessionSendCleanupIdentity | undefined | null;
  storage: SentDraftStorageStatus;
  competing: PendingSessionDraft | null;
}): SessionSendCompletion {
  const plan = planSessionSendCleanup({
    identity: input.identity,
    readback: input.readback,
    storage: input.storage,
  });
  if (input.readback.state !== "active") {
    return {
      cleanupWrite: false, foreign: false, notice: "这段对话已不可用。",
      pending: null, state: initialDetailState(input.readback),
    };
  }
  if (plan.kind === "clear") {
    return {
      cleanupWrite: true,
      foreign: false,
      notice: "消息已保存。",
      pending: null,
      state: applyDraftInput(initialDetailState(input.readback), ""),
    };
  }
  if (input.storage === "competing" && input.competing) {
    // Adopt the record this tab did not write: its content becomes visible and
    // cannot be silently cleared, while the explicit conflict blocks any
    // automatic save from overwriting it.
    return {
      cleanupWrite: false,
      foreign: true,
      notice: "消息已保存；检测到另一端尚未保存的草稿，已恢复并保留。",
      pending: input.competing,
      state: markConflict(
        applyDraftInput(
          initialDetailState(input.readback),
          input.competing.latest.draft,
        ),
      ),
    };
  }
  if (plan.reason === "storage-unavailable") {
    return {
      cleanupWrite: false,
      foreign: false,
      notice: "消息已保存；本机草稿状态无法确认，未覆盖任何内容。",
      pending: null,
      state: initialDetailState(input.readback),
    };
  }
  return {
    cleanupWrite: false,
    foreign: false,
    notice:
      plan.reason === "server-mismatch"
        ? "消息已保存；检测到更新的草稿，已保留。"
        : "消息已保存。",
    pending: null,
    state: initialDetailState(input.readback),
  };
}

/**
 * A forced save with nothing new to write may only clear a record this tab
 * owns. A competing/foreign record must survive so its content is never lost.
 */
export function forcedNoopCleanupKey(input: {
  pending: PendingSessionDraft | null;
  foreign: boolean;
}): string | null {
  if (!input.pending || input.foreign) return null;
  return input.pending.latest.idempotencyKey;
}

export type DraftPersistencePlan = {
  readonly state: DetailState;
  readonly pending: PendingSessionDraft | null;
  readonly foreign: boolean;
  readonly clear: boolean;
  readonly write: boolean;
};

/**
 * The editor transition for a text change. Reverting to the canonical draft
 * clears only a record this tab owns; an adopted competing record is kept. Any
 * real edit writes a new owned record and ends foreign adoption.
 */
export function planDraftPersistence(input: {
  current: DetailState;
  value: string;
  storageScope: string;
  sessionId: string;
  idempotencyKey: string;
  updatedAt: string;
  predecessor: SaveRequestBody | null;
  adopted: PendingSessionDraft | null;
  now?: number;
}): DraftPersistencePlan {
  const state = applyDraftInput(input.current, input.value);
  if (state.draft === input.current.lastSavedDraft) {
    if (input.adopted) {
      return { clear: false, foreign: true, pending: input.adopted, state, write: false };
    }
    return { clear: true, foreign: false, pending: null, state, write: false };
  }
  return {
    clear: false,
    foreign: false,
    pending: createPendingSessionDraft({
      baseRevision: input.current.detail.revision,
      draft: state.draft,
      idempotencyKey: input.idempotencyKey,
      now: input.now,
      predecessor: input.predecessor,
      sessionId: input.sessionId,
      storageScope: input.storageScope,
      updatedAt: input.updatedAt,
    }),
    state,
    write: true,
  };
}

/** Gate before pending rebases as well as before direct save construction. */
export function canPersistSessionDraft(state: DetailState): boolean {
  return state.detail.state === "active" && !state.conflict;
}
