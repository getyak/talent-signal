import type { DatabaseClient } from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import type { AuthContext } from "./auth.js";

export interface HarnessSourceAuthority { expiresAt: Date; personIDs: readonly string[] }
const unavailable = () => new ApiError(409, "HARNESS_SOURCE_CHANGED", "The source context changed. Retry using its current state.");

/** Capture BEFORE reading dialogue, Memory or images. A continuation created
 * after compilation cannot establish the version of that earlier input.
 * READ COMMITTED obtains a new snapshot per command; clock_timestamp advances
 * inside the product transaction. https://www.postgresql.org/docs/18/transaction-iso.html
 */
export async function createHarnessSourceGuard(database: DatabaseClient, auth: AuthContext,
  sessionID: string | undefined, sources: () => HarnessSourceAuthority | undefined): Promise<() => Promise<void>> {
  const read = async () => {
    const authority = sources();
    if (authority && (!Number.isFinite(authority.expiresAt.valueOf()) || authority.expiresAt.valueOf() <= Date.now())) throw unavailable();
    const row = (await database.query<{ generation: string; session_stamp: string | null; current: boolean }>(`
      SELECT COALESCE((SELECT generation FROM harness_source_generations WHERE account_id=$1),0)::text AS generation,
        (SELECT md5(jsonb_build_array(payload->'turns',payload->'personID',payload->'relationshipContextID')::text)
          FROM agent_sessions WHERE account_id=$1 AND created_by_user_id=$2 AND id=$3
            AND deleted_at IS NULL AND expires_at>clock_timestamp()) AS session_stamp,
        ($4::timestamptz IS NULL OR $4>clock_timestamp()) AND NOT EXISTS (
          SELECT 1 FROM identity_handles WHERE account_id=$1 AND subject_id=ANY($5::uuid[])
            AND status='confirmed' AND valid_until<=clock_timestamp()) AS current`,
    [auth.accountId, auth.userId, sessionID ?? null, authority?.expiresAt ?? null, [...(authority?.personIDs ?? [])]])).rows[0];
    if (!row || !row.current || (sessionID && !row.session_stamp)) throw unavailable();
    return row;
  };
  const admitted = await read();
  return async () => {
    const current = await read();
    if (current.generation !== admitted.generation || current.session_stamp !== admitted.session_stamp) throw unavailable();
  };
}
