import { createEnvironmentRuntimeObserver, type RuntimeObserver, type RuntimeObservationContext } from "@talent-signal/agent";
import type { DatabaseClient } from "../database/pool.js";
import { regressionLineageCurrent } from "./labRegressions.js";

/** Reconcile only locally retained runs; deleted history cannot starve later work. */
export async function sweepRuntimeObservationSources(database: DatabaseClient,
  observer: RuntimeObserver | null = createEnvironmentRuntimeObserver()): Promise<void> {
  if (!observer) return;
  observer.outbox.setSourceValidator((run) => runtimeObservationSourcesAvailable(database, run));
  for (const run of await observer.outbox.sourceRuns()) {
    if (!(await runtimeObservationSourcesAvailable(database, run))) await observer.outbox.deleteRun(run, true);
  }
  // Lifecycle reconciliation persists tombstones first. Remote deletion is
  // independently retried and does not block a source mutation response.
  void observer.outbox.flush().catch(() => { observer.last_error_code = "RUNTIME_OBSERVATION_EXPORT_UNAVAILABLE"; });
}

export async function runtimeObservationSourcesAvailable(database: DatabaseClient, run: RuntimeObservationContext): Promise<boolean> {
  for (const regressionID of new Set([...(run.source_regression_ids ?? []), ...(run.source_regression_id ? [run.source_regression_id] : [])])) {
    const row = (await database.query<{ id: string }>(`SELECT id FROM lab_regressions
      WHERE account_id::text=$1 AND id=$2 AND deleted_at IS NULL AND expires_at>now()`,
    [run.workspace_id, regressionID])).rows[0];
    if (!row || !(await regressionLineageCurrent(database, row.id))) return false;
  }
  if (run.source_lab_job_id) {
    const job = (await database.query<{ regression_id: string | null }>(`SELECT regression_id FROM lab_experiment_jobs
      WHERE account_id::text=$1 AND id=$2 AND expires_at>now()`, [run.workspace_id, run.source_lab_job_id])).rows[0];
    if (!job || (job.regression_id && !(await regressionLineageCurrent(database, job.regression_id)))) return false;
  }
  const refs = run.source_refs;
  if (refs?.kind === "synthetic") return true;
  if (!refs || Date.parse(refs.expires_at) <= Date.now()) return false;
  const result = await database.query<{ unavailable: boolean }>(`SELECT
      EXISTS(SELECT 1 FROM feedback_execution_snapshots e
        WHERE e.account_id::text=$1 AND e.task_id::text=$2
          AND (e.source_state<>'available' OR feedback_execution_source_state(e.id)<>'available'))
      OR ($3::text IS NOT NULL AND NOT EXISTS(SELECT 1 FROM agent_sessions s
        WHERE s.account_id::text=$1 AND s.id::text=$3 AND s.deleted_at IS NULL AND s.expires_at>now()))
      OR NOT agent_session_chat_sources_available($1::uuid,$2)
      OR EXISTS(SELECT 1 FROM context_manifests m WHERE m.account_id::text=$1 AND m.task_id::text=$2
        AND NOT agent_session_task_available(m.account_id,$2,m.subject_id::text,m.assignment_id::text))
      OR EXISTS(SELECT 1 FROM unnest($4::uuid[]) AS requested(source_id) WHERE NOT EXISTS(
        SELECT 1 FROM captures c JOIN source_retention_receipts sr ON sr.account_id=c.account_id AND sr.capture_id=c.id
        WHERE c.account_id::text=$1 AND c.id=requested.source_id AND c.status='active' AND c.deleted_at IS NULL
          AND sr.source_access_state='available' AND sr.authorization_state='authorized'
          AND (sr.retention_until IS NULL OR sr.retention_until>now())
          AND (sr.authorization_expires_at IS NULL OR sr.authorization_expires_at>now())))
      OR EXISTS(SELECT 1 FROM unnest($5::uuid[]) AS requested(source_id) WHERE NOT EXISTS(
        SELECT 1 FROM evidence_fragments f JOIN source_resources r ON r.account_id=f.account_id AND r.id=f.resource_id
          JOIN captures c ON c.account_id=f.account_id AND c.id=f.capture_id
          JOIN source_retention_receipts sr ON sr.account_id=c.account_id AND sr.capture_id=c.id
        WHERE f.account_id::text=$1 AND f.id=requested.source_id AND f.status='active' AND f.deleted_at IS NULL
          AND r.deleted_at IS NULL AND r.processing_state<>'deleted' AND c.status='active' AND c.deleted_at IS NULL
          AND sr.source_access_state<>'deleted' AND sr.authorization_state='authorized'
          AND (sr.retention_until IS NULL OR sr.retention_until>now())
          AND (sr.authorization_expires_at IS NULL OR sr.authorization_expires_at>now())
          AND (cardinality($7::uuid[])=0 OR c.subject_id=ANY($7::uuid[]))
          AND (cardinality($8::uuid[])=0 OR c.assignment_id=ANY($8::uuid[]))))
      OR EXISTS(SELECT 1 FROM unnest($6::uuid[]) AS requested(source_id) WHERE NOT EXISTS(
        SELECT 1 FROM chat_media_assets m WHERE m.account_id::text=$1 AND m.id=requested.source_id AND m.status='ready' AND m.deleted_at IS NULL))
      OR EXISTS(SELECT 1 FROM unnest($7::uuid[]) AS requested(source_id) WHERE NOT EXISTS(
        SELECT 1 FROM subjects p WHERE p.account_id::text=$1 AND p.id=requested.source_id AND p.status='active' AND p.deleted_at IS NULL))
      OR EXISTS(SELECT 1 FROM unnest($8::uuid[]) AS requested(source_id) WHERE NOT EXISTS(
        SELECT 1 FROM assignments a WHERE a.account_id::text=$1 AND a.id=requested.source_id AND a.status='active' AND a.deleted_at IS NULL)) AS unavailable`,
    [run.workspace_id, run.run_id, run.source_session_id ?? null, refs.capture_ids, refs.fragment_ids,
      refs.media_ids, refs.person_ids, refs.relationship_context_ids]);
  return result.rows[0]?.unavailable === false;
}
