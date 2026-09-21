/**
 * A truthful, read-only description of a legacy conversation-home send record.
 *
 * Before the durable conversation queue existed, the desktop home wrote an
 * unsent objective into the partitioned `session-drafts` store under
 * `purpose: "conversation-home"`, alongside a client-generated Session id and
 * request id. That record may already have been submitted even when nothing was
 * confirmed, so it must never be treated as a new send.
 *
 * The desktop home now sends only through the durable conversation queue. This
 * module lets that queue surface *describe* an old record without admitting,
 * re-keying, converting, replaying or deleting it. The original content, its
 * timestamps and expiry stay exactly as recorded. The original durable record
 * retains the request identity; this view never invokes its legacy controller.
 */

import { readHomeConversationDraft } from "@/lib/new-conversation";

export type LegacyConversationRecovery = {
  /** Exact canonical Session the original record belongs to. */
  readonly sessionId: string;
  /** Original objective with its whitespace preserved exactly. */
  readonly objective: string;
  /** Timestamp the original intent was last recorded at. */
  readonly updatedAt: string;
  /** Original record expiry; recovery never extends or shortens it. */
  readonly expiresAt: string;
  /**
   * `attempted` means the recording build durably noted a send attempt, so the
   * server may already hold the operation. `unknown` means the record predates
   * that flag; it cannot be treated as never sent.
   */
  readonly delivery: "attempted" | "unknown";
};

/**
 * Describe the newest still-valid legacy home record for this account
 * partition, or nothing. An expired, foreign or empty record stays untouched
 * beyond the existing expiry pruning and is never surfaced as recovery.
 */
export function readLegacyConversationRecovery(
  storageScope: string,
): LegacyConversationRecovery | null {
  const pending = readHomeConversationDraft(storageScope);
  if (!pending || !pending.latest.draft.trim()) return null;
  const attempted = (pending as Record<string, unknown>).attempted === true;
  return {
    sessionId: pending.sessionId,
    objective: pending.latest.draft,
    updatedAt: pending.latest.updatedAt,
    expiresAt: pending.expiresAt,
    delivery: attempted ? "attempted" : "unknown",
  };
}
