import type { Pool } from "pg";
import type { RemoteChatAnswerRequest } from "@talent-signal/agent/chat-answer-provider";
import { ApiError } from "../lib/apiError.js";
import type { AuthContext } from "./auth.js";
import type { ChatMediaStorage } from "./chatMediaStorage.js";
import { loadScreenshotContactImage, assertScreenshotContactImageCurrent } from "./screenshotContactTasks.js";

export async function loadHarnessEvidenceImageScope(pool: Pool, auth: AuthContext, personID: string,
  contextID: string, evidenceIDs: readonly string[]) {
  const rows = (await pool.query<{task_id:string;expires_at:Date}>(`SELECT DISTINCT t.id AS task_id,
    LEAST(t.expires_at,i.expires_at) AS expires_at FROM evidence_fragments f
    JOIN screenshot_contact_tasks t ON t.account_id=f.account_id AND t.capture_id=f.capture_id
    JOIN contact_task_images i ON i.account_id=t.account_id AND i.task_id=t.id
    WHERE f.account_id=$1 AND f.id=ANY($2::uuid[]) AND f.status='active' AND f.review_status<>'rejected'
      AND t.subject_id=$3 AND t.assignment_id=$4 AND t.created_by_user_id=$5 AND t.status<>'deleted'
      AND t.expires_at>clock_timestamp() AND i.status='stored' AND i.expires_at>clock_timestamp()`,
  [auth.accountId,[...evidenceIDs],personID,contextID,auth.userId])).rows;
  return {taskIDs:[...new Set(rows.map(row=>row.task_id))],
    expiresAt:rows.length ? new Date(Math.min(...rows.map(row=>row.expires_at.valueOf()))) : null};
}

/** The caller supplies fragment IDs from its governed Memory manifest, never public input. */
export function createHarnessEvidenceImageReader(pool: Pool, auth: AuthContext, personID: string,
  contextID: string, evidenceIDs: readonly string[], storage: ChatMediaStorage,
  assertCurrent: () => Promise<void>, registerGuard: (id:string,guard:()=>Promise<void>)=>void = ()=>{}): NonNullable<RemoteChatAnswerRequest["readEvidenceImage"]> {
  const allowed = new Set(evidenceIDs);
  const unavailable = () => new ApiError(409, "EVIDENCE_IMAGE_UNAVAILABLE", "This original image is not available in the current evidence scope.");
  return async (evidenceID, signal) => {
    if (!allowed.has(evidenceID)) throw unavailable();
    signal.throwIfAborted(); await assertCurrent();
    const resolve = async () => {
      const row = (await pool.query<{task_id:string; resource_id:string; source_message_id:string; image_count:number}>(`
        SELECT t.id AS task_id,r.id AS resource_id,f.locator->>'source_message_id' AS source_message_id,
          (SELECT count(*)::int FROM contact_task_images i WHERE i.account_id=t.account_id AND i.task_id=t.id) AS image_count
        FROM evidence_fragments f JOIN source_resources r ON r.account_id=f.account_id AND r.id=f.resource_id
        JOIN captures c ON c.account_id=r.account_id AND c.id=r.capture_id
        JOIN screenshot_contact_tasks t ON t.account_id=c.account_id AND t.capture_id=c.id
        WHERE f.account_id=$1 AND f.id=$2 AND f.status='active' AND f.deleted_at IS NULL
          AND f.review_status<>'rejected' AND r.processing_state<>'deleted' AND r.deleted_at IS NULL
          AND r.resource_kind='conversation_screenshot' AND (r.retention_until IS NULL OR r.retention_until>clock_timestamp())
          AND c.subject_id=$3 AND c.assignment_id=$4 AND c.status='active' AND c.retention_until>clock_timestamp()
          AND t.subject_id=$3 AND t.assignment_id=$4 AND t.created_by_user_id=$5
          AND t.status<>'deleted' AND t.expires_at>clock_timestamp()`,
      [auth.accountId,evidenceID,personID,contextID,auth.userId])).rows[0];
      if (!row) throw unavailable();
      const match = /^image([1-9]|10):.+$/u.exec(row.source_message_id ?? "");
      // Legacy single-image captures used a bare message ID. Never guess a
      // position for an ambiguous multi-image fragment or a malformed prefix.
      const index = match ? Number(match[1])-1 : row.image_count===1 && /^m[1-9][0-9]*$/u.test(row.source_message_id ?? "") ? 0 : -1;
      if (index<0) throw unavailable();
      return {task_id:row.task_id,source_resource_id:row.resource_id,source_image_index:index};
    };
    const source = await resolve();
    const image = await loadScreenshotContactImage(pool,auth,source.task_id,source.source_image_index,storage);
    const expectedHash = image.content_hash;
    const assertSource = async () => {
      signal.throwIfAborted(); await assertCurrent();
      if (JSON.stringify(await resolve())!==JSON.stringify(source)) throw unavailable();
      await assertScreenshotContactImageCurrent(pool,auth,source.task_id,source.source_image_index,expectedHash);
    };
    await assertSource();
    registerGuard(evidenceID,assertSource);
    return {evidence_id:evidenceID,...source,image,assertCurrent:assertSource};
  };
}
