import type { Pool, PoolClient } from "pg";
import { labHash } from "./labJobCases.js";

/** Freeze the exact returned version. A resumed task cannot inherit its earlier rating. */
export async function saveProductRunOutput(client: Pool | PoolClient, match: { id?: string; accountID?: string; taskID?: string },
  output: Record<string, unknown>, status: string) {
  const hash = labHash(output);
  await client.query(`UPDATE product_runs SET task_id=COALESCE(task_id,$3::uuid),output=$4::jsonb,output_hash=$5,
    status=$6,updated_at=now(),finished_at=CASE WHEN $6='running' THEN NULL ELSE COALESCE(finished_at,now()) END,
    sentiment=CASE WHEN output_hash=$5 THEN sentiment ELSE NULL END,
    reasons=CASE WHEN output_hash=$5 THEN reasons ELSE '[]'::jsonb END,
    comment=CASE WHEN output_hash=$5 THEN comment ELSE '' END,
    correction=CASE WHEN output_hash=$5 THEN correction ELSE '' END,
    selected_text=CASE WHEN output_hash=$5 THEN selected_text ELSE '' END,
    feedback_updated_at=CASE WHEN output_hash=$5 THEN feedback_updated_at ELSE NULL END
    WHERE ($1::uuid IS NOT NULL AND id=$1 OR $1 IS NULL AND account_id=$2::uuid AND task_id=$3::uuid)
    AND (output_hash IS NULL OR $3::uuid IS NOT NULL AND (task_id IS NULL OR task_id=$3))
    AND (task_kind<>'screenshot' OR COALESCE((output->>'revision')::int,0)<=COALESCE(($4::jsonb->>'revision')::int,0))`,
  [match.id ?? null, match.accountID ?? null, match.taskID ?? null, JSON.stringify(output), hash, status]);
}

/** Non-blocking span persistence: product transactions must never wait for another pool connection. */
export function productRunSink(pool: Pool, id: string, onError: (error: unknown) => void) {
  let writes: Promise<void> = Promise.resolve();
  return {
    async append(span: import('@talent-signal/agent').ProductRunSpan) {
      writes = writes.then(async () => {
        await pool.query("INSERT INTO product_run_spans(id,run_id,span) VALUES($1,$2,$3::jsonb) ON CONFLICT(id) DO NOTHING", [span.id,id,JSON.stringify(span)]);
      }).catch(onError);
    },
    async flush() { await writes; },
  };
}
