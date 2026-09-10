import { Pool, type PoolClient } from "pg";
import { inTransaction } from "../database/pool.js";
import type { ProductRunSpan } from "@talent-signal/agent";
import { labHash } from "./labJobCases.js";

/** Freeze the exact returned version. A resumed task cannot inherit its earlier rating. */
export async function saveProductRunOutput(client: Pool | PoolClient, match: { id?: string; accountID?: string; taskID?: string },
  output: Record<string, unknown>, status: string): Promise<void> {
  if (client instanceof Pool) return inTransaction(client, transaction => saveProductRunOutput(transaction, match, output, status));
  // Match checkpoint lock order: canonical task before its diagnostic run.
  // A directory invalidation may advance the task while its old HTTP result is in flight.
  const canonical=match.taskID?(await client.query<{revision:number}>(`SELECT t.revision FROM screenshot_contact_tasks t
    JOIN product_runs r ON r.account_id=t.account_id AND r.task_id=t.id
    WHERE t.id=$3::uuid AND r.task_kind='screenshot'
      AND ($1::uuid IS NOT NULL AND r.id=$1 OR $1 IS NULL AND r.account_id=$2::uuid) FOR SHARE OF t`,
    [match.id??null,match.accountID??null,match.taskID])).rows[0]:undefined;
  if(canonical && Number(output.revision??0)<canonical.revision)return;
  const admitted=(await client.query<{task_id:string|null;task_kind:string;revision:number}>(`SELECT task_id,task_kind,
    COALESCE((output->>'revision')::int,0) AS revision FROM product_runs
    WHERE ($1::uuid IS NOT NULL AND id=$1 OR $1 IS NULL AND account_id=$2::uuid AND task_id=$3::uuid) FOR UPDATE`,
    [match.id??null,match.accountID??null,match.taskID??null])).rows[0];
  if (!admitted || admitted.task_id && admitted.task_id!==match.taskID
    || admitted.task_kind==='screenshot' && admitted.revision>Number(output.revision??0)) return;
  const hash = labHash(output);
  // Screenshot checkpoints legitimately update their own source generation.
  // Rebind only to a currently admitted canonical screenshot, never to failure.
  if (match.taskID && !["failed","deleted","expired","cancelled"].includes(status)) {
    await client.query(`UPDATE product_runs r SET source_generation=g.generation
      FROM harness_source_generations g WHERE g.account_id=r.account_id AND r.task_kind='screenshot'
        AND r.task_id=$3::uuid AND ($1::uuid IS NOT NULL AND r.id=$1 OR $1 IS NULL AND r.account_id=$2::uuid)
        AND r.expires_at>clock_timestamp()
        AND agent_session_screenshot_context_available(r.account_id,r.task_id)`,[match.id??null,match.accountID??null,match.taskID]);
  }
  await client.query(`UPDATE product_runs SET task_id=COALESCE(task_id,$3::uuid),
    output=CASE WHEN $6 NOT IN ('failed','deleted','expired','cancelled') AND product_run_source_available(id) THEN $4::jsonb ELSE NULL END,output_hash=$5,
    status=$6,updated_at=now(),finished_at=CASE WHEN $6='running' THEN NULL
      WHEN status IS DISTINCT FROM $6 OR output_hash IS DISTINCT FROM $5 THEN clock_timestamp()
      ELSE COALESCE(finished_at,clock_timestamp()) END,
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

const omitted = () => ({ status: "unavailable" as const, original_bytes: 0, retained_bytes: 0, sha256: null });
export function metadataOnlyProductSpan<T extends { input: unknown; output: unknown; error: string | null; metadata: Record<string, unknown> }>(span: T) {
  const keys = ["model", "provider", "prompt_revision", "input_tokens", "output_tokens", "duration_ms", "usage", "cost_usd"];
  return { ...span, input: omitted(), output: omitted(), error: span.error ? "Operation failed" : null,
    metadata: Object.fromEntries(Object.entries(span.metadata).filter(([key,value]) => keys.includes(key)
      && (typeof value === "number" || typeof value === "boolean" || typeof value === "string" || value === null))) };
}

/** Content stays request-local until a committed product source admits it.
 * Each DB statement only retains metadata during execution; a late append can
 * never recreate revoked content after cleanup. */
export function productRunSink(pool: Pool, id: string, onError: (error: unknown) => void, admittedGeneration?: string | null) {
  let writes: Promise<void> = Promise.resolve();
  let retainedBytes = 0;
  let sourceExpiresAt: number | undefined;
  const pending = new Map<string, ProductRunSpan>();
  return {
    async append(span: ProductRunSpan) {
      const safe = metadataOnlyProductSpan(span);
      const input=span.input.value as {observation?:{source_refs?:{kind?:string;expires_at?:string}}} | undefined;
      const refs=input?.observation?.source_refs;
      if (refs?.kind === "product") {
        const expiry=Date.parse(refs.expires_at??"");
        sourceExpiresAt=Math.min(sourceExpiresAt??Infinity,Number.isFinite(expiry)?expiry:0);
      }
      const bytes = Buffer.byteLength(JSON.stringify(span));
      if (span.status === "completed" && retainedBytes + bytes <= 16_000_000) { pending.set(span.id, span); retainedBytes += bytes; }
      writes = writes.then(async () => {
        await pool.query("INSERT INTO product_run_spans(id,run_id,span) VALUES($1,$2,$3::jsonb) ON CONFLICT(id) DO NOTHING", [span.id,id,JSON.stringify(safe)]);
      }).catch(onError);
    },
    async flush() {
      await writes;
      try {
        await inTransaction(pool, async client => {
          if (sourceExpiresAt !== undefined) await client.query("UPDATE product_runs SET expires_at=LEAST(expires_at,$2) WHERE id=$1",[id,new Date(sourceExpiresAt)]);
          // Short authority locks serialize with source revocation, not the SDK.
          const row = (await client.query<{available:boolean}>(`SELECT product_run_source_available(r.id)
              AND r.source_generation=$2::bigint AS available
            FROM product_runs r JOIN harness_source_generations g ON g.account_id=r.account_id
            WHERE r.id=$1 FOR SHARE OF r,g NOWAIT`,[id,admittedGeneration??null])).rows[0];
          if (!row?.available) return;
          for (const span of pending.values()) {
            await client.query(`UPDATE product_run_spans SET span=$3::jsonb WHERE id=$1 AND run_id=$2
              AND product_run_source_available($2)`,[span.id,id,JSON.stringify(span)]);
          }
        });
      } catch (error) { onError(error); }
      finally { pending.clear(); retainedBytes=0; sourceExpiresAt=undefined; }
    },
  };
}
