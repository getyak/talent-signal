import type { RuntimeObservationContext } from "@talent-signal/agent";
import type { DatabaseClient } from "../database/pool.js";
import type { AuthContext } from "./auth.js";

/** Host-owned reverse references; never accepted from a model or public request. */
export async function productObservationContext(database: DatabaseClient, auth: Pick<AuthContext, "accountId" | "userId">, runID: string, scope: string,
  sources: { sessionID?: string | null | undefined; personID?: string; contextID?: string; fragmentIDs?: string[];
    mediaIDs?: string[]; screenshotTaskIDs?: string[] }): Promise<RuntimeObservationContext> {
  const context: RuntimeObservationContext = { run_id: runID, workspace_id: auth.accountId,
    authorization_scope: scope, source_session_id: sources.sessionID ?? null };
  const fragments = sources.fragmentIDs ?? [], screenshotTasks = sources.screenshotTaskIDs ?? [];
  // A conversation without a persisted Session or scoped source has no deletion owner.
  if (!sources.sessionID && !sources.personID && !fragments.length && !sources.mediaIDs?.length) return context;
  const expiry = [Date.now() + 7 * 86_400_000];
  if (sources.sessionID) {
    const session = (await database.query<{ expires_at: Date }>(`SELECT expires_at FROM agent_sessions
      WHERE account_id=$1 AND created_by_user_id=$2 AND id=$3 AND deleted_at IS NULL AND expires_at>now()`,
    [auth.accountId, auth.userId, sources.sessionID])).rows[0];
    if (!session) return context;
    expiry.push(session.expires_at.valueOf());
  }
  const rows = (await database.query<{ id: string; retention_until: Date | null; authorization_expires_at: Date | null }>(
    `SELECT DISTINCT c.id,c.retention_until,sr.authorization_expires_at FROM captures c
      JOIN source_retention_receipts sr ON sr.account_id=c.account_id AND sr.capture_id=c.id
      WHERE c.account_id=$1 AND (EXISTS (SELECT 1 FROM evidence_fragments f WHERE f.account_id=c.account_id
        AND f.capture_id=c.id AND f.id=ANY($2::uuid[])) OR EXISTS (SELECT 1 FROM screenshot_contact_tasks t
        WHERE t.account_id=c.account_id AND t.capture_id=c.id AND t.id=ANY($3::uuid[])))`,
  [auth.accountId, fragments, screenshotTasks])).rows;
  for (const row of rows) for (const time of [row.retention_until, row.authorization_expires_at]) if (time) expiry.push(time.valueOf());
  if (screenshotTasks.length) {
    const tasks = await database.query<{ expires_at: Date }>(`SELECT expires_at FROM screenshot_contact_tasks
      WHERE account_id=$1 AND created_by_user_id=$2 AND id=ANY($3::uuid[])`, [auth.accountId, auth.userId, screenshotTasks]);
    for (const task of tasks.rows) expiry.push(task.expires_at.valueOf());
  }
  context.source_refs = { kind: "product", capture_ids: rows.map((row) => row.id), fragment_ids: [...fragments],
    media_ids: [...(sources.mediaIDs ?? [])], person_ids: sources.personID ? [sources.personID] : [],
    relationship_context_ids: sources.contextID ? [sources.contextID] : [], expires_at: new Date(Math.min(...expiry)).toISOString() };
  return context;
}
