import type { DatabaseClient } from "../database/pool.js";
import type { AuthContext } from "./auth.js";

/** A source mutation wins over a late model result. Locks survive to transaction commit. */
export async function lockChatCompletionSources(client: DatabaseClient, auth: AuthContext, value: {
  task_id: string; session_id?: string | undefined; manifest_id: string; person_id: string; relationship_context_id: string;
}): Promise<boolean> {
  await client.query("SAVEPOINT chat_completion_sources");
  try {
    await client.query(`SELECT f.id FROM context_manifest_evidence me
      JOIN evidence_fragments f ON f.account_id=me.account_id AND f.id=me.evidence_fragment_id
      JOIN source_resources r ON r.account_id=f.account_id AND r.id=f.resource_id
      JOIN captures c ON c.account_id=r.account_id AND c.id=r.capture_id
      JOIN source_retention_receipts sr ON sr.account_id=c.account_id AND sr.capture_id=c.id
      WHERE me.account_id=$1 AND me.manifest_id=$2 ORDER BY f.id FOR SHARE OF me,f,r,c,sr NOWAIT`,
    [auth.accountId, value.manifest_id]);
    await client.query(`SELECT m.id FROM context_manifest_media mm JOIN chat_media_assets m ON m.account_id=mm.account_id AND m.id=mm.media_id
      WHERE mm.account_id=$1 AND mm.manifest_id=$2 ORDER BY m.id FOR SHARE OF mm,m NOWAIT`, [auth.accountId, value.manifest_id]);
    await client.query(`SELECT m.id FROM context_manifests m JOIN knowledge_snapshots s ON s.account_id=m.account_id AND s.id=m.knowledge_snapshot_id
      WHERE m.account_id=$1 AND m.id=$2 FOR SHARE OF m,s NOWAIT`, [auth.accountId, value.manifest_id]);
    await client.query(`SELECT s.id FROM subjects s JOIN assignments a ON a.account_id=s.account_id AND a.subject_id=s.id
      WHERE s.account_id=$1 AND s.id=$2 AND a.id=$3 FOR SHARE OF s,a NOWAIT`,
    [auth.accountId, value.person_id, value.relationship_context_id]);
    if (value.session_id) await client.query(`SELECT id FROM agent_sessions WHERE account_id=$1 AND created_by_user_id=$2 AND id=$3 FOR SHARE NOWAIT`,
      [auth.accountId, auth.userId, value.session_id]);
    await client.query("RELEASE SAVEPOINT chat_completion_sources");
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT chat_completion_sources");
    await client.query("RELEASE SAVEPOINT chat_completion_sources");
    if ((error as { code?: string }).code === "55P03") return false;
    throw error;
  }
  return (await client.query<{ available: boolean }>(`SELECT
    agent_session_task_available($1,$2,$3,$4) AND agent_session_chat_sources_available($1,$2)
    AND ($6::uuid IS NULL OR EXISTS(SELECT 1 FROM agent_sessions s WHERE s.account_id=$1 AND s.id=$6
      AND s.created_by_user_id=$7 AND s.deleted_at IS NULL AND s.expires_at>statement_timestamp()))
    AND NOT EXISTS(SELECT 1 FROM context_manifest_media mm LEFT JOIN chat_media_assets m ON m.account_id=mm.account_id AND m.id=mm.media_id
      WHERE mm.account_id=$1 AND mm.manifest_id=$5 AND (m.id IS NULL OR m.status<>'ready' OR m.deleted_at IS NOT NULL)) AS available`,
  [auth.accountId, value.task_id, value.person_id, value.relationship_context_id, value.manifest_id, value.session_id ?? null, auth.userId])).rows[0]?.available === true;
}
