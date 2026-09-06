import type { Pool } from "pg";
import { inTransaction } from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import type { AuthContext } from "./auth.js";
import { proposeResourceClaimsForFragment } from "./resourceClaims.js";
import { getRelationshipResource } from "./resources.js";

/** Compiles proposals only. The capture lock makes repeated preparation safe. */
export async function prepareCaptureReview(pool: Pool, auth: AuthContext, captureId: string) {
  const resourceId = await inTransaction(pool, async (client) => {
    const capture = await client.query<{ identity_status: string; authorization_state: string }>(
      `SELECT c.identity_status,
         CASE WHEN r.authorization_state = 'authorized' AND r.authorization_expires_at <= now()
           THEN 'expired' ELSE r.authorization_state END AS authorization_state
       FROM captures c JOIN source_retention_receipts r
         ON r.account_id = c.account_id AND r.capture_id = c.id
       WHERE c.account_id = $1 AND c.id = $2 AND c.status = 'active'
       FOR UPDATE OF c, r`, [auth.accountId, captureId],
    );
    if (!capture.rows[0]) throw new ApiError(404, "CAPTURE_NOT_FOUND", "The source is unavailable.");
    if (capture.rows[0].identity_status !== "bound") throw new ApiError(409, "IDENTITY_REVIEW_REQUIRED", "Resolve the person and relationship before reviewing changes.");
    if (capture.rows[0].authorization_state !== "authorized") throw new ApiError(409, "SOURCE_AUTHORIZATION_UNAVAILABLE", "This source is no longer authorized.");
    const fragments = await client.query<{ id: string; resource_id: string }>(
      `SELECT f.id, f.resource_id FROM evidence_fragments f
       JOIN source_resources r ON r.account_id = f.account_id AND r.id = f.resource_id
       WHERE f.account_id = $1 AND f.capture_id = $2 AND f.status = 'active'
         AND r.processing_state <> 'deleted' ORDER BY f.sequence, f.id FOR UPDATE OF f, r`,
      [auth.accountId, captureId],
    );
    const resourceId = fragments.rows[0]?.resource_id;
    if (!resourceId) throw new ApiError(409, "SOURCE_UNAVAILABLE", "No reviewable evidence remains.");
    for (const fragment of fragments.rows) await proposeResourceClaimsForFragment(client, auth, fragment.id);
    await client.query(
      `UPDATE source_resources r SET processing_state = CASE WHEN EXISTS (
         SELECT 1 FROM proposed_assertions a JOIN evidence_fragments f
           ON f.account_id = a.account_id AND f.id = a.evidence_fragment_id
         WHERE a.account_id = r.account_id AND f.resource_id = r.id AND a.review_status IN ('pending', 'unresolved')
       ) OR EXISTS (
         SELECT 1 FROM evidence_fragments f WHERE f.account_id = r.account_id AND f.resource_id = r.id
           AND f.status = 'active' AND (f.review_status <> 'reviewed' OR
             (r.resource_kind IN ('conversation_screenshot', 'conversation_transcript') AND f.attribution_status <> 'confirmed'))
       ) THEN 'needs_fact_review' ELSE 'ready' END
       WHERE r.account_id = $1 AND r.id = $2`, [auth.accountId, resourceId],
    );
    return resourceId;
  });
  return getRelationshipResource(pool, auth, resourceId);
}
