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
  source_kind: string;
  purpose: string;
  source_metadata: Partial<Omit<CaptureSourceInput, "retention">> & {
    observed_at?: string;
  };
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
  identity:
    | Extract<CreateCaptureRequest["identity"], { status: "bound" }>
    | Extract<
        CreateCaptureRequest["identity"],
        { status: "bound_existing" }
      >,
): Promise<{ subjectId: string; assignmentId: string }> {
  const subjectResult =
    identity.status === "bound_existing"
      ? await client.query<{ id: string }>(
          `SELECT id
           FROM subjects
           WHERE account_id = $1
             AND id = $2
             AND status = 'active'`,
          [accountId, identity.subject_id],
        )
      : await client.query<{ id: string }>(
          `INSERT INTO subjects(
             id, account_id, external_ref, display_label, status, deleted_at
           )
           VALUES ($1, $2, $3, $4, 'active', NULL)
           ON CONFLICT (account_id, external_ref) DO UPDATE SET
             display_label = EXCLUDED.display_label
           RETURNING id`,
          [
            randomUUID(),
            accountId,
            identity.external_ref,
            identity.display_label,
          ],
        );
  const subjectId = subjectResult.rows[0]?.id;
  if (!subjectId) {
    throw new ApiError(
      identity.status === "bound_existing" ? 404 : 409,
      identity.status === "bound_existing"
        ? "PERSON_NOT_FOUND"
        : "IDENTITY_BINDING_CONFLICT",
      identity.status === "bound_existing"
        ? "The selected person is unavailable in this account."
        : "The subject identity could not be bound.",
    );
  }

  if (
    identity.status === "bound_existing" &&
    identity.assignment_id
  ) {
    const existingAssignment = await client.query<{ id: string }>(
      `SELECT id
       FROM assignments
       WHERE account_id = $1
         AND id = $2
         AND subject_id = $3
         AND status = 'active'`,
      [accountId, identity.assignment_id, subjectId],
    );
    const assignmentId = existingAssignment.rows[0]?.id;
    if (!assignmentId) {
      throw new ApiError(
        404,
        "RELATIONSHIP_CONTEXT_NOT_FOUND",
        "The selected relationship context is unavailable for this person.",
      );
    }
    return { subjectId, assignmentId };
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
       captures.subject_id, captures.assignment_id, captures.source_kind,
       captures.purpose, captures.source_metadata,
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
      kind:
        capture.source_metadata.kind ??
        (capture.source_kind.includes("screenshot") ||
        capture.source_kind.includes("image")
          ? "screenshot_metadata"
          : "transcript"),
      ...(capture.source_metadata.channel
        ? { channel: capture.source_metadata.channel }
        : {}),
      captured_at:
        capture.source_metadata.captured_at ??
        capture.source_metadata.observed_at ??
        capture.created_at.toISOString(),
      source_timezone: capture.source_metadata.source_timezone ?? null,
      purpose: capture.source_metadata.purpose ?? capture.purpose,
      ...(capture.source_metadata.source_locator
        ? { source_locator: capture.source_metadata.source_locator }
        : {}),
      ...(capture.source_metadata.authorization_expires_at
        ? {
            authorization_expires_at:
              capture.source_metadata.authorization_expires_at,
          }
        : {}),
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

    let identity: {
      subjectId: string | null;
      assignmentId: string | null;
    };
    let identityStatus: "bound" | "ambiguous" | "unbound";
    if (
      request.identity.status === "bound" ||
      request.identity.status === "bound_existing"
    ) {
      identity = await resolveBoundIdentity(
        client,
        auth.accountId,
        request.identity,
      );
      identityStatus = "bound";
    } else {
      identity = { subjectId: null, assignmentId: null };
      identityStatus = request.identity.status;
    }
    const captureId = randomUUID();
    const submittedAt = new Date();
    const retentionPolicy = resolveSourceRetentionPolicy(
      request.source.retention,
      submittedAt,
      request.source.kind,
    );
    const sourceMetadata: Omit<CaptureSourceInput, "retention"> = {
      kind: request.source.kind,
      ...(request.source.channel
        ? { channel: request.source.channel }
        : {}),
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
        identityStatus,
        request.identity,
        request.source.purpose,
        retentionPolicy.retentionUntil,
        submittedAt,
      ],
    );
    if (identity.subjectId) {
      const touchedPerson = await client.query(
        `UPDATE subjects
         SET version = version + 1
         WHERE account_id = $1
           AND id = $2
           AND status = 'active'
         RETURNING id`,
        [auth.accountId, identity.subjectId],
      );
      if (touchedPerson.rowCount !== 1) {
        throw new ApiError(
          409,
          "PERSON_IDENTITY_CHANGED_DURING_CAPTURE",
          "The selected person changed while this capture was being attached.",
        );
      }
    }
    await createSourceRetentionRecord(client, {
      accountId: auth.accountId,
      captureId,
      sourceLocator: request.source.source_locator ?? null,
      policy: retentionPolicy,
      submittedAt,
      authorizationExpiresAt:
        request.source.authorization_expires_at ?? null,
    });

    const resourceId = randomUUID();
    const resourceKind =
      request.source.kind === "screenshot_metadata"
        ? "conversation_screenshot"
        : "conversation_transcript";
    const inputChannel =
      request.source.channel ??
      (request.source.kind === "screenshot_metadata"
        ? "web_upload"
        : "api_connector");
    await client.query(
      `INSERT INTO source_resources(
         id, account_id, capture_id, created_by_user_id, client_resource_id,
         resource_kind, input_channel, display_name, media_type, content_hash,
         source_locator, observed_at, source_timezone, retention_scope,
         retention_until, processing_state, sensitivity
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, 'text/plain', $9, $10, $11,
         $12, $13, $14, 'needs_fact_review', 'restricted'
       )`,
      [
        resourceId,
        auth.accountId,
        captureId,
        auth.userId,
        `capture:${captureId}:primary`,
        resourceKind,
        inputChannel,
        request.source.kind === "screenshot_metadata"
          ? "Reviewed conversation screenshot"
          : "Reviewed conversation transcript",
        sha256(
          JSON.stringify(
            request.messages.map((message) => ({
              sequence: message.sequence,
              speaker: message.speaker,
              text: message.text,
            })),
          ),
        ),
        request.source.source_locator ?? null,
        request.source.captured_at,
        request.source.source_timezone,
        retentionPolicy.sourceScope,
        retentionPolicy.retentionUntil,
      ],
    );

    for (const message of request.messages) {
      const contentHash = sha256(message.text);
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
          contentHash,
        ],
      );
      await client.query(
        `INSERT INTO evidence_fragments(
           id, account_id, capture_id, resource_id, fragment_kind, sequence,
           text_content, content_hash, locator, attributed_actor,
           attribution_status, parser_name, parser_version
         )
         VALUES (
           $1, $2, $3, $4, 'message', $5, $6, $7, $8, $9, $10,
           'reviewed-message-adapter', '1.0.0'
         )`,
        [
          randomUUID(),
          auth.accountId,
          captureId,
          resourceId,
          message.sequence,
          message.text,
          contentHash,
          {
            kind: "message",
            source_message_id: message.source_message_id,
            sequence: message.sequence,
            speaker_side: "unknown",
          },
          message.speaker === "hiring_manager"
            ? "client"
            : message.speaker,
          message.speaker === "unknown" ? "unknown" : "confirmed",
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
        identity_status: identityStatus,
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

    const governedCaptureIdsResult = await client.query<{ id: string }>(
      `WITH RECURSIVE resource_tree AS (
         SELECT resources.id, resources.capture_id
         FROM source_resources resources
         WHERE resources.account_id = $1
           AND resources.capture_id = $2
           AND resources.processing_state <> 'deleted'
         UNION ALL
         SELECT children.id, children.capture_id
         FROM source_resources children
         JOIN resource_tree parents
           ON children.account_id = $1
          AND children.discovered_from_resource_id = parents.id
         WHERE children.processing_state <> 'deleted'
       )
       SELECT $2::uuid AS id
       UNION
       SELECT capture_id AS id FROM resource_tree`,
      [auth.accountId, captureId],
    );
    const governedCaptureIds = governedCaptureIdsResult.rows.map(
      (row) => row.id,
    );
    const governedCaptures = await client.query<{
      id: string;
      subject_id: string | null;
      assignment_id: string | null;
    }>(
      `SELECT id, subject_id, assignment_id
       FROM captures
       WHERE account_id = $1
         AND id = ANY($2::uuid[])
         AND status = 'active'
       FOR UPDATE`,
      [auth.accountId, governedCaptureIds],
    );

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
         WHERE account_id = $1 AND capture_id = ANY($2::uuid[])
       UNION ALL
       SELECT 'source_resource', id
         FROM source_resources
         WHERE account_id = $1 AND capture_id = ANY($2::uuid[])
       UNION ALL
       SELECT 'evidence_fragment', id
         FROM evidence_fragments
         WHERE account_id = $1 AND capture_id = ANY($2::uuid[])
       UNION ALL
       SELECT 'evidence_fragment_review', reviews.id
         FROM evidence_fragment_reviews reviews
         JOIN evidence_fragments fragments
           ON fragments.account_id = reviews.account_id
          AND fragments.id = reviews.fragment_id
         WHERE fragments.account_id = $1
           AND fragments.capture_id = ANY($2::uuid[])
       UNION ALL
       SELECT 'identity_handle', handles.id
         FROM identity_handles handles
         WHERE handles.account_id = $1
           AND handles.source_resource_id IN (
             SELECT id
             FROM source_resources
             WHERE account_id = $1
               AND capture_id = ANY($2::uuid[])
           )
       UNION ALL
       SELECT 'identity_resolution_case', cases.id
         FROM identity_resolution_cases cases
         WHERE cases.account_id = $1
           AND cases.capture_id = ANY($2::uuid[])
       UNION ALL
       SELECT 'identity_resolution_candidate', candidates.id
         FROM identity_resolution_candidates candidates
         JOIN identity_resolution_cases cases
           ON cases.account_id = candidates.account_id
          AND cases.id = candidates.case_id
         WHERE cases.account_id = $1
           AND cases.capture_id = ANY($2::uuid[])
       UNION ALL
       SELECT 'identity_resolution_decision', decisions.id
         FROM identity_resolution_decisions decisions
         JOIN identity_resolution_cases cases
           ON cases.account_id = decisions.account_id
          AND cases.id = decisions.case_id
         WHERE cases.account_id = $1
           AND cases.capture_id = ANY($2::uuid[])
       UNION ALL
       SELECT 'research_snapshot', snapshots.id
         FROM research_snapshots snapshots
         JOIN source_resources resources
           ON resources.account_id = snapshots.account_id
          AND resources.id = snapshots.resource_id
         WHERE resources.account_id = $1
           AND resources.capture_id = ANY($2::uuid[])
       UNION ALL
       SELECT 'research_task', tasks.id
         FROM research_tasks tasks
         JOIN source_resources seeds
           ON seeds.account_id = tasks.account_id
          AND seeds.id = tasks.seed_resource_id
         WHERE seeds.account_id = $1
           AND seeds.capture_id = ANY($2::uuid[])
       UNION ALL
       SELECT 'analysis_proposal', id
         FROM analysis_proposals
         WHERE account_id = $1 AND capture_id = ANY($2::uuid[])
       UNION ALL
       SELECT DISTINCT 'pursuit_proposal', proposals.id
         FROM pursuit_proposals proposals
         LEFT JOIN pursuit_proposal_items items
           ON items.account_id = proposals.account_id
          AND items.proposal_id = proposals.id
         LEFT JOIN pursuit_proposal_item_evidence proposal_evidence
           ON proposal_evidence.account_id = items.account_id
          AND proposal_evidence.proposal_item_id = items.id
         LEFT JOIN evidence_fragments proposal_fragments
           ON proposal_fragments.account_id = proposal_evidence.account_id
          AND proposal_fragments.id = proposal_evidence.evidence_fragment_id
         WHERE proposals.account_id = $1
           AND (
             proposals.capture_id = ANY($2::uuid[])
             OR proposal_fragments.capture_id = ANY($2::uuid[])
           )
       UNION ALL
       SELECT DISTINCT 'pursuit_proposal_item', items.id
         FROM pursuit_proposal_items items
         JOIN pursuit_proposals proposals
           ON proposals.account_id = items.account_id
          AND proposals.id = items.proposal_id
         LEFT JOIN pursuit_proposal_item_evidence proposal_evidence
           ON proposal_evidence.account_id = items.account_id
          AND proposal_evidence.proposal_item_id = items.id
         LEFT JOIN evidence_fragments proposal_fragments
           ON proposal_fragments.account_id = proposal_evidence.account_id
          AND proposal_fragments.id = proposal_evidence.evidence_fragment_id
         WHERE proposals.account_id = $1
           AND (
             proposals.capture_id = ANY($2::uuid[])
             OR proposal_fragments.capture_id = ANY($2::uuid[])
           )
       UNION ALL
       SELECT 'assertion_proposal', id
         FROM proposed_assertions
         WHERE account_id = $1 AND capture_id = ANY($2::uuid[])
       UNION ALL
       SELECT 'fact_decision', decisions.id
         FROM fact_decisions decisions
         JOIN proposed_assertions assertions
           ON assertions.account_id = decisions.account_id
          AND assertions.id = decisions.assertion_id
         WHERE assertions.account_id = $1
           AND assertions.capture_id = ANY($2::uuid[])
       UNION ALL
       SELECT 'confirmed_state', states.id
         FROM confirmed_states states
         JOIN proposed_assertions assertions
           ON assertions.account_id = states.account_id
          AND assertions.id = states.source_assertion_id
         WHERE assertions.account_id = $1
           AND assertions.capture_id = ANY($2::uuid[])
       UNION ALL
       SELECT 'action_proposal', id
         FROM action_proposals
         WHERE account_id = $1 AND capture_id = ANY($2::uuid[])
       UNION ALL
       SELECT 'action_approval', approvals.id
         FROM action_approvals approvals
         JOIN action_proposals actions
           ON actions.account_id = approvals.account_id
          AND actions.id = approvals.action_id
         WHERE actions.account_id = $1
           AND actions.capture_id = ANY($2::uuid[])
       UNION ALL
       SELECT 'effect_attempt', attempts.id
         FROM effect_attempts attempts
         JOIN action_proposals actions
           ON actions.account_id = attempts.account_id
          AND actions.id = attempts.action_id
         WHERE actions.account_id = $1
           AND actions.capture_id = ANY($2::uuid[])
       UNION ALL
       SELECT 'outcome', outcomes.id
         FROM outcomes
         JOIN effect_attempts attempts
           ON attempts.account_id = outcomes.account_id
          AND attempts.id = outcomes.attempt_id
         JOIN action_proposals actions
           ON actions.account_id = attempts.account_id
          AND actions.id = attempts.action_id
         WHERE actions.account_id = $1
           AND actions.capture_id = ANY($2::uuid[])
       UNION ALL
       SELECT 'effect_observation', observations.id
         FROM effect_observations observations
         JOIN effect_attempts attempts
           ON attempts.account_id = observations.account_id
          AND attempts.id = observations.attempt_id
         JOIN action_proposals actions
           ON actions.account_id = attempts.account_id
          AND actions.id = attempts.action_id
         WHERE actions.account_id = $1
           AND actions.capture_id = ANY($2::uuid[])
       UNION ALL
       SELECT DISTINCT 'simulated_destination', destinations.id
         FROM simulated_destinations destinations
         JOIN action_proposals actions
           ON actions.account_id = destinations.account_id
          AND actions.exact_preview->'target'->>'destination_key'
              = destinations.destination_key
         WHERE actions.account_id = $1
           AND actions.capture_id = ANY($2::uuid[])`,
      [auth.accountId, governedCaptureIds],
    );

    // The Agent control plane is a registered derivative of the reviewed
    // capture too. Keep its structural audit identity, but explicitly account
    // for every row family that can retain source-derived text, projections,
    // or a reusable reference after the source is deleted.
    const agentDerivatives = await client.query<{
      entity_type: string;
      entity_id: string;
    }>(
      `WITH affected_tasks AS (
         SELECT id
         FROM agent_tasks
         WHERE account_id = $1 AND capture_id = ANY($2::uuid[])
       ),
       affected_runs AS (
         SELECT id
         FROM agent_runs
         WHERE account_id = $1 AND capture_id = ANY($2::uuid[])
       )
       SELECT 'agent_task' AS entity_type, id AS entity_id
         FROM affected_tasks
       UNION ALL
       SELECT 'agent_task_run', runs.id
         FROM agent_task_runs runs
         WHERE runs.account_id = $1
           AND runs.task_id IN (SELECT id FROM affected_tasks)
       UNION ALL
       SELECT 'agent_task_checkpoint', checkpoints.id
         FROM agent_task_checkpoints checkpoints
         WHERE checkpoints.account_id = $1
           AND checkpoints.task_id IN (SELECT id FROM affected_tasks)
       UNION ALL
       SELECT 'agent_artifact', artifacts.id
         FROM agent_artifacts artifacts
         WHERE artifacts.account_id = $1
           AND artifacts.task_id IN (SELECT id FROM affected_tasks)
       UNION ALL
       SELECT DISTINCT 'agent_artifact_evidence_registry', links.artifact_id
         FROM agent_artifact_evidence links
         JOIN agent_artifacts artifacts
           ON artifacts.account_id = links.account_id
          AND artifacts.id = links.artifact_id
         WHERE links.account_id = $1
           AND artifacts.task_id IN (SELECT id FROM affected_tasks)
       UNION ALL
       SELECT 'agent_clarification_request', requests.id
         FROM agent_clarification_requests requests
         WHERE requests.account_id = $1
           AND requests.task_id IN (SELECT id FROM affected_tasks)
       UNION ALL
       SELECT 'agent_decision_bundle', bundles.id
         FROM agent_decision_bundles bundles
         WHERE bundles.account_id = $1
           AND bundles.task_id IN (SELECT id FROM affected_tasks)
       UNION ALL
       SELECT 'agent_decision_item', items.id
         FROM agent_decision_items items
         JOIN agent_decision_bundles bundles
           ON bundles.account_id = items.account_id
          AND bundles.id = items.bundle_id
         WHERE items.account_id = $1
           AND bundles.task_id IN (SELECT id FROM affected_tasks)
       UNION ALL
       SELECT 'agent_task_event', events.event_id
         FROM agent_task_events events
         WHERE events.account_id = $1
           AND events.task_id IN (SELECT id FROM affected_tasks)
       UNION ALL
       SELECT DISTINCT 'agent_delivery_outbox_registry', outbox.event_id
         FROM agent_delivery_outbox outbox
         WHERE outbox.account_id = $1
           AND outbox.task_id IN (SELECT id FROM affected_tasks)
       UNION ALL
       SELECT 'agent_run', id FROM affected_runs
       UNION ALL
       SELECT DISTINCT 'agent_run_evidence_registry', evidence.run_id
         FROM agent_run_evidence evidence
         WHERE evidence.account_id = $1
           AND evidence.run_id IN (SELECT id FROM affected_runs)
       UNION ALL
       SELECT DISTINCT 'agent_run_event_registry', events.run_id
         FROM agent_run_events events
         WHERE events.account_id = $1
           AND events.run_id IN (SELECT id FROM affected_runs)
       UNION ALL
       SELECT 'agent_tool_call', calls.id
         FROM agent_tool_calls calls
         WHERE calls.account_id = $1
           AND calls.run_id IN (SELECT id FROM affected_runs)
       UNION ALL
       SELECT 'agent_run_output', outputs.id
         FROM agent_run_outputs outputs
         WHERE outputs.account_id = $1
           AND outputs.run_id IN (SELECT id FROM affected_runs)
       UNION ALL
       SELECT 'agent_no_action', no_actions.id
         FROM agent_no_actions no_actions
         WHERE no_actions.account_id = $1
           AND no_actions.run_id IN (SELECT id FROM affected_runs)
       UNION ALL
       SELECT DISTINCT 'pursuit_gap_audit_reference', gaps.id
         FROM pursuit_gaps gaps
         JOIN pursuit_gap_evidence links
           ON links.account_id = gaps.account_id
          AND links.gap_id = gaps.id
         JOIN evidence_fragments fragments
           ON fragments.account_id = links.account_id
          AND fragments.id = links.evidence_fragment_id
         WHERE gaps.account_id = $1
           AND fragments.capture_id = ANY($2::uuid[])`,
      [auth.accountId, governedCaptureIds],
    );
    entities.rows.push(...agentDerivatives.rows);
    const affectedAgentTaskIds = agentDerivatives.rows
      .filter((entity) => entity.entity_type === "agent_task")
      .map((entity) => entity.entity_id);
    const affectedAgentRunIds = agentDerivatives.rows
      .filter((entity) => entity.entity_type === "agent_run")
      .map((entity) => entity.entity_id);

    const affectedKnowledge = await client.query<{
      entity_type: string;
      entity_id: string;
    }>(
      `WITH affected_snapshots AS (
         SELECT DISTINCT blocks.snapshot_id
         FROM knowledge_dependencies dependencies
         JOIN knowledge_blocks blocks
           ON blocks.account_id = dependencies.account_id
          AND blocks.id = dependencies.block_id
         WHERE dependencies.account_id = $1
           AND (
             (
               dependencies.dependency_type = 'evidence_fragment'
               AND dependencies.dependency_id IN (
                 SELECT id
                 FROM evidence_fragments
                 WHERE account_id = $1
                   AND capture_id = ANY($2::uuid[])
               )
             )
             OR (
               dependencies.dependency_type = 'source_resource'
               AND dependencies.dependency_id IN (
                 SELECT id
                 FROM source_resources
                 WHERE account_id = $1
                   AND capture_id = ANY($2::uuid[])
               )
             )
           )
       )
       SELECT 'knowledge_snapshot' AS entity_type, snapshot_id AS entity_id
         FROM affected_snapshots
       UNION ALL
       SELECT 'knowledge_block', blocks.id
         FROM knowledge_blocks blocks
         WHERE blocks.account_id = $1
           AND blocks.snapshot_id IN (SELECT snapshot_id FROM affected_snapshots)
       UNION ALL
       SELECT 'context_manifest', manifests.id
         FROM context_manifests manifests
         WHERE manifests.account_id = $1
           AND manifests.knowledge_snapshot_id IN (
             SELECT snapshot_id FROM affected_snapshots
           )
       UNION ALL
       SELECT 'idempotency_record', records.id
         FROM idempotency_records records
         WHERE records.account_id = $1
           AND (
             (
               records.operation_scope = 'compile_relationship_wiki'
               AND records.response_body->>'snapshot_id' IN (
                 SELECT snapshot_id::text FROM affected_snapshots
               )
             )
             OR (
               records.operation_scope = 'create_chat_task'
               AND records.response_body->>'knowledge_snapshot_id' IN (
                 SELECT snapshot_id::text FROM affected_snapshots
               )
             )
           )`,
      [auth.accountId, governedCaptureIds],
    );
    entities.rows.push(...affectedKnowledge.rows);
    const affectedSnapshotIds = affectedKnowledge.rows
      .filter((item) => item.entity_type === "knowledge_snapshot")
      .map((item) => item.entity_id);
    const affectedResearchTaskIds = entities.rows
      .filter((item) => item.entity_type === "research_task")
      .map((item) => item.entity_id);

    const destinationKeys = await client.query<{ destination_key: string }>(
      `SELECT DISTINCT exact_preview->'target'->>'destination_key' AS destination_key
       FROM action_proposals
       WHERE account_id = $1
         AND capture_id = ANY($2::uuid[])
         AND exact_preview->'target'->>'destination_key' IS NOT NULL`,
      [auth.accountId, governedCaptureIds],
    );

    if (affectedAgentTaskIds.length > 0) {
      await client.query(
        `UPDATE agent_tasks
         SET objective = '[source deleted]',
             evidence_refs = '[]'::jsonb,
             input_artifact_refs = '[]'::jsonb,
             status = CASE
               WHEN status IN (
                 'active', 'waiting_for_clarification',
                 'waiting_for_domain_decision', 'waiting_for_external'
               ) THEN 'needs_rebase'
               ELSE status
             END,
             task_revision = task_revision + 1,
             continue_allowed = false,
             lease_owner = NULL,
             lease_expires_at = NULL,
             updated_at = now()
         WHERE account_id = $1 AND id = ANY($2::uuid[])`,
        [auth.accountId, affectedAgentTaskIds],
      );
      await client.query(
        `UPDATE agent_task_runs
         SET status = 'cancelled', completed_at = now()
         WHERE account_id = $1
           AND task_id = ANY($2::uuid[])
           AND status IN ('scheduled', 'running', 'suspended')`,
        [auth.accountId, affectedAgentTaskIds],
      );
      await client.query(
        `UPDATE agent_task_checkpoints
         SET public_state = '{"source_content_state":"removed"}'::jsonb
         WHERE account_id = $1 AND task_id = ANY($2::uuid[])`,
        [auth.accountId, affectedAgentTaskIds],
      );
      await client.query(
        `UPDATE agent_artifacts
         SET status = 'redacted',
             title = '[source deleted]',
             content = '{
               "summary":"Source-derived Artifact content was removed.",
               "what_changed":[],
               "what_matters_now":{
                 "dependency":"Review current evidence before continuing.",
                 "reason":"The prior source was deleted.",
                 "authority":"agent_interpretation",
                 "evidence_refs":[]
               },
               "next_move":{
                 "kind":"no_action",
                 "label":"Review changed source",
                 "reason":"Create a new immutable Task version only from currently authorized evidence."
               },
               "limitations":["Source-derived content was removed; this Artifact has no current authority."]
             }'::jsonb
         WHERE account_id = $1 AND task_id = ANY($2::uuid[])`,
        [auth.accountId, affectedAgentTaskIds],
      );
      await client.query(
        `UPDATE agent_clarification_requests
         SET question = '[source deleted]',
             reason = '[source deleted]',
             response_schema = '{}'::jsonb,
             status = CASE WHEN status = 'open' THEN 'cancelled' ELSE status END
         WHERE account_id = $1 AND task_id = ANY($2::uuid[])`,
        [auth.accountId, affectedAgentTaskIds],
      );
      await client.query(
        `UPDATE agent_decision_bundles
         SET dependency = '[source deleted]',
             status = CASE
               WHEN status IN ('open', 'partially_resolved') THEN 'cancelled'
               ELSE status
             END,
             updated_at = now()
         WHERE account_id = $1 AND task_id = ANY($2::uuid[])`,
        [auth.accountId, affectedAgentTaskIds],
      );
      await client.query(
        `UPDATE agent_decision_items items
         SET status = CASE WHEN items.status = 'open' THEN 'expired' ELSE items.status END,
             updated_at = now()
         FROM agent_decision_bundles bundles
         WHERE bundles.account_id = $1
           AND bundles.task_id = ANY($2::uuid[])
           AND items.account_id = bundles.account_id
           AND items.bundle_id = bundles.id`,
        [auth.accountId, affectedAgentTaskIds],
      );
      await client.query(
        `UPDATE agent_task_events
         SET public_payload = '{"source_content_state":"removed"}'::jsonb
         WHERE account_id = $1 AND task_id = ANY($2::uuid[])`,
        [auth.accountId, affectedAgentTaskIds],
      );
      await client.query(
        `UPDATE agent_delivery_outbox
         SET payload = jsonb_set(
           payload,
           '{public_payload}',
           '{"source_content_state":"removed"}'::jsonb,
           true
         )
         WHERE account_id = $1 AND task_id = ANY($2::uuid[])`,
        [auth.accountId, affectedAgentTaskIds],
      );
    }
    if (affectedAgentRunIds.length > 0) {
      await client.query(
        `UPDATE agent_runs
         SET objective = '[source deleted]',
             context_manifest = jsonb_build_object(
               'pursuit_revision', base_revision,
               'evidence', '[]'::jsonb,
               'input_artifacts', '[]'::jsonb
             )
         WHERE account_id = $1 AND id = ANY($2::uuid[])`,
        [auth.accountId, affectedAgentRunIds],
      );
      await client.query(
        `UPDATE agent_run_evidence
         SET inclusion_reason = '[source deleted]',
             authorization_scope = '[source deleted]'
         WHERE account_id = $1 AND run_id = ANY($2::uuid[])`,
        [auth.accountId, affectedAgentRunIds],
      );
      await client.query(
        `UPDATE agent_run_outputs
         SET status = 'quarantined',
             structured_output = '{"source_content_state":"removed"}'::jsonb
         WHERE account_id = $1 AND run_id = ANY($2::uuid[])`,
        [auth.accountId, affectedAgentRunIds],
      );
      await client.query(
        `UPDATE agent_no_actions
         SET reason = '[source deleted]', missing_evidence_refs = '[]'::jsonb
         WHERE account_id = $1 AND run_id = ANY($2::uuid[])`,
        [auth.accountId, affectedAgentRunIds],
      );
    }

    await client.query(
      `UPDATE action_approvals approvals
       SET status = 'revoked',
           revoked_at = now(),
           revocation_reason = 'source_deleted'
       FROM action_proposals actions
       WHERE actions.account_id = $1
         AND actions.capture_id = ANY($2::uuid[])
         AND approvals.account_id = actions.account_id
         AND approvals.action_id = actions.id
         AND approvals.status = 'active'`,
      [auth.accountId, governedCaptureIds],
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
           WHERE actions.account_id = $1
             AND actions.capture_id = ANY($2::uuid[])
         )`,
      [auth.accountId, governedCaptureIds],
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
           WHERE actions.account_id = $1
             AND actions.capture_id = ANY($2::uuid[])
         )`,
      [auth.accountId, governedCaptureIds],
    );
    for (const { destination_key: destinationKey } of destinationKeys.rows) {
      await client.query(
        `DELETE FROM simulated_destinations
         WHERE account_id = $1 AND destination_key = $2`,
        [auth.accountId, destinationKey],
      );
    }
    const priorStatesNeedingReview = await client.query<{
      retracted_state_id: string;
      prior_state_id: string;
    }>(
      `WITH RECURSIVE state_chain AS (
         SELECT
           states.id AS retracted_state_id,
           states.supersedes_state_id AS candidate_state_id,
           1 AS depth
         FROM confirmed_states states
         JOIN proposed_assertions assertions
           ON assertions.account_id = states.account_id
          AND assertions.id = states.source_assertion_id
         WHERE states.account_id = $1
           AND assertions.capture_id = ANY($2::uuid[])
           AND states.status = 'active'
           AND states.supersedes_state_id IS NOT NULL
         UNION ALL
         SELECT
           chain.retracted_state_id,
           candidate.supersedes_state_id,
           chain.depth + 1
         FROM state_chain chain
         JOIN confirmed_states candidate
           ON candidate.account_id = $1
          AND candidate.id = chain.candidate_state_id
         JOIN proposed_assertions candidate_assertion
           ON candidate_assertion.account_id = candidate.account_id
          AND candidate_assertion.id = candidate.source_assertion_id
         WHERE candidate_assertion.capture_id = ANY($2::uuid[])
           AND candidate.supersedes_state_id IS NOT NULL
           AND chain.depth < 100
       ),
       surviving_prior AS (
         SELECT
           chain.retracted_state_id,
           candidate.id AS prior_state_id,
           row_number() OVER (
             PARTITION BY chain.retracted_state_id
             ORDER BY chain.depth
           ) AS candidate_rank
         FROM state_chain chain
         JOIN confirmed_states candidate
           ON candidate.account_id = $1
          AND candidate.id = chain.candidate_state_id
         JOIN proposed_assertions candidate_assertion
           ON candidate_assertion.account_id = candidate.account_id
          AND candidate_assertion.id = candidate.source_assertion_id
         JOIN captures candidate_capture
           ON candidate_capture.account_id = candidate_assertion.account_id
          AND candidate_capture.id = candidate_assertion.capture_id
         WHERE NOT (
             candidate_assertion.capture_id = ANY($2::uuid[])
           )
           AND candidate_capture.status = 'active'
           AND candidate.status = 'superseded'
           AND candidate.value_text IS NOT NULL
       )
       SELECT retracted_state_id, prior_state_id
       FROM surviving_prior
       WHERE candidate_rank = 1`,
      [auth.accountId, governedCaptureIds],
    );
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
       WHERE account_id = $1 AND capture_id = ANY($2::uuid[])`,
      [auth.accountId, governedCaptureIds],
    );
    const affectedPursuitProposals = await client.query<{
      id: string;
      status: string;
    }>(
      `SELECT DISTINCT proposals.id, proposals.status
       FROM pursuit_proposals proposals
       LEFT JOIN pursuit_proposal_items items
         ON items.account_id = proposals.account_id
        AND items.proposal_id = proposals.id
       LEFT JOIN pursuit_proposal_item_evidence proposal_evidence
         ON proposal_evidence.account_id = items.account_id
        AND proposal_evidence.proposal_item_id = items.id
       LEFT JOIN evidence_fragments fragments
         ON fragments.account_id = proposal_evidence.account_id
        AND fragments.id = proposal_evidence.evidence_fragment_id
       WHERE proposals.account_id = $1
         AND (
           proposals.capture_id = ANY($2::uuid[])
           OR fragments.capture_id = ANY($2::uuid[])
         )`,
      [auth.accountId, governedCaptureIds],
    );
    const affectedPursuitProposalIds = affectedPursuitProposals.rows.map(
      (proposal) => proposal.id,
    );
    if (affectedPursuitProposalIds.length > 0) {
      const pursuitDecisionDerivatives = await client.query<{
        entity_type: string;
        entity_id: string;
      }>(
        `SELECT 'pursuit_operation_audit_reference' AS entity_type, operations.id AS entity_id
           FROM pursuit_operations operations
           WHERE operations.account_id = $1
             AND operations.proposal_id = ANY($2::uuid[])
         UNION ALL
         SELECT 'pursuit_receipt_audit_reference', receipts.id
           FROM pursuit_receipts receipts
           WHERE receipts.account_id = $1
             AND receipts.proposal_id = ANY($2::uuid[])`,
        [auth.accountId, affectedPursuitProposalIds],
      );
      entities.rows.push(...pursuitDecisionDerivatives.rows);
    }
    const supersededPursuitProposalIds = affectedPursuitProposals.rows
      .filter((proposal) =>
        ["needs_review", "confirming", "conflict", "failed"].includes(
          proposal.status,
        ),
      )
      .map((proposal) => proposal.id);
    if (affectedPursuitProposalIds.length > 0) {
      await client.query(
        `UPDATE pursuit_proposals
         SET status = CASE
               WHEN status IN ('needs_review', 'confirming', 'conflict', 'failed')
                 THEN 'superseded'
               ELSE status
             END,
             summary = '[source-derived Proposal content removed]',
             revision = revision + 1,
             updated_at = now()
         WHERE account_id = $1 AND id = ANY($2::uuid[])`,
        [auth.accountId, affectedPursuitProposalIds],
      );
      await client.query(
        `UPDATE pursuit_proposal_items
         SET before_value = NULL,
             proposed_value = '{"content_removed":true}'::jsonb,
             epistemic_status = 'superseded',
             reason = '[source-derived Proposal reason removed]',
             effect_summary = '[source-derived Proposal effect removed]',
             decided_value = CASE
               WHEN decided_value IS NULL THEN NULL
               ELSE '{"content_removed":true}'::jsonb
             END,
             decision_reason = CASE
               WHEN decision_reason IS NULL THEN NULL
               ELSE '[source-derived review reason removed]'
             END
         WHERE account_id = $1
           AND proposal_id = ANY($2::uuid[])`,
        [auth.accountId, affectedPursuitProposalIds],
      );
      await client.query(
        `UPDATE pursuit_operations
         SET reason = '[source-derived operation reason removed]',
             status = CASE
               WHEN status IN ('confirming', 'unknown_locked') THEN 'failed'
               ELSE status
             END,
             resolved_at = CASE
               WHEN status IN ('confirming', 'unknown_locked') THEN now()
               ELSE resolved_at
             END
         WHERE account_id = $1
           AND proposal_id = ANY($2::uuid[])`,
        [auth.accountId, affectedPursuitProposalIds],
      );
      await client.query(
        `UPDATE audit_events
         SET metadata = (metadata - 'reason')
           || '{"source_content_state":"removed"}'::jsonb
         WHERE account_id = $1
           AND entity_type = 'pursuit_proposal'
           AND entity_id = ANY($2::uuid[])`,
        [auth.accountId, affectedPursuitProposalIds],
      );
    }
    for (const proposalId of supersededPursuitProposalIds) {
      await appendAudit(
        client,
        { accountId: auth.accountId, actorUserId: auth.userId },
        "pursuit.proposal.superseded_by_source_deletion",
        "pursuit_proposal",
        proposalId,
        {
          deletion_id: deletionId,
          root_capture_id: captureId,
          affected_capture_ids: governedCaptureIds,
        },
      );
    }
    const priorStateIds = priorStatesNeedingReview.rows.map(
      (state) => state.prior_state_id,
    );
    if (priorStateIds.length > 0) {
      await client.query(
        `UPDATE confirmed_states
         SET status = 'contested'
         WHERE account_id = $1
           AND id = ANY($2::uuid[])
           AND status = 'superseded'`,
        [auth.accountId, priorStateIds],
      );
    }
    await client.query(
      `UPDATE confirmed_states states
       SET status = 'deleted', value_text = NULL, deleted_at = now()
       FROM proposed_assertions assertions
       WHERE assertions.account_id = $1
         AND assertions.capture_id = ANY($2::uuid[])
         AND states.account_id = assertions.account_id
         AND states.source_assertion_id = assertions.id`,
      [auth.accountId, governedCaptureIds],
    );
    await client.query(
      `UPDATE fact_decisions decisions
       SET proposed_value_at_decision = NULL, corrected_value = NULL
       FROM proposed_assertions assertions
       WHERE assertions.account_id = $1
         AND assertions.capture_id = ANY($2::uuid[])
         AND decisions.account_id = assertions.account_id
         AND decisions.assertion_id = assertions.id`,
      [auth.accountId, governedCaptureIds],
    );
    await client.query(
      `UPDATE proposed_assertions
       SET review_status = 'deleted',
           proposed_value = NULL,
           evidence_quote = NULL,
           deleted_at = now()
       WHERE account_id = $1 AND capture_id = ANY($2::uuid[])`,
      [auth.accountId, governedCaptureIds],
    );
    await client.query(
      `UPDATE analysis_proposals
       SET status = 'deleted', deleted_at = now()
       WHERE account_id = $1 AND capture_id = ANY($2::uuid[])`,
      [auth.accountId, governedCaptureIds],
    );
    await client.query(
      `UPDATE context_manifests
       SET status = 'deleted',
           objective = '[deleted]',
           authorization_scope = '[deleted]',
           deleted_at = now()
       WHERE account_id = $1
         AND knowledge_snapshot_id = ANY($2::uuid[])`,
      [auth.accountId, affectedSnapshotIds],
    );
    await client.query(
      `UPDATE context_manifest_blocks
       SET inclusion_reason = '[deleted]'
       WHERE account_id = $1
         AND manifest_id IN (
           SELECT id
           FROM context_manifests
           WHERE account_id = $1
             AND knowledge_snapshot_id = ANY($2::uuid[])
         )`,
      [auth.accountId, affectedSnapshotIds],
    );
    await client.query(
      `UPDATE context_manifest_evidence
       SET inclusion_reason = '[deleted]'
       WHERE account_id = $1
         AND manifest_id IN (
           SELECT id
           FROM context_manifests
           WHERE account_id = $1
             AND knowledge_snapshot_id = ANY($2::uuid[])
         )`,
      [auth.accountId, affectedSnapshotIds],
    );
    await client.query(
      `UPDATE knowledge_dependencies
       SET inclusion_reason = '[deleted]'
       WHERE account_id = $1
         AND block_id IN (
           SELECT id
           FROM knowledge_blocks
           WHERE account_id = $1
             AND snapshot_id = ANY($2::uuid[])
         )`,
      [auth.accountId, affectedSnapshotIds],
    );
    await client.query(
      `UPDATE knowledge_blocks
       SET status = 'deleted',
           structured_content = '{"headline":"[deleted]","items":[]}'::jsonb,
           semantic_hash = 'deleted',
           deleted_at = now()
       WHERE account_id = $1
         AND snapshot_id = ANY($2::uuid[])`,
      [auth.accountId, affectedSnapshotIds],
    );
    await client.query(
      `UPDATE knowledge_snapshots
       SET status = 'deleted',
           quality = '{
             "verdict":"abstain",
             "gates":{
               "identity_binding":"pass",
               "provenance":"fail",
               "scope_authorization":"pass",
               "temporal_integrity":"fail",
               "prohibited_inference":"pass",
               "deletion_lineage":"pass"
             },
             "measures":{
               "task_relevance":0,
               "compression":0,
               "conflict_visibility":0,
               "recruiter_reviewability":0
             },
             "reasons":["The source was deleted and this snapshot was retracted."]
           }'::jsonb,
           deleted_at = now()
       WHERE account_id = $1
         AND id = ANY($2::uuid[])`,
      [auth.accountId, affectedSnapshotIds],
    );
    await client.query(
      `UPDATE idempotency_records
       SET response_body = '{"deleted":true}'::jsonb
       WHERE account_id = $1
         AND (
           (
             operation_scope = 'compile_relationship_wiki'
             AND response_body->>'snapshot_id' = ANY($2::text[])
           )
           OR (
             operation_scope = 'create_chat_task'
             AND response_body->>'knowledge_snapshot_id' = ANY($2::text[])
           )
         )`,
      [auth.accountId, affectedSnapshotIds],
    );
    const resourceIdempotency = await client.query<{ id: string }>(
      `SELECT id
         FROM idempotency_records
         WHERE account_id = $1
           AND (
           (
             (
               operation_scope IN (
                 'create_resource_capture',
                 'create_capture'
               )
               OR operation_scope LIKE 'resolve_identity_case:%'
             )
             AND COALESCE(
               response_body->>'capture_id',
               response_body->>'id'
             ) = ANY($2::text[])
           )
           OR (
             operation_scope = 'review_evidence_fragment'
             AND response_body->>'fragment_id' IN (
               SELECT id::text
             FROM evidence_fragments
             WHERE account_id = $1
               AND capture_id = ANY($2::uuid[])
             )
           )
           OR (
             operation_scope = 'run_public_research'
             AND response_body->>'task_id' = ANY($3::text[])
           )
           OR (
             (
               operation_scope LIKE 'stage_pursuit_proposal:%'
               OR operation_scope LIKE 'review_pursuit_proposal:%'
             )
             AND (
               response_body->'proposal'->>'capture_id'
                 = ANY($2::text[])
               OR response_body->'proposal'->>'id'
                 = ANY($4::text[])
             )
           )
           )
       UNION
       SELECT tasks.idempotency_record_id
         FROM agent_tasks tasks
         WHERE tasks.account_id = $1
           AND tasks.capture_id = ANY($2::uuid[])
       UNION
       SELECT runs.idempotency_record_id
         FROM agent_runs runs
         WHERE runs.account_id = $1
           AND runs.capture_id = ANY($2::uuid[])`,
      [
        auth.accountId,
        governedCaptureIds,
        affectedResearchTaskIds,
        affectedPursuitProposalIds,
      ],
    );
    entities.rows.push(
      ...resourceIdempotency.rows.map((record) => ({
        entity_type: "idempotency_record",
        entity_id: record.id,
      })),
    );
    await client.query(
      `UPDATE idempotency_records
       SET response_body = '{"deleted":true}'::jsonb
       WHERE account_id = $1
         AND id = ANY($2::uuid[])`,
      [
        auth.accountId,
        resourceIdempotency.rows.map((record) => record.id),
      ],
    );
    await client.query(
      `UPDATE evidence_fragment_reviews reviews
       SET reason = '[source deleted]'
       FROM evidence_fragments fragments
       WHERE fragments.account_id = $1
         AND fragments.capture_id = ANY($2::uuid[])
         AND reviews.account_id = fragments.account_id
         AND reviews.fragment_id = fragments.id`,
      [auth.accountId, governedCaptureIds],
    );
    await client.query(
      `UPDATE identity_resolution_candidates candidates
       SET match_reasons = '[]'::jsonb
       FROM identity_resolution_cases cases
       WHERE cases.account_id = $1
         AND cases.capture_id = ANY($2::uuid[])
         AND candidates.account_id = cases.account_id
         AND candidates.case_id = cases.id`,
      [auth.accountId, governedCaptureIds],
    );
    await client.query(
      `UPDATE identity_resolution_decisions decisions
       SET selected_subject_id = NULL,
           selected_assignment_id = NULL,
           reason = '[source deleted]'
       FROM identity_resolution_cases cases
       WHERE cases.account_id = $1
         AND cases.capture_id = ANY($2::uuid[])
         AND decisions.account_id = cases.account_id
         AND decisions.case_id = cases.id`,
      [auth.accountId, governedCaptureIds],
    );
    await client.query(
      `UPDATE identity_resolution_cases
       SET status = 'deleted',
           reason = '[source deleted]',
           resolved_subject_id = NULL,
           resolved_assignment_id = NULL,
           deleted_at = now(),
           updated_at = now()
       WHERE account_id = $1
         AND capture_id = ANY($2::uuid[])`,
      [auth.accountId, governedCaptureIds],
    );
    await client.query(
      `UPDATE identity_handles
       SET normalized_value_hash = 'deleted:' || id::text,
           display_hint = NULL,
           status = 'deleted',
           valid_until = now(),
           deleted_at = now(),
           updated_at = now()
       WHERE account_id = $1
         AND source_resource_id IN (
           SELECT id
           FROM source_resources
           WHERE account_id = $1
             AND capture_id = ANY($2::uuid[])
         )`,
      [auth.accountId, governedCaptureIds],
    );
    await client.query(
      `UPDATE research_snapshots snapshots
       SET canonical_url = '[deleted]',
           content_hash = 'deleted:' || snapshots.id::text,
           status = 'deleted',
           deleted_at = now()
       FROM source_resources resources
       WHERE resources.account_id = $1
         AND resources.capture_id = ANY($2::uuid[])
         AND snapshots.account_id = resources.account_id
         AND snapshots.resource_id = resources.id`,
      [auth.accountId, governedCaptureIds],
    );
    await client.query(
      `UPDATE research_tasks
       SET seed_resource_id = NULL,
           purpose = '[deleted]',
           seed_urls = '[]'::jsonb,
           allowed_domains = '[]'::jsonb,
           authorization_scope = '[deleted]',
           status = 'deleted',
           deleted_at = now(),
           updated_at = now()
       WHERE account_id = $1
         AND id = ANY($2::uuid[])`,
      [auth.accountId, affectedResearchTaskIds],
    );
    await client.query(
      `UPDATE evidence_fragments
       SET status = 'deleted',
           text_content = NULL,
           content_hash = 'deleted',
           locator = '{"deleted":true}'::jsonb,
           deleted_at = now()
       WHERE account_id = $1 AND capture_id = ANY($2::uuid[])`,
      [auth.accountId, governedCaptureIds],
    );
    await client.query(
      `UPDATE source_resources
       SET processing_state = 'deleted',
           display_name = '[deleted]',
           content_hash = NULL,
           source_locator = NULL,
           payload_ref = NULL,
           deleted_at = now(),
           updated_at = now()
       WHERE account_id = $1 AND capture_id = ANY($2::uuid[])`,
      [auth.accountId, governedCaptureIds],
    );
    await client.query(
      `UPDATE evidence_items
       SET status = 'deleted',
           redacted_text = NULL,
           content_hash = 'deleted',
           deleted_at = now()
       WHERE account_id = $1 AND capture_id = ANY($2::uuid[])`,
      [auth.accountId, governedCaptureIds],
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
       WHERE account_id = $1 AND id = ANY($2::uuid[])`,
      [auth.accountId, governedCaptureIds],
    );
    const sourceDeletedAt = new Date();
    for (const governedCaptureId of governedCaptureIds) {
      await markSourceDeleted(
        client,
        auth,
        governedCaptureId,
        sourceDeletedAt,
      );
    }
    const assignmentIds = [
      ...new Set(
        governedCaptures.rows.flatMap((row) =>
          row.assignment_id ? [row.assignment_id] : [],
        ),
      ),
    ];
    for (const assignmentId of assignmentIds) {
      const assignmentStillUsed = await client.query<{ used: boolean }>(
        `SELECT EXISTS(
           SELECT 1
           FROM captures
           WHERE account_id = $1
             AND assignment_id = $2
             AND status = 'active'
         ) AS used`,
        [auth.accountId, assignmentId],
      );
      if (!assignmentStillUsed.rows[0]?.used) {
        await client.query(
          `UPDATE assignments
           SET status = 'deleted',
               external_ref = 'deleted:' || id::text,
               display_label = '[deleted]',
               deleted_at = now()
           WHERE account_id = $1 AND id = $2`,
          [auth.accountId, assignmentId],
        );
        entities.rows.push({
          entity_type: "assignment",
          entity_id: assignmentId,
        });
      }
    }
    const subjectIds = [
      ...new Set(
        governedCaptures.rows.flatMap((row) =>
          row.subject_id ? [row.subject_id] : [],
        ),
      ),
    ];
    for (const subjectId of subjectIds) {
      const subjectStillUsed = await client.query<{ used: boolean }>(
        `SELECT EXISTS(
           SELECT 1
           FROM captures
           WHERE account_id = $1
             AND subject_id = $2
             AND status = 'active'
         ) AS used`,
        [auth.accountId, subjectId],
      );
      if (!subjectStillUsed.rows[0]?.used) {
        await client.query(
          `UPDATE subjects
           SET status = 'deleted',
               external_ref = 'deleted:' || id::text,
               display_label = '[deleted]',
               deleted_at = now()
           WHERE account_id = $1 AND id = $2`,
          [auth.accountId, subjectId],
        );
        entities.rows.push({
          entity_type: "subject",
          entity_id: subjectId,
        });
      }
    }

    const auditReferenceEntityTypes = new Set([
      "effect_attempt",
      "agent_task",
      "agent_task_run",
      "agent_task_checkpoint",
      "agent_artifact_evidence_registry",
      "agent_task_event",
      "agent_delivery_outbox_registry",
      "agent_run",
      "agent_run_evidence_registry",
      "agent_run_event_registry",
      "agent_tool_call",
      "pursuit_gap_audit_reference",
      "pursuit_operation_audit_reference",
      "pursuit_receipt_audit_reference",
    ]);
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
          auditReferenceEntityTypes.has(entity.entity_type)
            ? "audit_reference_retained"
            : "content_removed",
        ],
      );
    }
    await client.query(
      `INSERT INTO deletion_lineage(
         id, account_id, deletion_id, entity_type, entity_id, disposition
       )
       SELECT
         gen_random_uuid(), $1, $2, 'capture', ids.capture_id,
         'access_revoked'
       FROM unnest($3::uuid[]) AS ids(capture_id)`,
      [auth.accountId, deletionId, governedCaptureIds],
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
        governed_capture_ids: governedCaptureIds,
        prior_state_ids_reopened_for_review: priorStateIds,
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
