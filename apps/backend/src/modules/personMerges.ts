import { randomUUID } from "node:crypto";

import {
  CONTRACT_VERSION,
  type PersonMergeBlocker,
  type PersonMergePreview,
  type PersonMergeRequest,
  type PersonMergeResponse,
  type PersonMergeReversalRequest,
  type PersonMergeReversalPreview,
  type PersonMergeReviewItem,
} from "@talent-signal/contracts";
import type { Pool, PoolClient } from "pg";

import { inTransaction } from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import { appendAudit } from "../lib/audit.js";
import { digestValue } from "../lib/hash.js";
import {
  claimIdempotency,
  completeIdempotency,
} from "../lib/idempotency.js";
import type { AuthContext } from "./auth.js";

type Queryable = Pool | PoolClient;

interface PersonRow {
  id: string;
  display_label: string;
  status: "active" | "merged" | "deleted";
  version: number;
  merged_into_subject_id: string | null;
}

interface ContextRow {
  id: string;
  display_label: string;
  active_capture_count: number;
  active_fact_count: number;
}

interface MergeOperationRow {
  id: string;
  source_subject_id: string;
  target_subject_id: string;
  status: "applied" | "reversed";
  reason: string;
  affected_assignment_ids: string[];
  affected_capture_ids: string[];
  affected_state_ids: string[];
  affected_handle_ids: string[];
  affected_research_task_ids: string[];
  invalidated_snapshot_ids: string[];
  decided_at: Date;
  reversed_at: Date | null;
}

export interface PersonMergeMutationResult {
  body: PersonMergeResponse;
  replayed: boolean;
  status: number;
}

async function loadPeople(
  queryable: Queryable,
  accountId: string,
  sourcePersonId: string,
  targetPersonId: string,
  lock = false,
): Promise<{ source: PersonRow; target: PersonRow }> {
  if (sourcePersonId === targetPersonId) {
    throw new ApiError(
      409,
      "PERSON_MERGE_TARGET_UNCHANGED",
      "Choose two different people before reviewing a merge.",
    );
  }
  const result = await queryable.query<PersonRow>(
    `SELECT
       id, display_label, status, version, merged_into_subject_id
     FROM subjects
     WHERE account_id = $1
       AND id = ANY($2::uuid[])
     ORDER BY id
     ${lock ? "FOR UPDATE" : ""}`,
    [accountId, [sourcePersonId, targetPersonId]],
  );
  const source = result.rows.find((person) => person.id === sourcePersonId);
  const target = result.rows.find((person) => person.id === targetPersonId);
  if (!source || !target) {
    throw new ApiError(
      404,
      "PERSON_MERGE_PERSON_NOT_FOUND",
      "Both people must exist in the same account.",
    );
  }
  if (source.status !== "active" || target.status !== "active") {
    throw new ApiError(
      409,
      "PERSON_MERGE_PERSON_UNAVAILABLE",
      "Only two active people can be merged.",
      {
        source_status: source.status,
        target_status: target.status,
        source_merged_into: source.merged_into_subject_id,
        target_merged_into: target.merged_into_subject_id,
      },
    );
  }
  return { source, target };
}

async function buildPreview(
  queryable: Queryable,
  accountId: string,
  sourcePersonId: string,
  targetPersonId: string,
  lock = false,
): Promise<PersonMergePreview> {
  const { source, target } = await loadPeople(
    queryable,
    accountId,
    sourcePersonId,
    targetPersonId,
    lock,
  );
  const contextsResult = await queryable.query<ContextRow>(
    `SELECT
       assignments.id,
       assignments.display_label,
       COUNT(DISTINCT captures.id) FILTER (
         WHERE captures.status = 'active'
       )::integer AS active_capture_count,
       COUNT(DISTINCT states.id) FILTER (
         WHERE states.status = 'active'
       )::integer AS active_fact_count
     FROM assignments
     LEFT JOIN captures
       ON captures.account_id = assignments.account_id
      AND captures.assignment_id = assignments.id
     LEFT JOIN confirmed_states states
       ON states.account_id = assignments.account_id
      AND states.assignment_id = assignments.id
     WHERE assignments.account_id = $1
       AND assignments.subject_id = $2
       AND assignments.status = 'active'
     GROUP BY assignments.id
     ORDER BY assignments.created_at, assignments.id`,
    [accountId, sourcePersonId],
  );
  const captureCount = contextsResult.rows.reduce(
    (total, context) => total + context.active_capture_count,
    0,
  );
  const handleResult = await queryable.query<{
    id: string;
    subject_id: string;
    handle_type: string;
    display_hint: string | null;
    normalized_value_hash: string;
  }>(
    `SELECT
       handles.id, handles.subject_id, handles.handle_type,
       handles.display_hint, handles.normalized_value_hash
     FROM identity_handles handles
     LEFT JOIN source_resources resources
       ON resources.account_id = handles.account_id
      AND resources.id = handles.source_resource_id
     LEFT JOIN source_retention_receipts receipts
       ON receipts.account_id = resources.account_id
      AND receipts.capture_id = resources.capture_id
     WHERE handles.account_id = $1
       AND handles.subject_id = ANY($2::uuid[])
       AND (
         handles.status = 'proposed'
         OR (
           handles.status = 'confirmed'
           AND (
             handles.valid_until IS NULL
             OR handles.valid_until > now()
           )
         )
       )
       AND (
         handles.source_resource_id IS NULL
         OR (
           resources.processing_state <> 'deleted'
           AND receipts.authorization_state = 'authorized'
           AND (
             receipts.authorization_expires_at IS NULL
             OR receipts.authorization_expires_at > now()
           )
         )
       )
     ORDER BY handles.handle_type, handles.subject_id, handles.id`,
    [accountId, [sourcePersonId, targetPersonId]],
  );
  const factDifferences = await queryable.query<{
    field: string;
    state_ids: string[];
    values: string[];
  }>(
    `SELECT
       states.field,
       array_agg(states.id ORDER BY states.id) AS state_ids,
       array_agg(DISTINCT left(states.value_text, 160)
         ORDER BY left(states.value_text, 160)) AS values
     FROM confirmed_states states
     WHERE states.account_id = $1
       AND states.subject_id = ANY($2::uuid[])
       AND states.status = 'active'
       AND states.value_text IS NOT NULL
     GROUP BY states.field
     HAVING COUNT(DISTINCT states.value_text) > 1
     ORDER BY states.field`,
    [accountId, [sourcePersonId, targetPersonId]],
  );
  const pendingCases = await queryable.query<{ id: string }>(
    `SELECT DISTINCT cases.id
     FROM identity_resolution_cases cases
     JOIN identity_resolution_candidates candidates
       ON candidates.account_id = cases.account_id
      AND candidates.case_id = cases.id
     WHERE cases.account_id = $1
       AND cases.status = 'pending'
       AND candidates.subject_id = ANY($2::uuid[])
     ORDER BY cases.id`,
    [accountId, [sourcePersonId, targetPersonId]],
  );
  const unresolvedEffects = await queryable.query<{ id: string }>(
    `SELECT actions.id
     FROM action_proposals actions
     JOIN captures
       ON captures.account_id = actions.account_id
      AND captures.id = actions.capture_id
     WHERE actions.account_id = $1
       AND captures.subject_id = ANY($2::uuid[])
       AND captures.status = 'active'
       AND actions.status IN ('executing', 'unknown')
     ORDER BY actions.id`,
    [accountId, [sourcePersonId, targetPersonId]],
  );

  const reviewItems: PersonMergeReviewItem[] = [];
  if (source.display_label !== target.display_label) {
    reviewItems.push({
      kind: "display_label_difference",
      title: "The two contact labels differ",
      detail:
        `Keep “${target.display_label}” as the living contact label; ` +
        `“${source.display_label}” remains in the merge audit.`,
      evidence_ids: [],
    });
  }
  for (const difference of factDifferences.rows) {
    reviewItems.push({
      kind: "contextual_fact_difference",
      title: `Different reviewed values exist for ${difference.field}`,
      detail:
        `${difference.values.join(" · ")}. Relationship contexts remain ` +
        "separate; the merge does not choose a global winner.",
      evidence_ids: difference.state_ids,
    });
  }
  const handlesByType = new Map<
    string,
    typeof handleResult.rows
  >();
  for (const handle of handleResult.rows) {
    const group = handlesByType.get(handle.handle_type) ?? [];
    group.push(handle);
    handlesByType.set(handle.handle_type, group);
  }
  for (const [handleType, handles] of handlesByType) {
    if (
      new Set(handles.map((handle) => handle.normalized_value_hash)).size >
      1
    ) {
      reviewItems.push({
        kind: "identity_handle_difference",
        title: `Multiple ${handleType.replaceAll("_", " ")} identifiers remain`,
        detail:
          `${handles
            .map((handle) => handle.display_hint ?? `Masked ${handleType}`)
            .join(" · ")}. No identifier is discarded or promoted by the merge.`,
        evidence_ids: handles.map((handle) => handle.id),
      });
    }
  }
  if (pendingCases.rows.length > 0) {
    reviewItems.push({
      kind: "unresolved_identity_case",
      title: "An identity decision is still unresolved",
      detail:
        "Resolve the source-backed identity case before merging these contacts.",
      evidence_ids: pendingCases.rows.map((row) => row.id),
    });
  }

  const blockers: PersonMergeBlocker[] = [];
  if (unresolvedEffects.rows.length > 0) {
    blockers.push({
      code: "unresolved_external_effect",
      message:
        "Reconcile executing or unknown external effects before changing the stable person identity.",
      count: unresolvedEffects.rows.length,
    });
  }
  if (pendingCases.rows.length > 0) {
    blockers.push({
      code: "pending_identity_case",
      message:
        "Resolve pending identity evidence before merging these people.",
      count: pendingCases.rows.length,
    });
  }

  const payload = {
    contract_version: CONTRACT_VERSION,
    source_person: {
      id: source.id,
      display_label: source.display_label,
      version: source.version,
    },
    target_person: {
      id: target.id,
      display_label: target.display_label,
      version: target.version,
    },
    contexts_to_move: contextsResult.rows,
    active_capture_count: captureCount,
    active_identity_handle_count: handleResult.rows.filter(
      (handle) => handle.subject_id === sourcePersonId,
    ).length,
    review_items: reviewItems,
    blockers,
    reversible: true as const,
  };
  return {
    ...payload,
    preview_digest: digestValue(payload),
  };
}

export async function previewPersonMerge(
  pool: Pool,
  auth: AuthContext,
  sourcePersonId: string,
  targetPersonId: string,
): Promise<PersonMergePreview> {
  return buildPreview(
    pool,
    auth.accountId,
    sourcePersonId,
    targetPersonId,
  );
}

async function countNewRelationshipDependencies(
  queryable: Queryable,
  accountId: string,
  operation: MergeOperationRow,
): Promise<number> {
  const result = await queryable.query<{ count: number }>(
    `SELECT (
       (
         SELECT COUNT(*)
         FROM captures
         WHERE account_id = $1
           AND assignment_id = ANY($2::uuid[])
           AND status = 'active'
           AND NOT (id = ANY($3::uuid[]))
       )
       +
       (
         SELECT COUNT(*)
         FROM confirmed_states
         WHERE account_id = $1
           AND assignment_id = ANY($2::uuid[])
           AND NOT (id = ANY($4::uuid[]))
       )
       +
       (
         SELECT COUNT(*)
         FROM research_tasks
         WHERE account_id = $1
           AND assignment_id = ANY($2::uuid[])
           AND status <> 'deleted'
           AND NOT (id = ANY($5::uuid[]))
       )
     )::integer AS count`,
    [
      accountId,
      operation.affected_assignment_ids,
      operation.affected_capture_ids,
      operation.affected_state_ids,
      operation.affected_research_task_ids,
    ],
  );
  return result.rows[0]?.count ?? 0;
}

async function countContextOwnershipMismatches(
  queryable: Queryable,
  accountId: string,
  operation: MergeOperationRow,
): Promise<number> {
  const result = await queryable.query<{ count: number }>(
    `SELECT COUNT(*)::integer AS count
     FROM unnest($2::uuid[]) AS moved(context_id)
     WHERE NOT EXISTS (
       SELECT 1
       FROM assignments
       WHERE assignments.account_id = $1
         AND assignments.id = moved.context_id
         AND assignments.subject_id = $3
         AND assignments.status = 'active'
     )`,
    [
      accountId,
      operation.affected_assignment_ids,
      operation.target_subject_id,
    ],
  );
  return result.rows[0]?.count ?? 0;
}

export async function previewPersonMergeReversal(
  pool: Pool,
  auth: AuthContext,
  operationId: string,
): Promise<PersonMergeReversalPreview> {
  const operationResult = await pool.query<MergeOperationRow>(
    `SELECT
       id, source_subject_id, target_subject_id, status, reason,
       affected_assignment_ids, affected_capture_ids,
       affected_state_ids, affected_handle_ids,
       affected_research_task_ids, invalidated_snapshot_ids,
       decided_at, reversed_at
     FROM person_merge_operations
     WHERE account_id = $1 AND id = $2`,
    [auth.accountId, operationId],
  );
  const operation = operationResult.rows[0];
  if (!operation) {
    throw new ApiError(
      404,
      "PERSON_MERGE_OPERATION_NOT_FOUND",
      "The person merge operation was not found.",
    );
  }
  const people = await pool.query<PersonRow>(
    `SELECT
       id, display_label, status, version, merged_into_subject_id
     FROM subjects
     WHERE account_id = $1
       AND id = ANY($2::uuid[])
     ORDER BY id`,
    [
      auth.accountId,
      [operation.source_subject_id, operation.target_subject_id],
    ],
  );
  const source = people.rows.find(
    (person) => person.id === operation.source_subject_id,
  );
  const target = people.rows.find(
    (person) => person.id === operation.target_subject_id,
  );
  if (!source || !target) {
    throw new ApiError(
      409,
      "PERSON_MERGE_REVERSAL_STALE",
      "The people recorded by this merge are no longer available for reversal review.",
    );
  }
  const contexts = await pool.query<ContextRow>(
    `SELECT
       assignments.id,
       assignments.display_label,
       (
         SELECT COUNT(*)::integer
         FROM captures
         WHERE captures.account_id = assignments.account_id
           AND captures.assignment_id = assignments.id
           AND captures.status = 'active'
       ) AS active_capture_count,
       (
         SELECT COUNT(*)::integer
         FROM confirmed_states
         WHERE confirmed_states.account_id = assignments.account_id
           AND confirmed_states.assignment_id = assignments.id
       ) AS active_fact_count
     FROM assignments
     WHERE assignments.account_id = $1
       AND assignments.id = ANY($2::uuid[])
     ORDER BY array_position($2::uuid[], assignments.id)`,
    [auth.accountId, operation.affected_assignment_ids],
  );
  const blockers: PersonMergeReversalPreview["blockers"] = [];
  if (operation.status === "reversed") {
    blockers.push({
      code: "operation_already_reversed",
      message: "This merge was already reversed.",
      count: 1,
    });
  } else {
    const identityStateChanged =
      source.status !== "merged" ||
      source.merged_into_subject_id !== target.id ||
      target.status !== "active";
    const ownershipMismatch = await countContextOwnershipMismatches(
      pool,
      auth.accountId,
      operation,
    );
    if (identityStateChanged || ownershipMismatch > 0) {
      blockers.push({
        code: "identity_state_changed",
        message:
          "Person identity or relationship ownership changed after this merge. Review the current state before splitting it.",
        count: Math.max(1, ownershipMismatch),
      });
    } else {
      const newDependencyCount =
        await countNewRelationshipDependencies(
          pool,
          auth.accountId,
          operation,
        );
      if (newDependencyCount > 0) {
        blockers.push({
          code: "new_relationship_dependencies",
          message:
            "New evidence or state now depends on a moved relationship context. Review it before splitting the people.",
          count: newDependencyCount,
        });
      }
    }
  }
  return {
    contract_version: CONTRACT_VERSION,
    operation_id: operation.id,
    status: operation.status,
    source_person: {
      id: source.id,
      display_label: source.display_label,
      status: source.status,
    },
    target_person: {
      id: target.id,
      display_label: target.display_label,
      status: target.status,
    },
    contexts_to_restore: contexts.rows,
    original_reason: operation.reason,
    decided_at: operation.decided_at.toISOString(),
    reversed_at: operation.reversed_at?.toISOString() ?? null,
    blockers,
    reversal_available:
      operation.status === "applied" && blockers.length === 0,
  };
}

async function invalidatePersonKnowledge(
  client: PoolClient,
  accountId: string,
  personIds: string[],
): Promise<string[]> {
  const invalidated = await client.query<{ id: string }>(
    `UPDATE knowledge_snapshots
     SET status = 'superseded'
     WHERE account_id = $1
       AND subject_id = ANY($2::uuid[])
       AND status IN ('published', 'draft', 'abstained')
     RETURNING id`,
    [accountId, personIds],
  );
  const ids = invalidated.rows.map((row) => row.id);
  if (ids.length > 0) {
    await client.query(
      `UPDATE context_manifests
       SET status = 'superseded'
       WHERE account_id = $1
         AND knowledge_snapshot_id = ANY($2::uuid[])
         AND status = 'active'`,
      [accountId, ids],
    );
  }
  return ids;
}

export async function mergePeople(
  pool: Pool,
  auth: AuthContext,
  request: PersonMergeRequest,
): Promise<PersonMergeMutationResult> {
  return inTransaction(pool, async (client) => {
    const idempotency = await claimIdempotency(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "merge_people",
      request.idempotency_key,
      request,
    );
    if (idempotency.replay) {
      return {
        body: idempotency.replay.body as PersonMergeResponse,
        replayed: true,
        status: idempotency.replay.status,
      };
    }
    const preview = await buildPreview(
      client,
      auth.accountId,
      request.source_person_id,
      request.target_person_id,
      true,
    );
    if (
      preview.source_person.version !== request.expected_source_version ||
      preview.target_person.version !== request.expected_target_version ||
      preview.preview_digest !== request.expected_preview_digest
    ) {
      throw new ApiError(
        409,
        "PERSON_MERGE_PREVIEW_STALE",
        "The people or their review evidence changed after the merge preview.",
        { current_preview: preview },
      );
    }
    if (preview.blockers.length > 0) {
      throw new ApiError(
        409,
        "PERSON_MERGE_BLOCKED",
        "Resolve the merge blockers before changing identity.",
        { blockers: preview.blockers },
      );
    }
    const decidedAt = new Date();
    const operationId = randomUUID();
    const contextIds = preview.contexts_to_move.map((context) => context.id);
    const captures = await client.query<{ id: string }>(
      `SELECT id
       FROM captures
       WHERE account_id = $1
         AND subject_id = $2
         AND status = 'active'
       ORDER BY id
       FOR UPDATE`,
      [auth.accountId, request.source_person_id],
    );
    const captureIds = captures.rows.map((row) => row.id);
    const states = await client.query<{ id: string }>(
      `SELECT id
       FROM confirmed_states
       WHERE account_id = $1
         AND subject_id = $2
         AND assignment_id = ANY($3::uuid[])
       ORDER BY id
       FOR UPDATE`,
      [auth.accountId, request.source_person_id, contextIds],
    );
    const stateIds = states.rows.map((row) => row.id);
    const handles = await client.query<{ id: string }>(
      `SELECT id
       FROM identity_handles
       WHERE account_id = $1
         AND subject_id = $2
         AND status IN ('proposed', 'confirmed', 'expired')
       ORDER BY id
       FOR UPDATE`,
      [auth.accountId, request.source_person_id],
    );
    const handleIds = handles.rows.map((row) => row.id);
    const researchTasks = await client.query<{ id: string }>(
      `SELECT id
       FROM research_tasks
       WHERE account_id = $1
         AND subject_id = $2
         AND status <> 'deleted'
       ORDER BY id
       FOR UPDATE`,
      [auth.accountId, request.source_person_id],
    );
    const researchTaskIds = researchTasks.rows.map((row) => row.id);
    const invalidated = await invalidatePersonKnowledge(
      client,
      auth.accountId,
      [request.source_person_id, request.target_person_id],
    );

    await client.query(
      `UPDATE assignments
       SET subject_id = $3
       WHERE account_id = $1
         AND id = ANY($2::uuid[])`,
      [auth.accountId, contextIds, request.target_person_id],
    );
    await client.query(
      `UPDATE captures
       SET subject_id = $3,
           version = version + 1,
           updated_at = $4
       WHERE account_id = $1
         AND id = ANY($2::uuid[])`,
      [auth.accountId, captureIds, request.target_person_id, decidedAt],
    );
    await client.query(
      `UPDATE confirmed_states
       SET subject_id = $3
       WHERE account_id = $1
         AND id = ANY($2::uuid[])`,
      [auth.accountId, stateIds, request.target_person_id],
    );
    await client.query(
      `UPDATE identity_handles
       SET subject_id = $3,
           updated_at = $4
       WHERE account_id = $1
         AND id = ANY($2::uuid[])`,
      [auth.accountId, handleIds, request.target_person_id, decidedAt],
    );
    await client.query(
      `UPDATE research_tasks
       SET subject_id = $3,
           updated_at = $4
       WHERE account_id = $1
         AND id = ANY($2::uuid[])`,
      [auth.accountId, researchTaskIds, request.target_person_id, decidedAt],
    );
    const sourceUpdated = await client.query<{ version: number }>(
      `UPDATE subjects
       SET status = 'merged',
           merged_into_subject_id = $3,
           merged_at = $4,
           version = version + 1
       WHERE account_id = $1 AND id = $2
       RETURNING version`,
      [
        auth.accountId,
        request.source_person_id,
        request.target_person_id,
        decidedAt,
      ],
    );
    const targetUpdated = await client.query<{ version: number }>(
      `UPDATE subjects
       SET version = version + 1
       WHERE account_id = $1 AND id = $2
       RETURNING version`,
      [auth.accountId, request.target_person_id],
    );
    await client.query(
      `INSERT INTO person_merge_operations(
         id, account_id, source_subject_id, target_subject_id,
         decided_by_user_id, source_version, target_version,
         preview_digest, reason, status, affected_assignment_ids,
         affected_capture_ids, affected_state_ids, affected_handle_ids,
         affected_research_task_ids, invalidated_snapshot_ids, decided_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, 'applied',
         $10, $11, $12, $13, $14, $15, $16
       )`,
      [
        operationId,
        auth.accountId,
        request.source_person_id,
        request.target_person_id,
        auth.userId,
        request.expected_source_version,
        request.expected_target_version,
        request.expected_preview_digest,
        request.reason,
        contextIds,
        captureIds,
        stateIds,
        handleIds,
        researchTaskIds,
        invalidated,
        decidedAt,
      ],
    );
    const targetContexts = await client.query<{ id: string }>(
      `SELECT id
       FROM assignments
       WHERE account_id = $1
         AND subject_id = $2
         AND status = 'active'
       ORDER BY id`,
      [auth.accountId, request.target_person_id],
    );
    const body: PersonMergeResponse = {
      contract_version: CONTRACT_VERSION,
      operation_id: operationId,
      status: "applied",
      source_person_id: request.source_person_id,
      target_person_id: request.target_person_id,
      source_person_version: sourceUpdated.rows[0]?.version ?? 2,
      target_person_version: targetUpdated.rows[0]?.version ?? 2,
      affected_relationship_context_ids: contextIds,
      relationship_context_ids_requiring_recompilation:
        targetContexts.rows.map((context) => context.id),
      captures_rebound: captureIds.length,
      states_rebound: stateIds.length,
      identity_handles_rebound: handleIds.length,
      research_tasks_rebound: researchTaskIds.length,
      knowledge_snapshots_invalidated: invalidated,
      reversal_available: true,
      decided_at: decidedAt.toISOString(),
      reversed_at: null,
    };
    await appendAudit(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "identity.people_merged",
      "subject",
      request.target_person_id,
      {
        operation_id: operationId,
        source_person_id: request.source_person_id,
        target_person_id: request.target_person_id,
        affected_relationship_context_ids: contextIds,
        captures_rebound: captureIds.length,
        states_rebound: stateIds.length,
        identity_handles_rebound: handleIds.length,
        research_tasks_rebound: researchTaskIds.length,
        reason: request.reason,
      },
    );
    await completeIdempotency(client, idempotency, 201, body);
    return { body, replayed: false, status: 201 };
  });
}

export async function reversePersonMerge(
  pool: Pool,
  auth: AuthContext,
  operationId: string,
  request: PersonMergeReversalRequest,
): Promise<PersonMergeMutationResult> {
  return inTransaction(pool, async (client) => {
    const idempotency = await claimIdempotency(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      `reverse_person_merge:${operationId}`,
      request.idempotency_key,
      request,
    );
    if (idempotency.replay) {
      return {
        body: idempotency.replay.body as PersonMergeResponse,
        replayed: true,
        status: idempotency.replay.status,
      };
    }
    const operationResult = await client.query<MergeOperationRow>(
      `SELECT
         id, source_subject_id, target_subject_id, status, reason,
         affected_assignment_ids, affected_capture_ids,
         affected_state_ids, affected_handle_ids,
         affected_research_task_ids, invalidated_snapshot_ids,
         decided_at, reversed_at
       FROM person_merge_operations
       WHERE account_id = $1 AND id = $2
       FOR UPDATE`,
      [auth.accountId, operationId],
    );
    const operation = operationResult.rows[0];
    if (!operation) {
      throw new ApiError(
        404,
        "PERSON_MERGE_OPERATION_NOT_FOUND",
        "The person merge operation was not found.",
      );
    }
    if (operation.status !== "applied") {
      throw new ApiError(
        409,
        "PERSON_MERGE_ALREADY_REVERSED",
        "This person merge was already reversed.",
      );
    }
    const people = await client.query<PersonRow>(
      `SELECT
         id, display_label, status, version, merged_into_subject_id
       FROM subjects
       WHERE account_id = $1
         AND id = ANY($2::uuid[])
       ORDER BY id
       FOR UPDATE`,
      [
        auth.accountId,
        [operation.source_subject_id, operation.target_subject_id],
      ],
    );
    const source = people.rows.find(
      (person) => person.id === operation.source_subject_id,
    );
    const target = people.rows.find(
      (person) => person.id === operation.target_subject_id,
    );
    if (
      !source ||
      !target ||
      source.status !== "merged" ||
      source.merged_into_subject_id !== target.id ||
      target.status !== "active"
    ) {
      throw new ApiError(
        409,
        "PERSON_MERGE_REVERSAL_STALE",
        "The person identities changed after this merge and cannot be reversed automatically.",
      );
    }
    const ownershipMismatch = await countContextOwnershipMismatches(
      client,
      auth.accountId,
      operation,
    );
    if (ownershipMismatch > 0) {
      throw new ApiError(
        409,
        "PERSON_MERGE_REVERSAL_STALE",
        "Relationship ownership changed after this merge and cannot be reversed automatically.",
        { relationship_context_mismatch_count: ownershipMismatch },
      );
    }
    const newDependencyCount =
      await countNewRelationshipDependencies(
        client,
        auth.accountId,
        operation,
      );
    if (newDependencyCount > 0) {
      throw new ApiError(
        409,
        "PERSON_MERGE_REVERSAL_REVIEW_REQUIRED",
        "New evidence or state now depends on a moved relationship context. Review it before splitting the people.",
        { new_dependency_count: newDependencyCount },
      );
    }
    const reversedAt = new Date();
    const invalidated = await invalidatePersonKnowledge(
      client,
      auth.accountId,
      [source.id, target.id],
    );
    const sourceUpdated = await client.query<{ version: number }>(
      `UPDATE subjects
       SET status = 'active',
           merged_into_subject_id = NULL,
           merged_at = NULL,
           version = version + 1
       WHERE account_id = $1 AND id = $2
       RETURNING version`,
      [auth.accountId, source.id],
    );
    await client.query(
      `UPDATE assignments
       SET subject_id = $3
       WHERE account_id = $1
         AND id = ANY($2::uuid[])`,
      [auth.accountId, operation.affected_assignment_ids, source.id],
    );
    await client.query(
      `UPDATE captures
       SET subject_id = $3,
           version = version + 1,
           updated_at = $4
       WHERE account_id = $1
         AND id = ANY($2::uuid[])`,
      [auth.accountId, operation.affected_capture_ids, source.id, reversedAt],
    );
    await client.query(
      `UPDATE confirmed_states
       SET subject_id = $3
       WHERE account_id = $1
         AND id = ANY($2::uuid[])`,
      [auth.accountId, operation.affected_state_ids, source.id],
    );
    await client.query(
      `UPDATE identity_handles
       SET subject_id = $3,
           updated_at = $4
       WHERE account_id = $1
         AND id = ANY($2::uuid[])`,
      [auth.accountId, operation.affected_handle_ids, source.id, reversedAt],
    );
    await client.query(
      `UPDATE research_tasks
       SET subject_id = $3,
           updated_at = $4
       WHERE account_id = $1
         AND id = ANY($2::uuid[])`,
      [
        auth.accountId,
        operation.affected_research_task_ids,
        source.id,
        reversedAt,
      ],
    );
    const targetUpdated = await client.query<{ version: number }>(
      `UPDATE subjects
       SET version = version + 1
       WHERE account_id = $1 AND id = $2
       RETURNING version`,
      [auth.accountId, target.id],
    );
    await client.query(
      `UPDATE person_merge_operations
       SET status = 'reversed',
           reversed_by_user_id = $3,
           reversal_reason = $4,
           reversed_at = $5
       WHERE account_id = $1 AND id = $2`,
      [auth.accountId, operation.id, auth.userId, request.reason, reversedAt],
    );
    const activeContexts = await client.query<{ id: string }>(
      `SELECT id
       FROM assignments
       WHERE account_id = $1
         AND subject_id = ANY($2::uuid[])
         AND status = 'active'
       ORDER BY id`,
      [auth.accountId, [source.id, target.id]],
    );
    const body: PersonMergeResponse = {
      contract_version: CONTRACT_VERSION,
      operation_id: operation.id,
      status: "reversed",
      source_person_id: source.id,
      target_person_id: target.id,
      source_person_version: sourceUpdated.rows[0]?.version ?? source.version + 1,
      target_person_version: targetUpdated.rows[0]?.version ?? target.version + 1,
      affected_relationship_context_ids:
        operation.affected_assignment_ids,
      relationship_context_ids_requiring_recompilation:
        activeContexts.rows.map((context) => context.id),
      captures_rebound: operation.affected_capture_ids.length,
      states_rebound: operation.affected_state_ids.length,
      identity_handles_rebound: operation.affected_handle_ids.length,
      research_tasks_rebound:
        operation.affected_research_task_ids.length,
      knowledge_snapshots_invalidated: invalidated,
      reversal_available: false,
      decided_at: operation.decided_at.toISOString(),
      reversed_at: reversedAt.toISOString(),
    };
    await appendAudit(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "identity.people_merge_reversed",
      "subject",
      source.id,
      {
        operation_id: operation.id,
        source_person_id: source.id,
        target_person_id: target.id,
        reason: request.reason,
        affected_relationship_context_ids:
          operation.affected_assignment_ids,
      },
    );
    await completeIdempotency(client, idempotency, 201, body);
    return { body, replayed: false, status: 201 };
  });
}
