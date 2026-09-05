import type { Pool } from "pg";
import { CONTRACT_VERSION, type LabJobAttempt, type LabJobDefinition, type LabRegression,
  type LabRegressionDeletion, type LabRegressionRequest, type LabRegressionSnapshot, type LabRegressionSummary } from "@talent-signal/contracts";
import { inTransaction, type DatabaseClient } from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import type { AuthContext } from "./auth.js";
import type { LabExperimentJobService } from "./labExperimentJobs.js";
import { labHash } from "./labJobCases.js";
import type { LabCIVerificationService } from "./labCIVerifications.js";

interface RegressionRow {
  id: string; account_id: string; user_id: string; request_hash: string; content_hash: string;
  snapshot: LabRegressionSnapshot | null; created_at: Date; expires_at: Date;
  expired: boolean; deleted_at: Date | null; deleted_job_ids: string[];
}
const scoped = (auth: Pick<AuthContext, "accountId" | "userId">, id: string) => [auth.accountId, auth.userId, id];

export async function regressionLineageCurrent(client: DatabaseClient, id: string): Promise<boolean> {
  const result = await client.query<{ valid: boolean | null }>(`WITH RECURSIVE lineage AS (
    SELECT id,parent_id,deleted_at,expires_at FROM lab_regressions WHERE id=$1
    UNION ALL SELECT r.id,r.parent_id,r.deleted_at,r.expires_at FROM lab_regressions r JOIN lineage ON r.id=lineage.parent_id
  ) SELECT bool_and(deleted_at IS NULL AND expires_at > now()) AS valid FROM lineage`, [id]);
  return result.rows[0]?.valid === true;
}

export async function regressionForRun(client: DatabaseClient, auth: AuthContext,
  source: { id: string; content_hash: string }): Promise<LabRegressionSnapshot> {
  const result = await client.query<RegressionRow>(`SELECT *,expires_at <= now() AS expired FROM lab_regressions
    WHERE account_id=$1 AND user_id=$2 AND id=$3 FOR SHARE`, scoped(auth, source.id));
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "LAB_REGRESSION_NOT_FOUND", "This regression case was not found.");
  if (row.deleted_at || row.expired || !row.snapshot || !await regressionLineageCurrent(client, source.id)) throw new ApiError(410, "LAB_REGRESSION_GONE", "This regression case was deleted or expired.");
  if (row.content_hash !== source.content_hash || labHash(row.snapshot) !== row.content_hash) {
    throw new ApiError(409, "LAB_REGRESSION_CHANGED", "The reviewed regression snapshot does not match.");
  }
  return row.snapshot;
}

/** The same account lock as batch creation prevents new descendants during deletion. */
async function tombstone(client: DatabaseClient, auth: Pick<AuthContext, "accountId" | "userId">, id: string): Promise<RegressionRow> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`lab-experiment:${auth.accountId}`]);
  const result = await client.query<RegressionRow>("SELECT * FROM lab_regressions WHERE account_id=$1 AND user_id=$2 AND id=$3 FOR UPDATE", scoped(auth, id));
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "LAB_REGRESSION_NOT_FOUND", "This regression case was not found.");
  if (row.deleted_at) return row;
  const descendants = await client.query<{ id: string }>(`WITH RECURSIVE tree AS (
    SELECT id FROM lab_regressions WHERE account_id=$1 AND user_id=$2 AND id=$3
    UNION ALL SELECT r.id FROM lab_regressions r JOIN tree ON r.parent_id=tree.id WHERE r.account_id=$1 AND r.user_id=$2
  ) SELECT id FROM tree`, scoped(auth, id));
  const ids = descendants.rows.map((value) => value.id);
  const jobs = await client.query<{ id: string }>(`UPDATE lab_experiment_jobs SET expires_at=LEAST(expires_at,now()),
    status=CASE WHEN status IN ('queued','running','cancelling') THEN 'unknown' ELSE status END,
    lease_id=NULL,lease_expires_at=NULL,definition=jsonb_set(definition,'{cases}','[]')
    WHERE account_id=$1 AND user_id=$2 AND regression_id=ANY($3::uuid[]) RETURNING id`, [auth.accountId, auth.userId, ids]);
  const jobIDs = jobs.rows.map((value) => value.id).sort();
  await client.query("DELETE FROM lab_experiment_attempts WHERE job_id=ANY($1::uuid[])", [jobIDs]);
  await client.query("UPDATE lab_ci_verifications SET receipt=NULL WHERE regression_id=ANY($1::uuid[])", [ids]);
  await client.query(`UPDATE lab_regressions SET snapshot=NULL,deleted_at=COALESCE(deleted_at,now()),
    deleted_job_ids=ARRAY(SELECT DISTINCT unnest(deleted_job_ids || $2::uuid[]) ORDER BY 1) WHERE id=ANY($1::uuid[])`, [ids, jobIDs]);
  return (await client.query<RegressionRow>("SELECT * FROM lab_regressions WHERE id=$1", [id])).rows[0]!;
}

export async function scrubExpiredRegressions(pool: Pool): Promise<void> {
  const expired = await pool.query<RegressionRow>("SELECT id,account_id,user_id FROM lab_regressions WHERE deleted_at IS NULL AND expires_at <= now() ORDER BY created_at LIMIT 100");
  for (const row of expired.rows) await inTransaction(pool, async (client) => {
    await tombstone(client, { accountId: row.account_id, userId: row.user_id }, row.id);
  });
}

export class LabRegressionService {
  constructor(readonly pool: Pool, readonly jobs: LabExperimentJobService, readonly ci?: LabCIVerificationService) {}

  async save(auth: AuthContext, request: LabRegressionRequest): Promise<LabRegression> {
    if (!["apple_human", "password_human", "simulated_human", "lab_human"].includes(auth.userKind)) {
      throw new ApiError(403, "LAB_HUMAN_REVIEW_REQUIRED", "A signed-in human must choose the failure and expected behavior.");
    }
    const requestHash = labHash(request);
    await inTransaction(this.pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`lab-experiment:${auth.accountId}`]);
      const previous = await client.query<RegressionRow>("SELECT * FROM lab_regressions WHERE account_id=$1 AND user_id=$2 AND id=$3", scoped(auth, request.id));
      if (previous.rows[0]) {
        if (previous.rows[0].request_hash !== requestHash) throw new ApiError(409, "LAB_REGRESSION_ID_CONFLICT", "This regression ID belongs to a different reviewed failure.");
        return;
      }
      const count = await client.query<{ count: string }>("SELECT count(*) FROM lab_regressions WHERE account_id=$1 AND user_id=$2 AND deleted_at IS NULL AND expires_at > now()", [auth.accountId, auth.userId]);
      if (Number(count.rows[0]!.count) >= 100) throw new ApiError(409, "LAB_REGRESSION_LIMIT", "Delete an obsolete regression before saving another.");
      const source = await client.query<{ definition: LabJobDefinition; definition_hash: string; record: LabJobAttempt; status: string; expired: boolean; regression_id: string | null; now: Date }>(
        `SELECT j.definition,j.definition_hash,j.status,j.expires_at <= now() AS expired,j.regression_id,a.record,now()
         FROM lab_experiment_jobs j JOIN lab_experiment_attempts a ON a.job_id=j.id
         WHERE j.account_id=$1 AND j.user_id=$2 AND j.id=$3 AND a.id=$4 FOR SHARE OF j,a`,
        [...scoped(auth, request.source_job_id), request.source_attempt_id]);
      const row = source.rows[0];
      if (!row) throw new ApiError(404, "LAB_REGRESSION_SOURCE_NOT_FOUND", "The selected execution was not found.");
      if (row.expired) throw new ApiError(410, "LAB_REGRESSION_SOURCE_EXPIRED", "The selected execution has expired.");
      if (["queued", "running", "cancelling"].includes(row.status) || !["completed", "failed", "unknown"].includes(row.record.status)) {
        throw new ApiError(409, "LAB_REGRESSION_SOURCE_ACTIVE", "Wait for the batch to stop and choose an issued execution.");
      }
      if (row.definition_hash !== request.source_definition_hash || labHash(row.definition) !== row.definition_hash) {
        throw new ApiError(409, "LAB_REGRESSION_CHANGED", "Refresh the source before saving this failure.");
      }
      if (row.definition.regression_source) await regressionForRun(client, auth, row.definition.regression_source);
      const sample = row.definition.cases.find((value) => value.id === row.record.case_id);
      if (!sample || labHash(JSON.parse(sample.input_json)) !== sample.input_hash || !request.expected_behavior.trim()) {
        throw new ApiError(422, "LAB_REGRESSION_INVALID", "An intact synthetic case and expected behavior are required.");
      }
      const snapshot: LabRegressionSnapshot = { schema_version: "lab-regression.v1", data_class: "registered_synthetic",
        task: row.definition.task,
        source_job_id: request.source_job_id, source_definition_hash: row.definition_hash, source_attempt: row.record,
        case: sample, configurations: row.definition.configurations, reference_time: row.definition.reference_time,
        backend_revision: row.definition.backend_revision, instrument_revision: row.definition.instrument_revision,
        failure_categories: request.failure_categories, expected_behavior: request.expected_behavior.trim(), review_note: request.review_note.trim(),
        reviewer_id: auth.userId, reviewed_at: row.now.toISOString() };
      await client.query(`INSERT INTO lab_regressions(id,account_id,user_id,request_hash,content_hash,snapshot,parent_id)
        VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)`, [request.id, auth.accountId, auth.userId, requestHash, labHash(snapshot), JSON.stringify(snapshot), row.regression_id]);
    });
    return this.read(auth, request.id);
  }

  async read(auth: AuthContext, id: string): Promise<LabRegression> {
    const result = await this.pool.query<RegressionRow>("SELECT *,expires_at <= now() AS expired FROM lab_regressions WHERE account_id=$1 AND user_id=$2 AND id=$3", scoped(auth, id));
    const row = result.rows[0];
    if (!row) throw new ApiError(404, "LAB_REGRESSION_NOT_FOUND", "This regression case was not found.");
    if (row.expired || row.deleted_at || !row.snapshot || !await regressionLineageCurrent(this.pool, id)) throw new ApiError(410, "LAB_REGRESSION_GONE", "This regression case was deleted or expired.");
    if (labHash(row.snapshot) !== row.content_hash) throw new ApiError(409, "LAB_REGRESSION_CHANGED", "The stored regression snapshot could not be verified.");
    const verification = (await this.ci?.states(auth, [id]))?.get(id);
    return { id: row.id, content_hash: row.content_hash, snapshot: row.snapshot, created_at: row.created_at.toISOString(),
      expires_at: row.expires_at.toISOString(), release_check: verification?.releaseCheck ?? "not_connected",
      ci: verification?.ci ?? { available: false, repository: null, latest: null }, reruns: await this.jobs.list(auth, id) };
  }

  async list(auth: AuthContext): Promise<LabRegressionSummary[]> {
    const result = await this.pool.query<RegressionRow>(`WITH RECURSIVE gone AS (
      SELECT id FROM lab_regressions WHERE account_id=$1 AND user_id=$2 AND (deleted_at IS NOT NULL OR expires_at <= now())
      UNION SELECT r.id FROM lab_regressions r JOIN gone ON r.parent_id=gone.id WHERE r.account_id=$1 AND r.user_id=$2
    ) SELECT * FROM lab_regressions WHERE account_id=$1 AND user_id=$2 AND id NOT IN (SELECT id FROM gone)
      ORDER BY created_at DESC LIMIT 100`, [auth.accountId, auth.userId]);
    const verification = await this.ci?.states(auth, result.rows.map((row) => row.id));
    return result.rows.map((row) => ({ id: row.id, content_hash: row.content_hash, title: row.snapshot!.case.title,
      failure_categories: row.snapshot!.failure_categories, created_at: row.created_at.toISOString(), expires_at: row.expires_at.toISOString(), release_check: verification?.get(row.id)?.releaseCheck ?? "not_connected" }));
  }

  async remove(auth: AuthContext, id: string): Promise<LabRegressionDeletion> {
    const row = await inTransaction(this.pool, (client) => tombstone(client, auth, id));
    return { contract_version: CONTRACT_VERSION, id: row.id, content_hash: row.content_hash, status: "deleted",
      deleted_at: row.deleted_at!.toISOString(), affected_job_ids: row.deleted_job_ids };
  }
}
