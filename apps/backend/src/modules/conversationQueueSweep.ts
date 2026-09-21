import { clearConversationQueuePreview } from "./conversationQueueLive.js";
import type { DatabaseClient } from "../database/pool.js";

/**
 * Retention and revocation cascade for the durable conversation queue.
 *
 * Physical rows are deleted when their Session is deleted or expired, so queue
 * lifetime can never extend the thirty-day Session lifetime. Sessions whose
 * screenshot context was retracted lose queued intentions and any transient
 * result, and their queue pauses so no stale material is displayed or run.
 */
export async function sweepConversationQueue(
  client: DatabaseClient,
  accountId?: string,
): Promise<void> {
  // Session reads and cursor pages call this sweep too. Accounts without queue
  // material must not repeatedly scan their screenshot contexts for revocation.
  const pending = await client.query<{ present: boolean }>(
    `SELECT
       EXISTS (SELECT 1 FROM conversation_queue_entries WHERE $1::uuid IS NULL OR account_id=$1)
       OR EXISTS (SELECT 1 FROM conversation_queue_state WHERE $1::uuid IS NULL OR account_id=$1)
       OR EXISTS (
         SELECT 1 FROM conversation_queue_operations
         WHERE created_at < now()-interval '30 days' AND ($1::uuid IS NULL OR account_id=$1)
       ) AS present`,
    [accountId ?? null],
  );
  if (!pending.rows[0]?.present) return;

  const expired = await client.query<{ run_id: string | null }>(
    `DELETE FROM conversation_queue_entries e
     USING agent_sessions s
     WHERE e.account_id=s.account_id AND e.session_id=s.id
       AND (s.deleted_at IS NOT NULL OR s.expires_at<=now())
       AND ($1::uuid IS NULL OR e.account_id=$1) RETURNING e.run_id`,
    [accountId ?? null],
  );
  for (const row of expired.rows) if (row.run_id) clearConversationQueuePreview(row.run_id);
  await client.query(
    `DELETE FROM conversation_queue_state st
     USING agent_sessions s
     WHERE st.account_id=s.account_id AND st.session_id=s.id
       AND (s.deleted_at IS NOT NULL OR s.expires_at<=now())
       AND ($1::uuid IS NULL OR st.account_id=$1)`,
    [accountId ?? null],
  );
  // Removing a revoked run also invalidates its lease: no persisted result or
  // objective can survive source deletion, even while a provider is unwinding.
  const revoked = await client.query<{ run_id: string | null }>(
    `WITH revoked AS (
       SELECT s.account_id, s.id AS session_id
       FROM agent_sessions s
       WHERE s.deleted_at IS NULL AND s.payload ? 'screenshotTaskIDs'
         AND ($1::uuid IS NULL OR s.account_id=$1)
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.payload->'screenshotTaskIDs','[]'::jsonb)) task
           WHERE NOT agent_session_screenshot_available(s.account_id, task)
         )
     )
     DELETE FROM conversation_queue_entries e
     USING revoked r
     WHERE e.account_id=r.account_id AND e.session_id=r.session_id
       RETURNING e.run_id`,
    [accountId ?? null],
  );
  for (const row of revoked.rows) if (row.run_id) clearConversationQueuePreview(row.run_id);
  await client.query(
    `WITH revoked AS (
       SELECT s.account_id, s.id AS session_id
       FROM agent_sessions s
       WHERE s.deleted_at IS NULL AND s.payload ? 'screenshotTaskIDs'
         AND ($1::uuid IS NULL OR s.account_id=$1)
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.payload->'screenshotTaskIDs','[]'::jsonb)) task
           WHERE NOT agent_session_screenshot_available(s.account_id, task)
         )
     )
     UPDATE conversation_queue_state st
     SET paused=true, revision=st.revision+1, updated_at=now()
     FROM revoked r
     WHERE st.account_id=r.account_id AND st.session_id=r.session_id`,
    [accountId ?? null],
  );
  await client.query("DELETE FROM conversation_queue_operations WHERE created_at < now()-interval '30 days' AND ($1::uuid IS NULL OR account_id=$1)", [accountId ?? null]);
}

/** Account/user-scoped physical removal used by explicit account cleanup. */
export async function purgeConversationQueueForAccount(
  client: DatabaseClient,
  accountId: string,
): Promise<void> {
  await client.query(
    "DELETE FROM conversation_queue_entries WHERE account_id=$1",
    [accountId],
  );
  await client.query(
    "DELETE FROM conversation_queue_state WHERE account_id=$1",
    [accountId],
  );
  await client.query(
    "DELETE FROM conversation_queue_operations WHERE account_id=$1",
    [accountId],
  );
}
