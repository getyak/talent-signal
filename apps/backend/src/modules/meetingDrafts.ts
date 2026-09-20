import type { CalendarDraft, ChatResponseBlock, MeetingDraftListResponse, MeetingDraftRecord, MeetingDraftResponse } from "@talent-signal/contracts";
import { CONTRACT_VERSION } from "@talent-signal/contracts";
import type { Pool } from "pg";
import { inTransaction, type DatabaseClient } from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import { appendAudit } from "../lib/audit.js";
import type { AuthContext } from "./auth.js";

/**
 * Account- and user-scoped projection of CalendarDraft values produced by
 * session-bound chat tasks. A draft is a reviewable proposal with
 * external_effect='none'; it is never a confirmed event or execution receipt.
 */

interface MeetingDraftRow {
  id: string;
  created_by_user_id: string;
  source_task_id: string;
  origin_session_id: string;
  source_message_id: string | null;
  title: string | null;
  starts_at: Date | null;
  ends_at: Date | null;
  time_zone: string | null;
  source_excerpt: string | null;
  reference_time: Date | null;
  status: MeetingDraftRecord["status"];
  external_effect: "none";
  revision: number;
  created_at: Date;
  updated_at: Date;
  expires_at: Date;
  redacted_at: Date | null;
  dismissed_at: Date | null;
}

function record(row: MeetingDraftRow): MeetingDraftRecord {
  const contentAvailable =
    row.status === "needs_review" || row.status === "dismissed";
  return {
    id: row.id,
    status: row.status,
    external_effect: "none",
    revision: row.revision,
    source_task_id: row.source_task_id,
    origin_session_id: row.origin_session_id,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    expires_at: row.expires_at.toISOString(),
    content_available: contentAvailable,
    title: contentAvailable ? row.title : null,
    starts_at: contentAvailable ? row.starts_at?.toISOString() ?? null : null,
    ends_at: contentAvailable ? row.ends_at?.toISOString() ?? null : null,
    time_zone: contentAvailable ? row.time_zone : null,
    source_excerpt: contentAvailable ? row.source_excerpt : null,
    reference_time: contentAvailable
      ? row.reference_time?.toISOString() ?? null
      : null,
    redacted_at: row.redacted_at?.toISOString() ?? null,
    dismissed_at: row.dismissed_at?.toISOString() ?? null,
  };
}

function calendarDrafts(blocks: ChatResponseBlock[]): CalendarDraft[] {
  const drafts: CalendarDraft[] = [];
  for (const block of blocks) {
    const draft = block.calendar_draft;
    if (draft) drafts.push(draft);
  }
  return drafts;
}

/**
 * Record every CalendarDraft produced by a session-bound chat task. The caller
 * must already hold the session/task source authority lock for this
 * transaction. Rows are keyed by the draft id, so an idempotent retry (or a
 * replayed request inside the same transaction) never duplicates a draft.
 *
 * Expiry is bounded by the originating Session/task and by a 30 day maximum.
 * A retry that changes the draft identity for an already-stored task draft is
 * rejected rather than silently overwritten.
 */
export async function recordMeetingDraftsForTask(
  client: DatabaseClient,
  auth: AuthContext,
  input: {
    taskID: string;
    sessionID: string;
    blocks: ChatResponseBlock[];
    messageID?: string | undefined;
  },
): Promise<void> {
  const drafts = calendarDrafts(input.blocks);
  if (!drafts.length) return;
  if (!input.sessionID) return;
  const authority = (
    await client.query<{ expires_at: Date; session_expires_at: Date }>(
      `SELECT t.expires_at,s.expires_at AS session_expires_at
       FROM agent_session_chat_tasks t
       JOIN agent_sessions s
         ON s.account_id=t.account_id AND s.id=t.origin_session_id
       WHERE t.account_id=$1 AND t.actor_user_id=$2 AND t.task_id=$3 AND s.id=$4`,
      [auth.accountId, auth.userId, input.taskID, input.sessionID],
    )
  ).rows[0];
  if (!authority) {
    throw new ApiError(
      409,
      "MEETING_DRAFT_SOURCE_UNAVAILABLE",
      "The Session chat task is not available for a meeting draft.",
    );
  }
  const expiresAt = new Date(
    Math.min(
      authority.expires_at.valueOf(),
      authority.session_expires_at.valueOf(),
      Date.now() + 30 * 86_400_000,
    ),
  );
  for (const draft of drafts) {
    if (draft.source_request_id !== input.taskID) {
      throw new ApiError(
        409,
        "MEETING_DRAFT_SOURCE_MISMATCH",
        "The draft does not belong to the chat task that produced it.",
      );
    }
    await client.query(
      `SELECT record_meeting_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        auth.accountId,
        draft.id,
        auth.userId,
        input.taskID,
        input.sessionID,
        input.messageID ?? null,
        draft.title,
        draft.starts_at,
        draft.ends_at,
        draft.time_zone,
        draft.source_excerpt,
        draft.reference_time,
        expiresAt,
      ],
    );
  }
}

function missing(): ApiError {
  return new ApiError(
    404,
    "MEETING_DRAFT_NOT_FOUND",
    "The meeting draft is not available in this account and user scope.",
  );
}

async function redactUnavailable(
  client: DatabaseClient,
  accountId: string,
): Promise<void> {
  await client.query("SELECT redact_unavailable_meeting_drafts($1)", [
    accountId,
  ]);
}

export async function getMeetingDraft(
  client: DatabaseClient,
  auth: AuthContext,
  id: string,
): Promise<MeetingDraftRecord> {
  await redactUnavailable(client, auth.accountId);
  const row = (
    await client.query<MeetingDraftRow>(
      `SELECT * FROM meeting_drafts
       WHERE account_id=$1 AND created_by_user_id=$2 AND id=$3`,
      [auth.accountId, auth.userId, id],
    )
  ).rows[0];
  if (!row) throw missing();
  return record(row);
}

export async function listMeetingDrafts(
  client: DatabaseClient,
  auth: AuthContext,
  after?: string,
  limit = 50,
): Promise<MeetingDraftListResponse> {
  await redactUnavailable(client, auth.accountId);
  const effectiveLimit = Math.min(50, Math.max(1, limit));
  const rows = (
    await client.query<MeetingDraftRow>(
      `SELECT * FROM meeting_drafts
       WHERE account_id=$1 AND created_by_user_id=$2
         AND ($3::uuid IS NULL OR id>$3)
       ORDER BY id LIMIT $4`,
      [auth.accountId, auth.userId, after ?? null, effectiveLimit + 1],
    )
  ).rows;
  const page = rows.slice(0, effectiveLimit);
  const complete = rows.length <= effectiveLimit;
  return {
    contract_version: CONTRACT_VERSION,
    drafts: page.map(record),
    complete,
    next_cursor: complete ? null : page.at(-1)!.id,
  };
}

/**
 * Idempotent dismiss. A retry with the same idempotency key returns the stored
 * result; a new key with a stale revision is rejected. Source revocation,
 * expiry, or redaction still produces a non-sensitive tombstone.
 */
export async function dismissMeetingDraft(
  client: DatabaseClient,
  auth: AuthContext,
  id: string,
  request: { expected_revision: number; idempotency_key: string },
): Promise<MeetingDraftRecord> {
  return inTransaction(client as Pool, async (tx) => {
    await redactUnavailable(tx, auth.accountId);
    const row = (
      await tx.query<MeetingDraftRow & { dismiss_request_key: string | null }>(
        `SELECT *, dismiss_idempotency_key AS dismiss_request_key
         FROM meeting_drafts
         WHERE account_id=$1 AND created_by_user_id=$2 AND id=$3
         FOR UPDATE`,
        [auth.accountId, auth.userId, id],
      )
    ).rows[0];
    if (!row) throw missing();
    if (row.dismiss_request_key === request.idempotency_key) {
      return record(row);
    }
    if (row.status === "redacted" || row.status === "expired") {
      throw new ApiError(
        409,
        "MEETING_DRAFT_UNAVAILABLE",
        "This draft is no longer reviewable and cannot be dismissed.",
      );
    }
    if (row.status === "dismissed") {
      throw new ApiError(
        409,
        "MEETING_DRAFT_ALREADY_DISMISSED",
        "This draft was already dismissed.",
      );
    }
    if (row.revision !== request.expected_revision) {
      throw new ApiError(
        409,
        "MEETING_DRAFT_REVISION_CONFLICT",
        "Read the current draft before changing it.",
      );
    }
    const updated = (
      await tx.query<MeetingDraftRow>(
        `UPDATE meeting_drafts SET
           status='dismissed', dismissed_at=now(), updated_at=now(),
           revision=revision+1, dismiss_idempotency_key=$4
         WHERE account_id=$1 AND created_by_user_id=$2 AND id=$3
         RETURNING *`,
        [auth.accountId, auth.userId, id, request.idempotency_key],
      )
    ).rows[0]!;
    await appendAudit(
      tx,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "meeting_draft.dismissed",
      "meeting_draft",
      id,
      {
        source_task_id: row.source_task_id,
        origin_session_id: row.origin_session_id,
        external_effect: "none",
        disposition: "dismissed",
        revision: updated.revision,
      },
    );
    return record(updated);
  });
}

export function meetingDraftResponse(
  draft: MeetingDraftRecord,
): MeetingDraftResponse {
  return { contract_version: CONTRACT_VERSION, draft };
}
