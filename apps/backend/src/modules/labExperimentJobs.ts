import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { LabJob, LabJobAttempt, LabJobDefinition, LabJobRequest, LabJobReview, LabJobSummary, LabJobTask } from "@talent-signal/contracts";
import { inTransaction, type DatabaseClient } from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import type { AuthContext } from "./auth.js";
import type { RemoteChatAnswerProviding } from "./chatAnswerProvider.js";
import { taskModelCatalog, taskPromptRevision } from "./labTaskConfiguration.js";
import { labHash, labJobCases } from "./labJobCases.js";
import { createJobAttempts, executeJobAttempt, LAB_JOB_INSTRUMENT_REVISION } from "./labJobRunner.js";
import { regressionForRun, regressionLineageCurrent, scrubExpiredRegressions } from "./labRegressions.js";

interface JobRow {
  id: string; account_id: string; user_id: string; request_hash: string; definition_hash: string; definition: LabJobDefinition;
  status: LabJob["status"]; calls_reserved: number; review: LabJob["review"]; failure_categories: LabJob["failure_categories"];
  created_at: Date; expires_at: Date; cancel_requested_at: Date | null; lease_id: string | null;
  attempts?: LabJobAttempt[];
  expired?: boolean;
}
const scoped = (auth: AuthContext, id: string) => [auth.accountId, auth.userId, id];
const activeStatuses = ["queued", "running", "cancelling"];

export class LabExperimentJobService {
  private timer?: ReturnType<typeof setInterval>;
  private tickInFlight: Promise<void> | null = null;
  private readonly executions = new Set<Promise<void>>();
  private closed = false;
  private lastMaintenance = 0;

  constructor(readonly pool: Pool, readonly providers: Map<string, RemoteChatAnswerProviding>,
    readonly backendRevision: string | null, readonly dailyCallLimit = 240) {
    if (!Number.isInteger(dailyCallLimit) || dailyCallLimit < 2 || dailyCallLimit > 10_000) throw new Error("Invalid Lab daily call limit");
  }

  get models() {
    return taskModelCatalog(this.providers.values())
      .map((entry) => ({ task: entry.task, id: entry.model, prompt_presets: entry.promptPresets }));
  }
  get catalogRevision(): string {
    return labHash({ cases: labJobCases(), models: this.models.map((model) => ({ ...model,
      prompt_revisions: model.prompt_presets.map((preset) => {
        const entry = taskModelCatalog(this.providers.values()).find((value) => value.task === model.task && value.model === model.id)!;
        return taskPromptRevision(entry, preset);
      }) })),
      backend_revision: this.backendRevision, instrument_revision: LAB_JOB_INSTRUMENT_REVISION });
  }

  private modelEntry(task: LabJobTask, model: string) {
    return taskModelCatalog(this.providers.values()).find((value) => value.task === task && value.model === model);
  }

  async dailyCalls(auth: AuthContext): Promise<number> {
    const result = await this.pool.query<{ calls_reserved: number }>("SELECT calls_reserved FROM lab_model_call_budgets WHERE account_id=$1 AND day=(now() AT TIME ZONE 'UTC')::date", [auth.accountId]);
    return result.rows[0]?.calls_reserved ?? 0;
  }

  async start(auth: AuthContext, request: LabJobRequest): Promise<LabJob> {
    const task: LabJobTask = request.task ?? "relationship_text";
    const requestHash = labHash({ catalog_revision: request.catalog_revision, ...(request.task ? { task } : {}), case_ids: request.case_ids, configurations: request.configurations.map((value) => ({ model: value.model, prompt_preset: value.prompt_preset })), repetitions: request.repetitions, call_limit: request.call_limit,
      ...(request.regression_source ? { regression_source: request.regression_source } : {}) });
    await inTransaction(this.pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`lab-experiment:${auth.accountId}`]);
      const previous = await client.query<JobRow>("SELECT * FROM lab_experiment_jobs WHERE account_id=$1 AND user_id=$2 AND id=$3", scoped(auth, request.id));
      if (previous.rows[0]) {
        if (previous.rows[0].request_hash !== requestHash) throw new ApiError(409, "LAB_JOB_ID_CONFLICT", "This batch ID belongs to different settings.");
        return;
      }
      if (request.catalog_revision !== this.catalogRevision) throw new ApiError(409, "LAB_CATALOG_STALE", "The reviewed case or configuration catalog changed. Refresh and review it again.");
      const regression = request.regression_source ? await regressionForRun(client, auth, request.regression_source) : null;
      const regressionTask = regression?.task ?? "relationship_text";
      if (regression && regressionTask !== task) throw new ApiError(422, "LAB_REGRESSION_TASK_MISMATCH", "Rerun the saved failure with its original task.");
      const cases = request.case_ids.map((id) => regression ? regression.case.id === id ? regression.case : undefined : labJobCases(task).find((sample) => sample.id === id));
      if (cases.some((sample) => !sample)) throw new ApiError(422, "LAB_CASE_UNAVAILABLE", "Choose registered synthetic cases.");
      if (request.configurations.some((value) => !this.models.some((model) => model.task === task && model.id === value.model && model.prompt_presets.includes(value.prompt_preset)))) {
        throw new ApiError(422, "LAB_CONFIGURATION_UNAVAILABLE", "Choose admitted models and prompt presets.");
      }
      const busy = await client.query(`SELECT id FROM lab_experiment_jobs WHERE account_id=$1 AND status=ANY($2::text[]) AND expires_at > now()
        UNION ALL SELECT id FROM lab_experiments WHERE account_id=$1 AND record->>'status'='running' AND created_at > now()-interval '2 minutes'`, [auth.accountId, activeStatuses]);
      if (busy.rows.length) throw new ApiError(409, "LAB_EXPERIMENT_BUSY", "An experiment is already active in this workspace.");
      const [a, b] = request.configurations;
      const sameModel = a!.model === b!.model, samePrompt = a!.prompt_preset === b!.prompt_preset;
      const referenceTime = regression?.reference_time ?? new Date().toISOString();
      const frozenCases = (cases as LabJobDefinition["cases"]).map((sample) => {
        if (regression) return sample; // Do not append today's clock, expected behavior, or review notes to a regression input.
        const input = JSON.parse(sample.input_json) as { objective?: unknown };
        if (typeof input.objective !== "string") throw new ApiError(422, "LAB_CASE_UNAVAILABLE", "The registered synthetic case is not executable.");
        input.objective += ` Reference time for this experiment: ${referenceTime}.`;
        return { ...sample, input_json: JSON.stringify(input), input_hash: labHash(input) };
      });
      const definition: LabJobDefinition = { task, cases: frozenCases,
        configurations: request.configurations.map((value) => ({ ...value,
          prompt_revision: taskPromptRevision(this.modelEntry(task, value.model)!, value.prompt_preset) })),
        comparison: sameModel ? samePrompt ? "repeatability" : "prompt" : samePrompt ? "model" : "combined",
        repetitions: request.repetitions, call_limit: request.call_limit, max_output_tokens_per_call: 1600,
        reference_time: referenceTime, backend_revision: this.backendRevision, instrument_revision: LAB_JOB_INSTRUMENT_REVISION,
        tool_access: task === "unscoped_chat" ? ["contact_workspace"] : [], business_write_count: 0, cost_status: "unavailable",
        ...(request.regression_source ? { regression_source: request.regression_source } : {}) };
      if (request.call_limit > cases.length * 2 * request.repetitions) throw new ApiError(422, "LAB_BUDGET_EXCEEDS_PLAN", "The call limit cannot exceed the planned calls.");
      const expiry = new Date(Date.now() + 7 * 86400_000);
      await client.query(`INSERT INTO lab_experiment_jobs(id,account_id,user_id,request_hash,definition_hash,definition,status,expires_at,regression_id)
        VALUES($1,$2,$3,$4,$5,$6::jsonb,'queued',$7,$8)`, [request.id, auth.accountId, auth.userId, requestHash, labHash(definition), JSON.stringify(definition), expiry, request.regression_source?.id ?? null]);
      for (const attempt of createJobAttempts(definition)) await client.query(`INSERT INTO lab_experiment_attempts(id,job_id,ordinal,record,status) VALUES($1,$2,$3,$4::jsonb,'pending')`,
        [attempt.id, request.id, attempt.ordinal, JSON.stringify(attempt)]);
    });
    const record = await this.read(auth, request.id);
    if (this.timer) void this.tick().catch(() => {});
    return record;
  }

  async read(auth: AuthContext, id: string): Promise<LabJob> {
    const result = await this.pool.query<JobRow>(`SELECT j.*,j.expires_at <= now() AS expired,COALESCE((SELECT jsonb_agg(a.record ORDER BY a.ordinal)
      FROM lab_experiment_attempts a WHERE a.job_id=j.id),'[]'::jsonb) AS attempts FROM lab_experiment_jobs j
      WHERE account_id=$1 AND user_id=$2 AND id=$3`, scoped(auth, id));
    const row = result.rows[0];
    if (!row) throw new ApiError(404, "LAB_JOB_NOT_FOUND", "This experiment batch was not found.");
    if (row.expired) throw new ApiError(410, "LAB_JOB_EXPIRED", "This batch has expired.");
    return this.project(row);
  }

  async list(auth: AuthContext, regressionID: string | null = null): Promise<LabJobSummary[]> {
    const result = await this.pool.query<JobRow>(`SELECT * FROM lab_experiment_jobs WHERE account_id=$1 AND user_id=$2 AND expires_at > now()
      AND ($4::uuid IS NULL OR regression_id=$4) ORDER BY (status=ANY($3::text[])) DESC, created_at DESC LIMIT 10`, [auth.accountId, auth.userId, activeStatuses, regressionID]);
    return result.rows.map((row) => ({ id: row.id, status: row.status, created_at: row.created_at.toISOString(), expires_at: row.expires_at.toISOString(),
      case_count: row.definition.cases.length, repetitions: row.definition.repetitions,
      planned_calls: row.definition.cases.length * 2 * row.definition.repetitions, calls_reserved: row.calls_reserved,
      task: row.definition.task, models: row.definition.configurations.map((value) => value.model), review: row.review }));
  }

  private async project(row: JobRow): Promise<LabJob> {
    const attempts = row.attempts ?? [];
    return { id: row.id, definition_hash: row.definition_hash, definition: row.definition, status: row.status,
      attempts, calls_reserved: row.calls_reserved, created_at: row.created_at.toISOString(), expires_at: row.expires_at.toISOString(),
      cancel_requested_at: row.cancel_requested_at?.toISOString() ?? null, review: row.review, failure_categories: row.failure_categories,
      quality: attempts.some((value) => value.checks.some((check) => check.verdict === "fail")) ? "blocked" : "needs_review" };
  }

  async cancel(auth: AuthContext, id: string): Promise<LabJob> {
    await inTransaction(this.pool, async (client) => {
      const result = await client.query<JobRow>("SELECT *,expires_at <= now() AS expired FROM lab_experiment_jobs WHERE account_id=$1 AND user_id=$2 AND id=$3 FOR UPDATE", scoped(auth, id));
      const row = result.rows[0];
      if (!row) throw new ApiError(404, "LAB_JOB_NOT_FOUND", "This experiment batch was not found.");
      if (row.expired) throw new ApiError(410, "LAB_JOB_EXPIRED", "This batch has expired.");
      if (!activeStatuses.includes(row.status)) return;
      await this.cancelPending(client, id, "CANCELLED_BEFORE_DISPATCH");
      await client.query(`UPDATE lab_experiment_jobs SET cancel_requested_at=COALESCE(cancel_requested_at,now()),
        status=CASE WHEN status='queued' THEN 'cancelled' ELSE 'cancelling' END WHERE id=$1`, [id]);
    });
    return this.read(auth, id);
  }

  async review(auth: AuthContext, id: string, value: LabJobReview): Promise<LabJob> {
    const result = await this.pool.query(`UPDATE lab_experiment_jobs SET review=$4,failure_categories=$5::jsonb
      WHERE account_id=$1 AND user_id=$2 AND id=$3 AND expires_at > now() AND NOT(status=ANY($6::text[])) RETURNING id`,
    [...scoped(auth, id), value.review, JSON.stringify(value.failure_categories), activeStatuses]);
    if (!result.rows[0]) throw new ApiError(409, "LAB_JOB_NOT_REVIEWABLE", "Refresh and wait for the batch to stop before reviewing.");
    return this.read(auth, id);
  }

  private async cancelPending(client: DatabaseClient, id: string, reason: string) {
    await client.query(`UPDATE lab_experiment_attempts SET status='cancelled', record=record || jsonb_build_object('status','cancelled','error_code',$2::text,'finished_at',now())
      WHERE job_id=$1 AND status='pending'`, [id, reason]);
  }

  startWorker(): void {
    if (this.timer || this.closed) return;
    this.timer = setInterval(() => { void this.tick().catch(() => {}); }, 5000); this.timer.unref();
    void this.tick().catch(() => {});
  }
  tick(): Promise<void> {
    if (this.closed) return Promise.resolve();
    if (!this.tickInFlight) this.tickInFlight = this.performTick().finally(() => { this.tickInFlight = null; });
    return this.tickInFlight;
  }
  private async performTick() {
    if (Date.now() - this.lastMaintenance >= 30_000) {
      await scrubExpiredRegressions(this.pool); await this.recoverStale(); await this.scrubExpired(); this.lastMaintenance = Date.now();
    }
    while (!this.closed && this.executions.size < 2) {
      const claimed = await inTransaction(this.pool, async (client) => {
        const rows = await client.query<JobRow>("SELECT * FROM lab_experiment_jobs WHERE status='queued' AND expires_at > now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1");
        const row = rows.rows[0]; if (!row) return null;
        const lease = randomUUID();
        await client.query("UPDATE lab_experiment_jobs SET status='running',lease_id=$2,lease_expires_at=now()+interval '90 seconds' WHERE id=$1", [row.id, lease]);
        return { ...row, lease_id: lease };
      });
      if (!claimed) return;
      const execution = this.execute(claimed).catch(() => {}).finally(() => { this.executions.delete(execution); });
      this.executions.add(execution);
    }
  }

  private async reserveAttempt(row: JobRow): Promise<LabJobAttempt | null> {
    return inTransaction(this.pool, async (client) => {
      const current = await client.query<JobRow>("SELECT * FROM lab_experiment_jobs WHERE id=$1 AND lease_id=$2 AND status='running' AND expires_at > now() FOR UPDATE", [row.id, row.lease_id]);
      const job = current.rows[0]; if (!job) return null;
      if (job.definition.regression_source && !await regressionLineageCurrent(client, job.definition.regression_source.id)) {
        await this.cancelPending(client, row.id, "REGRESSION_DELETED_OR_EXPIRED"); return null;
      }
      const next = await client.query<{ record: LabJobAttempt }>("SELECT record FROM lab_experiment_attempts WHERE job_id=$1 AND status='pending' ORDER BY ordinal LIMIT 1 FOR UPDATE", [row.id]);
      if (!next.rows[0]) return null;
      await client.query("INSERT INTO lab_model_call_budgets(account_id,day) VALUES($1,(now() AT TIME ZONE 'UTC')::date) ON CONFLICT DO NOTHING", [row.account_id]);
      const budget = await client.query<{ calls_reserved: number }>("SELECT calls_reserved FROM lab_model_call_budgets WHERE account_id=$1 AND day=(now() AT TIME ZONE 'UTC')::date FOR UPDATE", [row.account_id]);
      if (job.calls_reserved >= job.definition.call_limit || budget.rows[0]!.calls_reserved >= this.dailyCallLimit) {
        await this.cancelPending(client, row.id, "CALL_BUDGET_EXHAUSTED"); return null;
      }
      if (job.definition.backend_revision !== this.backendRevision || labHash(job.definition) !== job.definition_hash) {
        await this.cancelPending(client, row.id, "FROZEN_CONFIGURATION_CHANGED"); return null;
      }
      const record: LabJobAttempt = { ...next.rows[0].record, status: "dispatching", started_at: new Date().toISOString() };
      await client.query("UPDATE lab_experiment_attempts SET status='dispatching',record=$2::jsonb WHERE id=$1", [record.id, JSON.stringify(record)]);
      await client.query("UPDATE lab_experiment_jobs SET calls_reserved=calls_reserved+1 WHERE id=$1", [row.id]);
      await client.query("UPDATE lab_model_call_budgets SET calls_reserved=calls_reserved+1 WHERE account_id=$1 AND day=(now() AT TIME ZONE 'UTC')::date", [row.account_id]);
      return record; // Reservation commits before the provider can see a request.
    });
  }

  private async execute(row: JobRow): Promise<void> {
    const heartbeat = setInterval(() => {
      void this.pool.query("UPDATE lab_experiment_jobs SET lease_expires_at=now()+interval '90 seconds' WHERE id=$1 AND lease_id=$2 AND status IN ('running','cancelling')", [row.id, row.lease_id]).catch(() => {});
    }, 10_000); heartbeat.unref();
    try {
      while (!this.closed) {
        const attempt = await this.reserveAttempt(row); if (!attempt) break;
        const sample = row.definition.cases.find((value) => value.id === attempt.case_id)!;
        const result = await executeJobAttempt(attempt, sample, row.definition, this.modelEntry(row.definition.task, attempt.requested_model)?.provider);
        await this.pool.query(`UPDATE lab_experiment_attempts SET status=$3,record=$4::jsonb WHERE id=$1 AND status='dispatching'
          AND EXISTS(SELECT 1 FROM lab_experiment_jobs WHERE id=$2 AND lease_id=$5 AND expires_at > now() AND status IN ('running','cancelling'))`,
        [attempt.id, row.id, result.status, JSON.stringify(result), row.lease_id]);
      }
      await this.finish(row);
    } finally { clearInterval(heartbeat); }
  }

  private async finish(row: JobRow) {
    await inTransaction(this.pool, async (client) => {
      const current = await client.query<JobRow>("SELECT * FROM lab_experiment_jobs WHERE id=$1 AND lease_id=$2 AND status IN ('running','cancelling') FOR UPDATE", [row.id, row.lease_id]);
      const job = current.rows[0]; if (!job) return;
      const values = await client.query<{ status: LabJobAttempt["status"] }>("SELECT status FROM lab_experiment_attempts WHERE job_id=$1", [row.id]);
      const states = values.rows.map((value) => value.status);
      const complete = states.filter((value) => value === "completed").length;
      const status: LabJob["status"] = states.includes("unknown") || states.includes("dispatching") ? "unknown"
        : job.cancel_requested_at ? "cancelled" : states.includes("pending") ? "queued"
        : complete === states.length ? "completed" : complete > 0 ? "partial" : "failed";
      await client.query("UPDATE lab_experiment_jobs SET status=$3,lease_id=NULL,lease_expires_at=NULL WHERE id=$1 AND lease_id=$2", [row.id, row.lease_id, status]);
    });
  }

  async recoverStale(): Promise<void> {
    await inTransaction(this.pool, async (client) => {
      const rows = await client.query<JobRow>("SELECT * FROM lab_experiment_jobs WHERE status IN ('running','cancelling') AND lease_expires_at < now() FOR UPDATE SKIP LOCKED");
      for (const row of rows.rows) {
        const running = await client.query(`UPDATE lab_experiment_attempts SET status='unknown',record=record || jsonb_build_object('status','unknown','error_code','WORKER_LOST_AFTER_RESERVATION','finished_at',now())
          WHERE job_id=$1 AND status='dispatching' RETURNING id`, [row.id]);
        if (running.rows.length) {
          await this.cancelPending(client, row.id, "STOPPED_AFTER_UNKNOWN_ATTEMPT");
          await client.query("UPDATE lab_experiment_jobs SET status='unknown',lease_id=NULL,lease_expires_at=NULL WHERE id=$1", [row.id]);
        } else {
          await client.query("UPDATE lab_experiment_jobs SET status=CASE WHEN cancel_requested_at IS NULL THEN 'queued' ELSE 'cancelled' END,lease_id=NULL,lease_expires_at=NULL WHERE id=$1", [row.id]);
        }
      }
    });
  }

  async scrubExpired(): Promise<void> {
    // Preserve non-content ID/hash tombstones. Expired jobs cannot dispatch or be replayed.
    await this.pool.query("DELETE FROM lab_experiment_attempts WHERE job_id IN (SELECT id FROM lab_experiment_jobs WHERE expires_at <= now())");
    await this.pool.query("UPDATE lab_experiment_jobs SET definition=jsonb_set(definition,'{cases}','[]'),status=CASE WHEN status IN ('queued','running','cancelling') THEN 'unknown' ELSE status END,lease_id=NULL,lease_expires_at=NULL WHERE expires_at <= now() AND definition->'cases' <> '[]'::jsonb");
    await this.pool.query("DELETE FROM lab_model_call_budgets WHERE day < (now() AT TIME ZONE 'UTC')::date-8");
  }

  async waitForIdle(): Promise<void> { await Promise.all([...this.executions]); }
  async close(): Promise<void> {
    this.closed = true; if (this.timer) clearInterval(this.timer);
    await this.tickInFlight; await this.waitForIdle();
  }
}
