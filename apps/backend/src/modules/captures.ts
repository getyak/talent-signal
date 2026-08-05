import { randomUUID } from "node:crypto";

import type {
  CaptureResponse,
  CaptureSourceInput,
  CreateCaptureRequest,
  DeletionLineageResponse,
  DeleteCaptureRequest,
  DeleteCaptureResponse,
  TemporalStateResponse,
} from "@talent-signal/contracts";
import { SOURCE_RETENTION_POLICY_VERSION } from "@talent-signal/contracts";
import type { Pool, PoolClient } from "pg";

import { ApiError } from "../lib/apiError.js";
import { appendAudit } from "../lib/audit.js";
import { sha256 } from "../lib/hash.js";
import {
  claimIdempotency,
  completeIdempotency,
} from "../lib/idempotency.js";
import { inTransaction } from "../database/pool.js";
import type { AuthContext } from "./auth.js";
import {
  createSourceRetentionRecord,
  enforceSourceRetentionForCapture,
  markSourceDeleted,
  resolveSourceRetentionPolicy,
  validateSourceRetentionPayload,
} from "./sourceRetention.js";

interface CaptureRow {
  id: string;
  account_id: string;
  fixture_case_id: string | null;
  status: "active" | "deleted";
  version: number;
  identity_status: "bound" | "ambiguous" | "unbound";
  subject_id: string | null;
  assignment_id: string | null;
  source_metadata: Omit<CaptureSourceInput, "retention">;
  requested_mode: CaptureResponse["source"]["retention"]["requested_mode"];
  effective_mode: CaptureResponse["source"]["retention"]["effective_mode"];
  source_scope: CaptureResponse["source"]["retention"]["source_scope"];
  source_access_state: CaptureResponse["source"]["retention"]["source_access_state"];
  source_access_reason: CaptureResponse["source"]["retention"]["source_access_reason"];
  requested_retention_until: Date | null;
  retention_until: Date | null;
  review_completed_at: Date | null;
  source_purged_at: Date | null;
  created_at: Date;
}

interface EvidenceRow {
  id: string;
  source_message_id: string;
  sequence: number;
  speaker: string;
  redacted_text: string | null;
  content_hash: string;
  status: "active" | "purged" | "deleted";
}

export interface MutationResult<T> {
  body: T;
  replayed: boolean;
  status: number;
}

async function resolveBoundIdentity(
  client: PoolClient,
  accountId: string,
  identity: Extract<CreateCaptureRequest["identity"], { status: "bound" }>,
): Promise<{ subjectId: string; assignmentId: string }> {
  const subjectResult = await client.query<{ id: string }>(
    `INSERT INTO subjects(
       id, account_id, external_ref, display_label, status, deleted_at
     )
     VALUES ($1, $2, $3, $4, 'active', NULL)
     ON CONFLICT (account_id, external_ref) DO UPDATE SET
       display_label = EXCLUDED.display_label
     RETURNING id`,
    [randomUUID(), accountId, identity.external_ref, identity.display_label],
  );
  const subjectId = subjectResult.rows[0]?.id;
  if (!subjectId) {
    throw new ApiError(
      409,
      "IDENTITY_BINDING_CONFLICT",
      "The subject identity could not be bound.",
    );
  }

  const assignmentResult = await client.query<{ id: string }>(
    `INSERT INTO assignments(
       id, account_id, subject_id, external_ref, display_label, status, deleted_at
     )
     VALUES ($1, $2, $3, $4, $5, 'active', NULL)
     ON CONFLICT (account_id, external_ref) DO UPDATE SET
       display_label = EXCLUDED.display_label
     WHERE assignments.subject_id = EXCLUDED.subject_id
     RETURNING id`,
    [
      randomUUID(),
      accountId,
      subjectId,
      identity.assignment_ref,
      identity.assignment_label,
    ],
  );
  const assignmentId = assignmentResult.rows[0]?.id;
  if (!assignmentId) {
    throw new ApiError(
      409,
      "ASSIGNMENT_BINDING_CONFLICT",
      "The assignment reference is already bound to another subject.",
    );
  }
  return { subjectId, assignmentId };
}

async function loadCapture(
  client: Pool | PoolClient,
  accountId: string,
  captureId: string,
): Promise<CaptureResponse> {
  const captureResult = await client.query<CaptureRow>(
    `SELECT
       captures.id, captures.account_id, captures.fixture_case_id,
       captures.status, captures.version, captures.identity_status,
       captures.subject_id, captures.assignment_id, captures.source_metadata,
       receipts.requested_mode, receipts.effective_mode,
       receipts.source_scope, receipts.source_access_state,
       receipts.source_access_reason, receipts.requested_retention_until,
       receipts.retention_until, receipts.review_completed_at,
       receipts.source_purged_at, captures.created_at
     FROM captures
     JOIN source_retention_receipts receipts
       ON receipts.account_id = captures.account_id
      AND receipts.capture_id = captures.id
     WHERE captures.account_id = $1 AND captures.id = $2`,
    [accountId, captureId],
  );
  const capture = captureResult.rows[0];
  if (!capture) {
    throw new ApiError(404, "CAPTURE_NOT_FOUND", "The capture was not found.");
  }
  if (capture.status === "deleted") {
    throw new ApiError(
      410,
      "CAPTURE_DELETED",
      "The capture and governed derivatives have been deleted.",
    );
  }
  const messagesResult = await client.query<EvidenceRow>(
    `SELECT
       id, source_message_id, sequence, speaker, redacted_text, content_hash,
       status
     FROM evidence_items
     WHERE account_id = $1 AND capture_id = $2
     ORDER BY sequence, id`,
    [accountId, captureId],
  );

  return {
    id: capture.id,
    account_id: capture.account_id,
    fixture_case_id: capture.fixture_case_id,
    status: capture.status,
    version: capture.version,
    identity_status: capture.identity_status,
    subject_id: capture.subject_id,
    assignment_id: capture.assignment_id,
    source: {
      ...capture.source_metadata,
      retention: {
        policy_version: SOURCE_RETENTION_POLICY_VERSION,
        requested_mode: capture.requested_mode,
        effective_mode: capture.effective_mode,
        source_scope: capture.source_scope,
        source_access_state: capture.source_access_state,
        source_access_reason: capture.source_access_reason,
        requested_retention_until:
          capture.requested_retention_until?.toISOString() ?? null,
        retention_until: capture.retention_until?.toISOString() ?? null,
        review_completed_at:
          capture.review_completed_at?.toISOString() ?? null,
        source_purged_at: capture.source_purged_at?.toISOString() ?? null,
      },
    },
    messages: messagesResult.rows.map((message) => ({
      id: message.id,
      source_message_id: message.source_message_id,
      sequence: message.sequence,
      speaker: message.speaker,
      text: message.redacted_text,
      content_hash: message.content_hash,
      status: message.status,
    })),
    created_at: capture.created_at.toISOString(),
  };
}

export async function createCapture(
  pool: Pool,
  auth: AuthContext,
  request: CreateCaptureRequest,
): Promise<MutationResult<CaptureResponse>> {
  validateSourceRetentionPayload(request);
  return inTransaction(pool, async (client) => {
    const idempotency = await claimIdempotency(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "create_capture",
      request.idempotency_key,
      request,
    );
    if (idempotency.replay) {
      const replayCaptureId =
        typeof idempotency.replay.body === "object" &&
        idempotency.replay.body !== null &&
        "capture_id" in idempotency.replay.body
          ? String(idempotency.replay.body.capture_id)
          : typeof idempotency.replay.body === "object" &&
              idempotency.replay.body !== null &&
              "id" in idempotency.replay.body
            ? String(idempotency.replay.body.id)
            : null;
      if (!replayCaptureId) {
        throw new ApiError(
          409,
          "IDEMPOTENCY_STATE_UNAVAILABLE",
          "The prior capture response could not be resolved.",
        );
      }
      await enforceSourceRetentionForCapture(
        client,
        auth.accountId,
        replayCaptureId,
      );
      return {
        body: await loadCapture(client, auth.accountId, replayCaptureId),
        replayed: true,
        status: idempotency.replay.status,
      };
    }

    const identity =
      request.identity.status === "bound"
        ? await resolveBoundIdentity(client, auth.accountId, request.identity)
        : { subjectId: null, assignmentId: null };
    const captureId = randomUUID();
    const submittedAt = new Date();
    const retentionPolicy = resolveSourceRetentionPolicy(
      request.source.retention,
      submittedAt,
      request.source.kind,
    );
    const sourceMetadata: Omit<CaptureSourceInput, "retention"> = {
      kind: request.source.kind,
      captured_at: request.source.captured_at,
      source_timezone: request.source.source_timezone,
      purpose: request.source.purpose,
      ...(request.source.source_locator
        ? { source_locator: request.source.source_locator }
        : {}),
    };

    await client.query(
      `INSERT INTO captures(
         id, account_id, created_by_user_id, subject_id, assignment_id,
         fixture_case_id, source_kind, source_metadata, identity_status,
         identity_context, purpose, retention_until, created_at, updated_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13
       )`,
      [
        captureId,
        auth.accountId,
        auth.userId,
        identity.subjectId,
        identity.assignmentId,
        request.fixture_case_id ?? null,
        request.source.kind,
        sourceMetadata,
        request.identity.status,
        request.identity,
        request.source.purpose,
        retentionPolicy.retentionUntil,
        submittedAt,
      ],
    );
    await createSourceRetentionRecord(client, {
      accountId: auth.accountId,
      captureId,
      sourceLocator: request.source.source_locator ?? null,
      policy: retentionPolicy,
      submittedAt,
    });

    for (const message of request.messages) {
      await client.query(
        `INSERT INTO evidence_items(
           id, account_id, capture_id, source_message_id, sequence, speaker,
           redacted_text, content_hash
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          randomUUID(),
          auth.accountId,
          captureId,
          message.source_message_id,
          message.sequence,
          message.speaker,
          message.text,
          sha256(message.text),
        ],
      );
    }

    await appendAudit(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "capture.submitted",
      "capture",
      captureId,
      {
        fixture_case_id: request.fixture_case_id ?? null,
        identity_status: request.identity.status,
        message_count: request.messages.length,
        source_kind: request.source.kind,
        requested_retention_mode: retentionPolicy.requestedMode,
        source_scope: retentionPolicy.sourceScope,
      },
    );
    const body = await loadCapture(client, auth.accountId, captureId);
    await completeIdempotency(client, idempotency, 201, {
      capture_id: captureId,
    });
    return { body, replayed: false, status: 201 };
  });
}

export async function getCapture(
  pool: Pool,
  auth: AuthContext,
  captureId: string,
): Promise<CaptureResponse> {
  return inTransaction(pool, async (client) => {
    const ownedCapture = await client.query<{ id: string }>(
      `SELECT id
       FROM captures
       WHERE account_id = $1 AND id = $2`,
      [auth.accountId, captureId],
    );
    if (!ownedCapture.rows[0]) {
      throw new ApiError(
        404,
        "CAPTURE_NOT_FOUND",
        "The capture was not found.",
      );
    }
    await enforceSourceRetentionForCapture(
      client,
      auth.accountId,
      captureId,
    );
    return loadCapture(client, auth.accountId, captureId);
  });
}

export async function getTemporalState(
  pool: Pool,
  auth: AuthContext,
  assignmentId: string,
): Promise<TemporalStateResponse> {
  const assignment = await pool.query<{ id: string }>(
    `SELECT id
     FROM assignments
     WHERE account_id = $1 AND id = $2 AND status = 'active'`,
    [auth.accountId, assignmentId],
  );
  if (!assignment.rows[0]) {
    throw new ApiError(
      404,
      "ASSIGNMENT_NOT_FOUND",
      "The assignment was not found.",
    );
  }
  const result = await pool.query<{
    id: string;
    subject_id: string;
    assignment_id: string;
    field: string;
    value_text: string | null;
    status:
      | "active"
      | "superseded"
      | "contested"
      | "expired"
      | "deleted";
    source_assertion_id: string;
    confirmed_by_decision_id: string;
    supersedes_state_id: string | null;
    valid_from: Date;
    valid_until: Date | null;
  }>(
    `SELECT
       id, subject_id, assignment_id, field, value_text, status,
       source_assertion_id, confirmed_by_decision_id, supersedes_state_id,
       valid_from, valid_until
     FROM confirmed_states
     WHERE account_id = $1
       AND assignment_id = $2
       AND status <> 'deleted'
     ORDER BY field, valid_from`,
    [auth.accountId, assignmentId],
  );
  return {
    assignment_id: assignmentId,
    states: result.rows.map((state) => ({
      id: state.id,
      subject_id: state.subject_id,
      assignment_id: state.assignment_id,
      field: state.field,
      value: state.value_text,
      status: state.status,
      source_assertion_id: state.source_assertion_id,
      confirmed_by_decision_id: state.confirmed_by_decision_id,
      supersedes_state_id: state.supersedes_state_id,
      valid_from: state.valid_from.toISOString(),
      valid_until: state.valid_until?.toISOString() ?? null,
    })),
  };
}

export async function getDeletionLineage(
  pool: Pool,
  auth: AuthContext,
  deletionId: string,
): Promise<DeletionLineageResponse> {
  const requestResult = await pool.query<{
    capture_id: string;
    access_revoked_at: Date;
    completed_at: Date | null;
  }>(
    `SELECT capture_id, access_revoked_at, completed_at
     FROM deletion_requests
     WHERE account_id = $1 AND id = $2`,
    [auth.accountId, deletionId],
  );
  const deletion = requestResult.rows[0];
  if (!deletion) {
    throw new ApiError(
      404,
      "DELETION_NOT_FOUND",
      "The deletion record was not found.",
    );
  }
  const lineageResult = await pool.query<{
    entity_type: string;
    entity_id: string;
    disposition:
      | "content_removed"
      | "access_revoked"
      | "audit_reference_retained";
    deleted_at: Date;
  }>(
    `SELECT entity_type, entity_id, disposition, deleted_at
     FROM deletion_lineage
     WHERE account_id = $1 AND deletion_id = $2
     ORDER BY entity_type, entity_id`,
    [auth.accountId, deletionId],
  );
  return {
    deletion_id: deletionId,
    capture_id: deletion.capture_id,
    access_revoked_at: deletion.access_revoked_at.toISOString(),
    completed_at: deletion.completed_at?.toISOString() ?? null,
    lineage: lineageResult.rows.map((entry) => ({
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      disposition: entry.disposition,
      deleted_at: entry.deleted_at.toISOString(),
    })),
  };
}

export async function deleteCapture(
  pool: Pool,
  auth: AuthContext,
  captureId: string,
  request: DeleteCaptureRequest,
): Promise<MutationResult<DeleteCaptureResponse>> {
  return inTransaction(pool, async (client) => {
    const idempotency = await claimIdempotency(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      `delete_capture:${captureId}`,
      request.idempotency_key,
      request,
    );
    if (idempotency.replay) {
      return {
        body: idempotency.replay.body as DeleteCaptureResponse,
        replayed: true,
        status: idempotency.replay.status,
      };
    }

    const capture = await client.query<{
      status: string;
      subject_id: string | null;
      assignment_id: string | null;
    }>(
      `SELECT status, subject_id, assignment_id
       FROM captures
       WHERE account_id = $1 AND id = $2
       FOR UPDATE`,
      [auth.accountId, captureId],
    );
    if (!capture.rows[0]) {
      throw new ApiError(
        404,
        "CAPTURE_NOT_FOUND",
        "The capture was not found.",
      );
    }
    if (capture.rows[0].status === "deleted") {
      throw new ApiError(
        410,
        "CAPTURE_DELETED",
        "The capture has already been deleted.",
      );
    }

    const deletionId = randomUUID();
    await client.query(
      `INSERT INTO deletion_requests(
         id, account_id, capture_id, requested_by_user_id, reason
       )
       VALUES ($1, $2, $3, $4, $5)`,
      [deletionId, auth.accountId, captureId, auth.userId, request.reason],
    );

    const entities = await client.query<{
      entity_type: string;
      entity_id: string;
    }>(
      `SELECT 'evidence' AS entity_type, id AS entity_id
         FROM evidence_items
         WHERE account_id = $1 AND capture_id = $2
       UNION ALL
       SELECT 'analysis_proposal', id
         FROM analysis_proposals
         WHERE account_id = $1 AND capture_id = $2
       UNION ALL
       SELECT 'assertion_proposal', id
         FROM proposed_assertions
         WHERE account_id = $1 AND capture_id = $2
       UNION ALL
       SELECT 'fact_decision', decisions.id
         FROM fact_decisions decisions
         JOIN proposed_assertions assertions
           ON assertions.account_id = decisions.account_id
          AND assertions.id = decisions.assertion_id
         WHERE assertions.account_id = $1 AND assertions.capture_id = $2
       UNION ALL
       SELECT 'confirmed_state', states.id
         FROM confirmed_states states
         JOIN proposed_assertions assertions
           ON assertions.account_id = states.account_id
          AND assertions.id = states.source_assertion_id
         WHERE assertions.account_id = $1 AND assertions.capture_id = $2
       UNION ALL
       SELECT 'action_proposal', id
         FROM action_proposals
         WHERE account_id = $1 AND capture_id = $2
       UNION ALL
       SELECT 'action_approval', approvals.id
         FROM action_approvals approvals
         JOIN action_proposals actions
           ON actions.account_id = approvals.account_id
          AND actions.id = approvals.action_id
         WHERE actions.account_id = $1 AND actions.capture_id = $2
       UNION ALL
       SELECT 'effect_attempt', attempts.id
         FROM effect_attempts attempts
         JOIN action_proposals actions
           ON actions.account_id = attempts.account_id
          AND actions.id = attempts.action_id
         WHERE actions.account_id = $1 AND actions.capture_id = $2
       UNION ALL
       SELECT 'outcome', outcomes.id
         FROM outcomes
         JOIN effect_attempts attempts
           ON attempts.account_id = outcomes.account_id
          AND attempts.id = outcomes.attempt_id
         JOIN action_proposals actions
           ON actions.account_id = attempts.account_id
          AND actions.id = attempts.action_id
         WHERE actions.account_id = $1 AND actions.capture_id = $2
       UNION ALL
       SELECT 'effect_observation', observations.id
         FROM effect_observations observations
         JOIN effect_attempts attempts
           ON attempts.account_id = observations.account_id
          AND attempts.id = observations.attempt_id
         JOIN action_proposals actions
           ON actions.account_id = attempts.account_id
          AND actions.id = attempts.action_id
         WHERE actions.account_id = $1 AND actions.capture_id = $2
       UNION ALL
       SELECT DISTINCT 'simulated_destination', destinations.id
         FROM simulated_destinations destinations
         JOIN action_proposals actions
           ON actions.account_id = destinations.account_id
          AND actions.exact_preview->'target'->>'destination_key'
              = destinations.destination_key
         WHERE actions.account_id = $1 AND actions.capture_id = $2`,
      [auth.accountId, captureId],
    );

    const destinationKeys = await client.query<{ destination_key: string }>(
      `SELECT DISTINCT exact_preview->'target'->>'destination_key' AS destination_key
       FROM action_proposals
       WHERE account_id = $1
         AND capture_id = $2
         AND exact_preview->'target'->>'destination_key' IS NOT NULL`,
      [auth.accountId, captureId],
    );

    await client.query(
      `UPDATE action_approvals approvals
       SET status = 'revoked',
           revoked_at = now(),
           revocation_reason = 'source_deleted'
       FROM action_proposals actions
       WHERE actions.account_id = $1
         AND actions.capture_id = $2
         AND approvals.account_id = actions.account_id
         AND approvals.action_id = actions.id
         AND approvals.status = 'active'`,
      [auth.accountId, captureId],
    );
    await client.query(
      `UPDATE outcomes
       SET summary = '[source deleted]'
       WHERE account_id = $1
         AND attempt_id IN (
           SELECT attempts.id
           FROM effect_attempts attempts
           JOIN action_proposals actions
             ON actions.account_id = attempts.account_id
            AND actions.id = attempts.action_id
           WHERE actions.account_id = $1 AND actions.capture_id = $2
         )`,
      [auth.accountId, captureId],
    );
    await client.query(
      `UPDATE effect_observations
       SET observed_state = NULL,
           destination_key = '[deleted]'
       WHERE account_id = $1
         AND attempt_id IN (
           SELECT attempts.id
           FROM effect_attempts attempts
           JOIN action_proposals actions
             ON actions.account_id = attempts.account_id
            AND actions.id = attempts.action_id
           WHERE actions.account_id = $1 AND actions.capture_id = $2
         )`,
      [auth.accountId, captureId],
    );
    for (const { destination_key: destinationKey } of destinationKeys.rows) {
      await client.query(
        `DELETE FROM simulated_destinations
         WHERE account_id = $1 AND destination_key = $2`,
        [auth.accountId, destinationKey],
      );
    }
    await client.query(
      `UPDATE action_proposals
       SET status = 'deleted',
           target_text = NULL,
           reason_text = NULL,
           due_text = NULL,
           exact_preview = '{"deleted":true}'::jsonb,
           exact_preview_digest = 'deleted',
           deleted_at = now(),
           updated_at = now()
       WHERE account_id = $1 AND capture_id = $2`,
      [auth.accountId, captureId],
    );
    await client.query(
      `UPDATE confirmed_states states
       SET status = 'deleted', value_text = NULL, deleted_at = now()
       FROM proposed_assertions assertions
       WHERE assertions.account_id = $1
         AND assertions.capture_id = $2
         AND states.account_id = assertions.account_id
         AND states.source_assertion_id = assertions.id`,
      [auth.accountId, captureId],
    );
    await client.query(
      `UPDATE fact_decisions decisions
       SET proposed_value_at_decision = NULL, corrected_value = NULL
       FROM proposed_assertions assertions
       WHERE assertions.account_id = $1
         AND assertions.capture_id = $2
         AND decisions.account_id = assertions.account_id
         AND decisions.assertion_id = assertions.id`,
      [auth.accountId, captureId],
    );
    await client.query(
      `UPDATE proposed_assertions
       SET review_status = 'deleted',
           proposed_value = NULL,
           evidence_quote = NULL,
           deleted_at = now()
       WHERE account_id = $1 AND capture_id = $2`,
      [auth.accountId, captureId],
    );
    await client.query(
      `UPDATE analysis_proposals
       SET status = 'deleted', deleted_at = now()
       WHERE account_id = $1 AND capture_id = $2`,
      [auth.accountId, captureId],
    );
    await client.query(
      `UPDATE evidence_items
       SET status = 'deleted',
           redacted_text = NULL,
           content_hash = 'deleted',
           deleted_at = now()
       WHERE account_id = $1 AND capture_id = $2`,
      [auth.accountId, captureId],
    );
    await client.query(
      `UPDATE captures
       SET status = 'deleted',
           fixture_case_id = NULL,
           source_metadata = '{"deleted":true}'::jsonb,
           identity_context = '{"deleted":true}'::jsonb,
           purpose = '[deleted]',
           version = version + 1,
           deleted_at = now(),
           updated_at = now()
       WHERE account_id = $1 AND id = $2`,
      [auth.accountId, captureId],
    );
    const sourceDeletedAt = new Date();
    await markSourceDeleted(client, auth, captureId, sourceDeletedAt);
    const captureIdentity = capture.rows[0];
    if (captureIdentity.assignment_id) {
      const assignmentStillUsed = await client.query<{ used: boolean }>(
        `SELECT EXISTS(
           SELECT 1
           FROM captures
           WHERE account_id = $1
             AND assignment_id = $2
             AND status = 'active'
         ) AS used`,
        [auth.accountId, captureIdentity.assignment_id],
      );
      if (!assignmentStillUsed.rows[0]?.used) {
        await client.query(
          `UPDATE assignments
           SET status = 'deleted',
               external_ref = 'deleted:' || id::text,
               display_label = '[deleted]',
               deleted_at = now()
           WHERE account_id = $1 AND id = $2`,
          [auth.accountId, captureIdentity.assignment_id],
        );
        entities.rows.push({
          entity_type: "assignment",
          entity_id: captureIdentity.assignment_id,
        });
      }
    }
    if (captureIdentity.subject_id) {
      const subjectStillUsed = await client.query<{ used: boolean }>(
        `SELECT EXISTS(
           SELECT 1
           FROM captures
           WHERE account_id = $1
             AND subject_id = $2
             AND status = 'active'
         ) AS used`,
        [auth.accountId, captureIdentity.subject_id],
      );
      if (!subjectStillUsed.rows[0]?.used) {
        await client.query(
          `UPDATE subjects
           SET status = 'deleted',
               external_ref = 'deleted:' || id::text,
               display_label = '[deleted]',
               deleted_at = now()
           WHERE account_id = $1 AND id = $2`,
          [auth.accountId, captureIdentity.subject_id],
        );
        entities.rows.push({
          entity_type: "subject",
          entity_id: captureIdentity.subject_id,
        });
      }
    }

    for (const entity of entities.rows) {
      await client.query(
        `INSERT INTO deletion_lineage(
           id, account_id, deletion_id, entity_type, entity_id, disposition
         )
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          randomUUID(),
          auth.accountId,
          deletionId,
          entity.entity_type,
          entity.entity_id,
          entity.entity_type === "effect_attempt"
            ? "audit_reference_retained"
            : "content_removed",
        ],
      );
    }
    await client.query(
      `INSERT INTO deletion_lineage(
         id, account_id, deletion_id, entity_type, entity_id, disposition
       )
       VALUES ($1, $2, $3, 'capture', $4, 'access_revoked')`,
      [randomUUID(), auth.accountId, deletionId, captureId],
    );
    await client.query(
      `UPDATE deletion_requests SET completed_at = now()
       WHERE account_id = $1 AND id = $2`,
      [auth.accountId, deletionId],
    );
    await appendAudit(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "capture.deleted",
      "capture",
      captureId,
      {
        deletion_id: deletionId,
        derivatives_deleted: entities.rows.length,
      },
    );
    const now = sourceDeletedAt.toISOString();
    const body: DeleteCaptureResponse = {
      deletion_id: deletionId,
      capture_id: captureId,
      status: "deleted",
      derivatives_deleted: entities.rows.length,
      access_revoked_at: now,
    };
    await completeIdempotency(client, idempotency, 200, body);
    return { body, replayed: false, status: 200 };
  });
}
