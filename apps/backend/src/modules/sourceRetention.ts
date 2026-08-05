import { randomUUID } from "node:crypto";

import {
  SOURCE_RETENTION_POLICY_VERSION,
  type CaptureSourceInput,
  type CreateCaptureRequest,
  type SourceRetentionReceipt,
  type SourceRetentionRequest,
} from "@talent-signal/contracts";
import type { Pool, PoolClient } from "pg";

import { inTransaction } from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import { appendAudit } from "../lib/audit.js";
import type { AuthContext } from "./auth.js";

const DAY_MS = 24 * 60 * 60 * 1_000;
export const EVIDENCE_CROP_MAX_RETENTION_DAYS = 30;
export const FULL_SOURCE_MAX_RETENTION_DAYS = 7;

type SourceAccessState = SourceRetentionReceipt["source_access"]["state"];
type SourceAccessReason = SourceRetentionReceipt["source_access"]["reason"];
type RetentionEvent =
  SourceRetentionReceipt["lineage"][number]["event_type"];
type RetentionEventReason =
  SourceRetentionReceipt["lineage"][number]["reason"];

export interface ResolvedSourceRetentionPolicy {
  requestedMode: SourceRetentionRequest["requested_mode"];
  effectiveMode: SourceRetentionRequest["requested_mode"];
  sourceScope: SourceRetentionRequest["source_scope"];
  requestedRetentionUntil: Date | null;
  retentionUntil: Date | null;
  sourceAccessReason: SourceAccessReason;
}

interface RetentionRow {
  receipt_id: string;
  account_id: string;
  capture_id: string;
  policy_version: typeof SOURCE_RETENTION_POLICY_VERSION;
  requested_mode: SourceRetentionReceipt["requested_policy"]["mode"];
  effective_mode: SourceRetentionReceipt["effective_policy"]["mode"];
  source_scope: SourceRetentionReceipt["effective_policy"]["source_scope"];
  requested_retention_until: Date | null;
  retention_until: Date | null;
  source_access_state: SourceAccessState;
  source_access_reason: SourceAccessReason;
  review_completed_at: Date | null;
  source_purged_at: Date | null;
  deleted_at: Date | null;
  created_at: Date;
}

function invalidPolicy(code: string, message: string): never {
  throw new ApiError(422, code, message);
}

export function validateSourceRetentionPayload(
  request: CreateCaptureRequest,
): void {
  const { kind, retention } = request.source;
  const singleAtomicMessage =
    request.messages.length === 1 &&
    request.messages[0]?.sequence === 0;

  if (
    retention.source_scope === "reviewed_selected_text" &&
    (kind !== "transcript" || !singleAtomicMessage)
  ) {
    invalidPolicy(
      "SOURCE_SCOPE_PAYLOAD_MISMATCH",
      "Reviewed selected text requires one atomic transcript message.",
    );
  }
  if (
    retention.source_scope === "reviewed_evidence_crop"
  ) {
    invalidPolicy(
      "SOURCE_SCOPE_PAYLOAD_MISMATCH",
      "Reviewed evidence-crop retention is unavailable until the backend governs the actual crop asset.",
    );
  }
}

export function resolveSourceRetentionPolicy(
  request: SourceRetentionRequest,
  submittedAt = new Date(),
  sourceKind?: CaptureSourceInput["kind"],
): ResolvedSourceRetentionPolicy {
  if (
    request.requested_mode === "full_source" &&
    sourceKind !== "fixture"
  ) {
    invalidPolicy(
      "FULL_SOURCE_TRANSPORT_UNSUPPORTED",
      "This transport cannot prove that the backend received the complete reviewed source.",
    );
  }
  if (
    request.requested_mode === "full_source" &&
    request.source_scope !== "full_reviewed_source"
  ) {
    invalidPolicy(
      "FULL_SOURCE_SCOPE_REQUIRED",
      "Full-source retention requires a complete reviewed source payload.",
    );
  }
  if (
    request.requested_mode === "evidence_crop" &&
    request.source_scope === "full_reviewed_source"
  ) {
    invalidPolicy(
      "EVIDENCE_CROP_SCOPE_REQUIRED",
      "Evidence-crop retention accepts only the final reviewed crop or selection.",
    );
  }
  if (
    request.requested_mode === "ephemeral" &&
    request.requested_retention_until !== undefined
  ) {
    invalidPolicy(
      "EPHEMERAL_DEADLINE_NOT_ALLOWED",
      "Ephemeral source is purged when the analysis proposal commits, not at a caller-selected deadline.",
    );
  }

  const requestedRetentionUntil = request.requested_retention_until
    ? new Date(request.requested_retention_until)
    : null;
  if (
    requestedRetentionUntil &&
    (!Number.isFinite(requestedRetentionUntil.getTime()) ||
      requestedRetentionUntil <= submittedAt)
  ) {
    invalidPolicy(
      "RETENTION_DEADLINE_INVALID",
      "A requested retention deadline must be a valid future timestamp.",
    );
  }

  if (request.requested_mode === "ephemeral") {
    return {
      requestedMode: request.requested_mode,
      effectiveMode: request.requested_mode,
      sourceScope: request.source_scope,
      requestedRetentionUntil: null,
      retentionUntil: null,
      sourceAccessReason: "awaiting_review_completion",
    };
  }

  const maximumDays =
    request.requested_mode === "evidence_crop"
      ? EVIDENCE_CROP_MAX_RETENTION_DAYS
      : FULL_SOURCE_MAX_RETENTION_DAYS;
  const maximum = new Date(submittedAt.getTime() + maximumDays * DAY_MS);
  const retentionUntil =
    requestedRetentionUntil && requestedRetentionUntil < maximum
      ? requestedRetentionUntil
      : maximum;
  return {
    requestedMode: request.requested_mode,
    effectiveMode: request.requested_mode,
    sourceScope: request.source_scope,
    requestedRetentionUntil,
    retentionUntil,
    sourceAccessReason: "retained_until_deadline",
  };
}

async function appendRetentionEvent(
  client: PoolClient,
  row: Pick<RetentionRow, "account_id" | "receipt_id" | "capture_id">,
  eventType: RetentionEvent,
  reason: RetentionEventReason,
  occurredAt: Date,
): Promise<void> {
  await client.query(
    `INSERT INTO source_retention_events(
       id, account_id, receipt_id, capture_id, event_type, reason, occurred_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (account_id, receipt_id, event_type) DO NOTHING`,
    [
      randomUUID(),
      row.account_id,
      row.receipt_id,
      row.capture_id,
      eventType,
      reason,
      occurredAt,
    ],
  );
}

export async function createSourceRetentionRecord(
  client: PoolClient,
  input: {
    accountId: string;
    captureId: string;
    sourceLocator: string | null;
    policy: ResolvedSourceRetentionPolicy;
    submittedAt: Date;
  },
): Promise<void> {
  const { accountId, captureId, sourceLocator, policy, submittedAt } = input;
  await client.query(
    `INSERT INTO source_retention_receipts(
       receipt_id, account_id, capture_id, policy_version, requested_mode,
       effective_mode, source_scope, source_locator,
       requested_retention_until, retention_until, source_access_state,
       source_access_reason, created_at, updated_at
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'available', $11, $12, $12
     )`,
    [
      captureId,
      accountId,
      captureId,
      SOURCE_RETENTION_POLICY_VERSION,
      policy.requestedMode,
      policy.effectiveMode,
      policy.sourceScope,
      sourceLocator,
      policy.requestedRetentionUntil,
      policy.retentionUntil,
      policy.sourceAccessReason,
      submittedAt,
    ],
  );
  await appendRetentionEvent(
    client,
    {
      account_id: accountId,
      receipt_id: captureId,
      capture_id: captureId,
    },
    "source_submitted",
    "capture_submitted",
    submittedAt,
  );
}

async function retentionRow(
  client: PoolClient,
  accountId: string,
  captureId: string,
  lock = false,
): Promise<RetentionRow> {
  const result = await client.query<RetentionRow>(
    `SELECT
       receipt_id, account_id, capture_id, policy_version, requested_mode,
       effective_mode, source_scope, requested_retention_until,
       retention_until, source_access_state, source_access_reason,
       review_completed_at, source_purged_at, deleted_at, created_at
     FROM source_retention_receipts
     WHERE account_id = $1 AND capture_id = $2
     ${lock ? "FOR UPDATE" : ""}`,
    [accountId, captureId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ApiError(
      404,
      "RETENTION_RECEIPT_NOT_FOUND",
      "The source-retention receipt was not found.",
    );
  }
  return row;
}

async function purgeSourceContent(
  client: PoolClient,
  row: RetentionRow,
  reason: "review_completed" | "retention_deadline_elapsed",
  occurredAt: Date,
  actorUserId: string | null,
): Promise<boolean> {
  if (row.source_access_state !== "available") {
    return false;
  }

  const updated = await client.query(
    `UPDATE source_retention_receipts
     SET source_access_state = 'purged',
         source_access_reason = $3,
         source_purged_at = $4,
         updated_at = $4
     WHERE account_id = $1
       AND capture_id = $2
       AND source_access_state = 'available'`,
    [row.account_id, row.capture_id, reason, occurredAt],
  );
  if (updated.rowCount !== 1) {
    return false;
  }

  await client.query(
    `UPDATE evidence_items
     SET status = 'purged',
         redacted_text = NULL,
         content_hash = 'purged',
         purged_at = $3
     WHERE account_id = $1
       AND capture_id = $2
       AND status = 'active'`,
    [row.account_id, row.capture_id, occurredAt],
  );
  await client.query(
    `UPDATE proposed_assertions
     SET evidence_quote = NULL
     WHERE account_id = $1 AND capture_id = $2`,
    [row.account_id, row.capture_id],
  );
  await client.query(
    `UPDATE captures
     SET source_metadata = jsonb_strip_nulls(jsonb_build_object(
           'kind', source_kind,
           'captured_at', source_metadata->'captured_at',
           'source_timezone', source_metadata->'source_timezone',
           'purpose', purpose
         )),
         version = version + 1,
         updated_at = $3
     WHERE account_id = $1 AND id = $2`,
    [row.account_id, row.capture_id, occurredAt],
  );
  await client.query(
    `UPDATE idempotency_records
     SET response_body = jsonb_build_object('capture_id', $2)
     WHERE account_id = $1
       AND operation_scope = 'create_capture'
       AND response_body->>'id' = $2`,
    [row.account_id, row.capture_id],
  );
  await client.query(
    `UPDATE idempotency_records
     SET response_body = jsonb_set(
       response_body,
       '{assertions}',
       COALESCE(
         (
           SELECT jsonb_agg(
             jsonb_set(assertion, '{evidence_quote}', 'null'::jsonb, true)
           )
           FROM jsonb_array_elements(response_body->'assertions') assertion
         ),
         '[]'::jsonb
       ),
       true
     )
     WHERE account_id = $1
       AND operation_scope = $2
       AND response_body ? 'assertions'`,
    [row.account_id, `submit_analysis:${row.capture_id}`],
  );
  await appendRetentionEvent(
    client,
    row,
    "source_purged",
    reason,
    occurredAt,
  );
  await appendAudit(
    client,
    { accountId: row.account_id, actorUserId },
    "capture.source_purged",
    "capture",
    row.capture_id,
    {
      effective_mode: row.effective_mode,
      reason,
      source_scope: row.source_scope,
    },
  );
  return true;
}

export async function completeSourceReview(
  client: PoolClient,
  auth: AuthContext,
  captureId: string,
  completedAt = new Date(),
): Promise<boolean> {
  const row = await retentionRow(client, auth.accountId, captureId, true);
  if (!row.review_completed_at) {
    await client.query(
      `UPDATE source_retention_receipts
       SET review_completed_at = $3, updated_at = $3
       WHERE account_id = $1 AND capture_id = $2`,
      [auth.accountId, captureId, completedAt],
    );
    row.review_completed_at = completedAt;
    await appendRetentionEvent(
      client,
      row,
      "review_completed",
      "analysis_proposal_committed",
      completedAt,
    );
    await appendAudit(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "capture.source_review_completed",
      "capture",
      captureId,
      { completion_event: "analysis_proposal_committed" },
    );
  }
  if (row.effective_mode === "ephemeral") {
    return purgeSourceContent(
      client,
      row,
      "review_completed",
      completedAt,
      auth.userId,
    );
  }
  return false;
}

export async function enforceSourceRetentionForCapture(
  client: PoolClient,
  accountId: string,
  captureId: string,
  now = new Date(),
): Promise<boolean> {
  const row = await retentionRow(client, accountId, captureId, true);
  if (
    row.source_access_state !== "available" ||
    !row.retention_until ||
    row.retention_until > now
  ) {
    return false;
  }
  return purgeSourceContent(
    client,
    row,
    "retention_deadline_elapsed",
    now,
    null,
  );
}

async function loadSourceRetentionReceipt(
  client: PoolClient,
  accountId: string,
  captureId: string,
): Promise<SourceRetentionReceipt> {
  const row = await retentionRow(client, accountId, captureId);
  const [events, deletion] = await Promise.all([
    client.query<{
      id: string;
      event_type: RetentionEvent;
      reason: RetentionEventReason;
      occurred_at: Date;
    }>(
      `SELECT id, event_type, reason, occurred_at
       FROM source_retention_events
       WHERE account_id = $1 AND receipt_id = $2
       ORDER BY
         occurred_at,
         CASE event_type
           WHEN 'source_submitted' THEN 1
           WHEN 'review_completed' THEN 2
           WHEN 'source_purged' THEN 3
           WHEN 'source_deleted' THEN 4
         END,
         id`,
      [accountId, row.receipt_id],
    ),
    client.query<{ id: string }>(
      `SELECT id
       FROM deletion_requests
       WHERE account_id = $1 AND capture_id = $2
       ORDER BY access_revoked_at DESC, id DESC
       LIMIT 1`,
      [accountId, captureId],
    ),
  ]);
  return {
    receipt_id: row.receipt_id,
    capture_id: row.capture_id,
    account_id: row.account_id,
    policy_version: row.policy_version,
    requested_policy: {
      mode: row.requested_mode,
      source_scope: row.source_scope,
      retention_until:
        row.requested_retention_until?.toISOString() ?? null,
    },
    effective_policy: {
      mode: row.effective_mode,
      source_scope: row.source_scope,
      retention_until: row.retention_until?.toISOString() ?? null,
      review_completion_event:
        row.effective_mode === "legacy_unknown"
          ? null
          : "analysis_proposal_committed",
    },
    source_access: {
      state: row.source_access_state,
      reason: row.source_access_reason,
    },
    lifecycle: {
      submitted_at: row.created_at.toISOString(),
      review_completed_at: row.review_completed_at?.toISOString() ?? null,
      retention_until: row.retention_until?.toISOString() ?? null,
      source_purged_at: row.source_purged_at?.toISOString() ?? null,
      deleted_at: row.deleted_at?.toISOString() ?? null,
    },
    deletion_id: deletion.rows[0]?.id ?? null,
    lineage: events.rows.map((event) => ({
      event_id: event.id,
      event_type: event.event_type,
      reason: event.reason,
      occurred_at: event.occurred_at.toISOString(),
    })),
  };
}

export async function getSourceRetentionReceipt(
  pool: Pool,
  auth: AuthContext,
  captureId: string,
  now = new Date(),
): Promise<SourceRetentionReceipt> {
  return inTransaction(pool, async (client) => {
    await enforceSourceRetentionForCapture(
      client,
      auth.accountId,
      captureId,
      now,
    );
    return loadSourceRetentionReceipt(client, auth.accountId, captureId);
  });
}

export async function getSourceRetentionReceiptByLocator(
  pool: Pool,
  auth: AuthContext,
  sourceLocator: string,
  now = new Date(),
): Promise<SourceRetentionReceipt> {
  return inTransaction(pool, async (client) => {
    const result = await client.query<{ capture_id: string }>(
      `SELECT capture_id
       FROM source_retention_receipts
       WHERE account_id = $1 AND source_locator = $2
       ORDER BY created_at DESC, receipt_id DESC
       LIMIT 1`,
      [auth.accountId, sourceLocator],
    );
    const captureId = result.rows[0]?.capture_id;
    if (!captureId) {
      throw new ApiError(
        404,
        "RETENTION_RECEIPT_NOT_FOUND",
        "The source-retention receipt was not found.",
      );
    }
    await enforceSourceRetentionForCapture(
      client,
      auth.accountId,
      captureId,
      now,
    );
    return loadSourceRetentionReceipt(client, auth.accountId, captureId);
  });
}

export async function sweepDueSourceRetention(
  pool: Pool,
  now = new Date(),
): Promise<number> {
  return inTransaction(pool, async (client) => {
    const due = await client.query<{ account_id: string; capture_id: string }>(
      `SELECT account_id, capture_id
       FROM source_retention_receipts
       WHERE source_access_state = 'available'
         AND retention_until IS NOT NULL
         AND retention_until <= $1
       ORDER BY retention_until, capture_id
       LIMIT 100
       FOR UPDATE SKIP LOCKED`,
      [now],
    );
    let purged = 0;
    for (const item of due.rows) {
      if (
        await enforceSourceRetentionForCapture(
          client,
          item.account_id,
          item.capture_id,
          now,
        )
      ) {
        purged += 1;
      }
    }
    return purged;
  });
}

export async function markSourceDeleted(
  client: PoolClient,
  auth: AuthContext,
  captureId: string,
  deletedAt = new Date(),
): Promise<void> {
  const row = await retentionRow(client, auth.accountId, captureId, true);
  await client.query(
    `UPDATE source_retention_receipts
     SET source_access_state = 'deleted',
         source_access_reason = 'manual_deletion',
         source_purged_at = COALESCE(source_purged_at, $3),
         deleted_at = $3,
         updated_at = $3
     WHERE account_id = $1 AND capture_id = $2`,
    [auth.accountId, captureId, deletedAt],
  );
  await appendRetentionEvent(
    client,
    row,
    "source_deleted",
    "manual_deletion",
    deletedAt,
  );
}
