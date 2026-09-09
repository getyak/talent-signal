import type { DatabaseClient } from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import type { AuthContext } from "./auth.js";
import { labStopAuthorityKeySQL } from "./labStopAuthority.js";

export interface HarnessSourceAuthority { expiresAt: Date; personIDs: readonly string[] }
const unavailable = () => new ApiError(409, "HARNESS_SOURCE_CHANGED", "The source context changed. Retry using its current state.");

/** Run on an independent autocommit connection so a pending Lab stop wins. */
export async function assertHarnessLabAuthority(probe: DatabaseClient, auth: AuthContext): Promise<void> {
  if (auth.userKind !== "lab_human") return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      probe.query<{state:string; expires_at:Date; stop_clear:boolean}>(`SELECT state,expires_at,
        pg_try_advisory_xact_lock_shared(${labStopAuthorityKeySQL}) AS stop_clear FROM lab_test_workspaces
        WHERE target_account_id=$1::uuid AND target_user_id=$2::uuid FOR SHARE NOWAIT`,[auth.accountId,auth.userId]),
      new Promise<never>((_,reject) => { timer=setTimeout(() => reject(unavailable()),1000); }),
    ]);
    const workspace=result.rows[0];
    if (!workspace || !workspace.stop_clear || workspace.state!=="active" || workspace.expires_at.valueOf()<=Date.now()) throw unavailable();
  } catch(error) {
    if ((error as {code?:string})?.code==="55P03") throw unavailable();
    throw error;
  } finally { if(timer) clearTimeout(timer); }
}

/** Capture BEFORE reading dialogue, Memory or images. A continuation created
 * after compilation cannot establish the version of that earlier input.
 * READ COMMITTED obtains a new snapshot per command; clock_timestamp advances
 * inside the product transaction. https://www.postgresql.org/docs/18/transaction-iso.html
 */
export async function createHarnessSourceGuard(database: DatabaseClient, auth: AuthContext,
  sessionID: string | undefined, sources: () => HarnessSourceAuthority | undefined, probe: DatabaseClient = database): Promise<() => Promise<void>> {
  const read = async () => {
    await assertHarnessLabAuthority(probe, auth);
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
