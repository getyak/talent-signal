import type { Pool } from "pg";
import type { LabCIRequest, LabCIReceipt, LabCIState, LabRegressionExport } from "@talent-signal/contracts";
import { inTransaction } from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import type { AuthContext } from "./auth.js";
import type { LabExperimentJobService } from "./labExperimentJobs.js";
import { labHash } from "./labJobCases.js";
import { regressionForRun } from "./labRegressions.js";
import { LabCIVerificationError, type LabCIVerifying, type LabCIVerifiedEvidence } from "./labCIVerifier.js";

type ReleaseCheck = "not_connected" | "ci_verified" | "ci_needs_refresh";
interface VerificationRow { request_hash: string; receipt: LabCIReceipt | null }
export class LabCIVerificationService {
  constructor(readonly pool: Pool, readonly jobs: LabExperimentJobService, readonly verifier: LabCIVerifying | null) {}
  async states(auth: AuthContext, ids: string[]): Promise<Map<string, { ci: LabCIState; releaseCheck: ReleaseCheck }>> {
    const result = await this.pool.query<{ regression_id: string; receipt: LabCIReceipt; current: boolean }>(`SELECT DISTINCT ON (regression_id)
      regression_id,receipt,(receipt->>'valid_until')::timestamptz > now() AS current FROM lab_ci_verifications
      WHERE account_id=$1 AND user_id=$2 AND regression_id=ANY($3::uuid[]) AND receipt IS NOT NULL
      ORDER BY regression_id,created_at DESC,id`, [auth.accountId, auth.userId, ids]);
    return new Map(ids.map((id) => {
      const row = result.rows.find((value) => value.regression_id === id);
      const releaseCheck: ReleaseCheck = row?.receipt.state === "verified" ? this.verifier && row.current
        && row.receipt.trust_digest === this.verifier.trustDigest ? "ci_verified" : "ci_needs_refresh" : "not_connected";
      return [id, { ci: { available: this.verifier !== null, repository: this.verifier?.repository ?? null, latest: row?.receipt ?? null }, releaseCheck }];
    }));
  }
  async read(auth: AuthContext, regressionId: string, id: string): Promise<LabCIReceipt> {
    const result = await this.pool.query<VerificationRow>(`SELECT v.request_hash,v.receipt FROM lab_ci_verifications v
      JOIN lab_regressions r ON r.id=v.regression_id WHERE v.account_id=$1 AND v.user_id=$2 AND v.regression_id=$3 AND v.id=$4`,
    [auth.accountId, auth.userId, regressionId, id]);
    const row = result.rows[0];
    if (!row) throw new ApiError(404, "LAB_CI_VERIFICATION_NOT_FOUND", "This CI verification was not found.");
    if (!row.receipt) throw new ApiError(410, "LAB_REGRESSION_GONE", "This regression and its verification were deleted.");
    await regressionForRun(this.pool, auth, { id: regressionId, content_hash: row.receipt.regression_content_hash });
    return row.receipt;
  }
  async verify(auth: AuthContext, regressionId: string, request: LabCIRequest): Promise<LabCIReceipt> {
    const requestHash = labHash({ regressionId, request });
    const replay = await this.pool.query<VerificationRow>("SELECT request_hash,receipt FROM lab_ci_verifications WHERE account_id=$1 AND user_id=$2 AND id=$3", [auth.accountId, auth.userId, request.id]);
    if (replay.rows[0]) {
      if (replay.rows[0].request_hash !== requestHash) throw new ApiError(409, "LAB_CI_ID_CONFLICT", "This verification ID identifies a different request.");
      return this.read(auth, regressionId, request.id);
    }
    if (!this.verifier) throw new ApiError(503, "LAB_CI_NOT_CONFIGURED", "The operator has not configured trusted CI verification.");
    const snapshot = await regressionForRun(this.pool, auth, { id: regressionId, content_hash: request.regression_content_hash });
    const times = await this.pool.query<{ created_at: Date; expires_at: Date }>("SELECT created_at,expires_at FROM lab_regressions WHERE id=$1", [regressionId]);
    const source = times.rows[0]!;
    const job = await this.jobs.read(auth, request.job_id);
    if (job.definition.regression_source?.id !== regressionId || job.definition.regression_source.content_hash !== request.regression_content_hash) {
      throw new ApiError(409, "LAB_CI_RUN_BINDING_MISMATCH", "Choose a rerun of this exact regression case.");
    }
    const bundle: LabRegressionExport = { schema_version: "lab-regression-bundle.v1", execution_authority: "none", id: regressionId,
      content_hash: request.regression_content_hash, snapshot, created_at: source.created_at.toISOString(), expires_at: source.expires_at.toISOString() };
    let evidence: LabCIVerifiedEvidence | undefined, reasonCode = "LAB_CI_VERIFIED";
    try { evidence = await this.verifier.verify(bundle, job, request.github_run_id); }
    catch (error) { reasonCode = error instanceof LabCIVerificationError ? error.code : "LAB_CI_VERIFICATION_UNAVAILABLE"; }
    return inTransaction(this.pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`lab-experiment:${auth.accountId}`]);
      await regressionForRun(client, auth, { id: regressionId, content_hash: request.regression_content_hash });
      const currentJob = await client.query<{ expires_at: Date; definition_hash: string; now: Date }>(`SELECT expires_at,definition_hash,now() FROM lab_experiment_jobs
        WHERE id=$1 AND account_id=$2 AND user_id=$3 AND expires_at > now() FOR SHARE`, [request.job_id, auth.accountId, auth.userId]);
      const current = currentJob.rows[0];
      if (!current || current.definition_hash !== job.definition_hash) throw new ApiError(410, "LAB_CI_RUN_GONE", "The rerun expired or was removed during verification.");
      const checkedAt = current.now.toISOString();
      const validUntil = evidence ? new Date(Math.min(current.now.getTime() + 15 * 60_000, current.expires_at.getTime(), source.expires_at.getTime(), Date.parse(evidence.artifactExpiresAt))) : current.now;
      if (evidence && !(validUntil.getTime() > current.now.getTime())) { evidence = undefined; reasonCode = "LAB_CI_EVIDENCE_EXPIRED"; }
      const receipt: LabCIReceipt = { id: request.id, regression_id: regressionId, regression_content_hash: request.regression_content_hash, job_id: request.job_id,
        state: evidence ? "verified" : "not_verified", reason_code: reasonCode, checked_at: checkedAt, valid_until: evidence ? validUntil.toISOString() : checkedAt,
        repository: this.verifier!.repository, trust_digest: this.verifier!.trustDigest,
        github_run_id: request.github_run_id, github_run_attempt: evidence?.runAttempt ?? null,
        github_job_id: evidence?.jobId ?? null, artifact_id: evidence?.artifactId ?? null, artifact_digest: evidence?.artifactDigest ?? null,
        report_digest: evidence?.reportDigest ?? null, source_revision: evidence?.sourceRevision ?? null,
        backend_revision: job.definition.backend_revision,
        workflow_conclusion: evidence?.workflowConclusion ?? null, job_conclusion: evidence?.jobConclusion ?? null,
        integrity: evidence?.integrity ?? null, quality: "needs_review", release_enforcement: "not_verified" };
      const inserted = await client.query(`INSERT INTO lab_ci_verifications(id,account_id,user_id,regression_id,request_hash,receipt)
        VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(id) DO NOTHING RETURNING id`, [request.id, auth.accountId, auth.userId, regressionId, requestHash, JSON.stringify(receipt)]);
      if (!inserted.rowCount) {
        const previous = await client.query<VerificationRow>("SELECT request_hash,receipt FROM lab_ci_verifications WHERE account_id=$1 AND user_id=$2 AND id=$3", [auth.accountId, auth.userId, request.id]);
        if (!previous.rows[0] || previous.rows[0].request_hash !== requestHash || !previous.rows[0].receipt) throw new ApiError(409, "LAB_CI_ID_CONFLICT", "The verification ID cannot be reused.");
        return previous.rows[0].receipt;
      }
      return receipt;
    });
  }
}
