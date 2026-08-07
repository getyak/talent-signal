import { randomUUID } from "node:crypto";

import {
  CONTRACT_VERSION,
  type CaptureIdentityCorrectionRequest,
  type CaptureIdentityCorrectionResponse,
  type RelationshipContextIntent,
} from "@talent-signal/contracts";
import type { Pool, PoolClient } from "pg";

import { inTransaction } from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import { appendAudit } from "../lib/audit.js";
import {
  claimIdempotency,
  completeIdempotency,
} from "../lib/idempotency.js";
import type { AuthContext } from "./auth.js";

interface BoundCaptureRow {
  id: string;
  subject_id: string | null;
  assignment_id: string | null;
  identity_status: "bound" | "ambiguous" | "unbound";
  status: "active" | "deleted";
  version: number;
}

interface IdentityCorrectionMutationResult {
  body: CaptureIdentityCorrectionResponse;
  replayed: boolean;
  status: number;
}

async function createRelationshipContext(
  client: PoolClient,
  accountId: string,
  personId: string,
  decisionId: string,
  context: Extract<
    RelationshipContextIntent,
    { status: "proposed" }
  >,
): Promise<string> {
  const relationshipContextId = randomUUID();
  await client.query(
    `INSERT INTO assignments(
       id, account_id, subject_id, external_ref, display_label, status
     )
     VALUES ($1, $2, $3, $4, $5, 'active')`,
    [
      relationshipContextId,
      accountId,
      personId,
      `identity-correction-context:${decisionId}`,
      context.label,
    ],
  );
  return relationshipContextId;
}

async function resolveExistingRelationshipContext(
  client: PoolClient,
  accountId: string,
  personId: string,
  relationshipContextId: string,
): Promise<string> {
  const context = await client.query<{ id: string }>(
    `SELECT assignments.id
     FROM assignments
     JOIN subjects
       ON subjects.account_id = assignments.account_id
      AND subjects.id = assignments.subject_id
     WHERE assignments.account_id = $1
       AND assignments.id = $2
       AND assignments.subject_id = $3
       AND assignments.status = 'active'
       AND subjects.status = 'active'
     FOR UPDATE OF assignments, subjects`,
    [accountId, relationshipContextId, personId],
  );
  if (!context.rows[0]) {
    throw new ApiError(
      404,
      "IDENTITY_CORRECTION_CONTEXT_NOT_FOUND",
      "The selected relationship context does not belong to the selected person.",
    );
  }
  return context.rows[0].id;
}

async function resolveTarget(
  client: PoolClient,
  accountId: string,
  decisionId: string,
  target: CaptureIdentityCorrectionRequest["target"],
): Promise<{ personId: string; relationshipContextId: string }> {
  let personId: string;
  if (target.status === "new_person") {
    personId = randomUUID();
    await client.query(
      `INSERT INTO subjects(
         id, account_id, external_ref, display_label, status
       )
       VALUES ($1, $2, $3, $4, 'active')`,
      [
        personId,
        accountId,
        `identity-correction-person:${decisionId}`,
        target.display_label,
      ],
    );
  } else {
    const person = await client.query<{ id: string }>(
      `SELECT id
       FROM subjects
       WHERE account_id = $1
         AND id = $2
         AND status = 'active'
       FOR UPDATE`,
      [accountId, target.person_id],
    );
    if (!person.rows[0]) {
      throw new ApiError(
        404,
        "IDENTITY_CORRECTION_PERSON_NOT_FOUND",
        "The selected person is unavailable in this account.",
      );
    }
    personId = person.rows[0].id;
  }

  const relationshipContextId =
    target.relationship_context.status === "existing"
      ? await resolveExistingRelationshipContext(
          client,
          accountId,
          personId,
          target.relationship_context.relationship_context_id,
        )
      : await createRelationshipContext(
          client,
          accountId,
          personId,
          decisionId,
          target.relationship_context,
        );
  return { personId, relationshipContextId };
}

async function loadLineageCaptureIds(
  client: PoolClient,
  accountId: string,
  rootCaptureId: string,
): Promise<string[]> {
  const lineage = await client.query<{ capture_id: string }>(
    `WITH RECURSIVE resource_lineage AS (
       SELECT resources.id, resources.capture_id
       FROM source_resources resources
       WHERE resources.account_id = $1
         AND resources.capture_id = $2
         AND resources.processing_state <> 'deleted'
       UNION
       SELECT children.id, children.capture_id
       FROM source_resources children
       JOIN resource_lineage parents
         ON children.discovered_from_resource_id = parents.id
       WHERE children.account_id = $1
         AND children.processing_state <> 'deleted'
     )
     SELECT DISTINCT capture_id
     FROM resource_lineage
     ORDER BY capture_id`,
    [accountId, rootCaptureId],
  );
  const captureIds = lineage.rows.map((row) => row.capture_id);
  return captureIds.length > 0 ? captureIds : [rootCaptureId];
}

async function invalidateKnowledge(
  client: PoolClient,
  accountId: string,
  captureIds: string[],
  scopes: Array<{ personId: string; relationshipContextId: string }>,
): Promise<string[]> {
  const snapshots = await client.query<{ id: string }>(
    `SELECT DISTINCT snapshot_id AS id
     FROM (
       SELECT blocks.snapshot_id
       FROM evidence_fragments fragments
       JOIN knowledge_dependencies dependencies
         ON dependencies.account_id = fragments.account_id
        AND dependencies.dependency_type = 'evidence_fragment'
        AND dependencies.dependency_id = fragments.id
       JOIN knowledge_blocks blocks
         ON blocks.account_id = dependencies.account_id
        AND blocks.id = dependencies.block_id
       WHERE fragments.account_id = $1
         AND fragments.capture_id = ANY($2::uuid[])
       UNION
       SELECT knowledge.id AS snapshot_id
       FROM knowledge_snapshots knowledge
       JOIN jsonb_to_recordset($3::jsonb)
         AS scopes(subject_id uuid, assignment_id uuid)
         ON knowledge.subject_id = scopes.subject_id
        AND knowledge.assignment_id = scopes.assignment_id
       WHERE knowledge.account_id = $1
         AND knowledge.status IN ('published', 'draft', 'abstained')
     ) governed_snapshots
     ORDER BY snapshot_id`,
    [
      accountId,
      captureIds,
      JSON.stringify(
        scopes.map((scope) => ({
          subject_id: scope.personId,
          assignment_id: scope.relationshipContextId,
        })),
      ),
    ],
  );
  const snapshotIds = snapshots.rows.map((snapshot) => snapshot.id);
  if (snapshotIds.length === 0) {
    return [];
  }
  await client.query(
    `UPDATE knowledge_snapshots
     SET status = 'superseded'
     WHERE account_id = $1
       AND id = ANY($2::uuid[])
       AND status IN ('published', 'draft', 'abstained')`,
    [accountId, snapshotIds],
  );
  await client.query(
    `UPDATE context_manifests
     SET status = 'superseded'
     WHERE account_id = $1
       AND knowledge_snapshot_id = ANY($2::uuid[])
       AND status = 'active'`,
    [accountId, snapshotIds],
  );
  await client.query(
    `UPDATE idempotency_records
     SET response_body = '{"invalidated":true}'::jsonb
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
    [accountId, snapshotIds],
  );
  return snapshotIds;
}

export async function correctCaptureIdentity(
  pool: Pool,
  auth: AuthContext,
  rootCaptureId: string,
  request: CaptureIdentityCorrectionRequest,
): Promise<IdentityCorrectionMutationResult> {
  return inTransaction(pool, async (client) => {
    const idempotency = await claimIdempotency(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      `correct_capture_identity:${rootCaptureId}`,
      request.idempotency_key,
      request,
    );
    if (idempotency.replay) {
      return {
        body:
          idempotency.replay
            .body as CaptureIdentityCorrectionResponse,
        replayed: true,
        status: idempotency.replay.status,
      };
    }

    const rootResult = await client.query<BoundCaptureRow>(
      `SELECT
         id, subject_id, assignment_id, identity_status, status, version
       FROM captures
       WHERE account_id = $1 AND id = $2
       FOR UPDATE`,
      [auth.accountId, rootCaptureId],
    );
    const root = rootResult.rows[0];
    if (!root) {
      throw new ApiError(
        404,
        "IDENTITY_CORRECTION_CAPTURE_NOT_FOUND",
        "The source capture was not found.",
      );
    }
    if (root.status === "deleted") {
      throw new ApiError(
        410,
        "IDENTITY_CORRECTION_CAPTURE_DELETED",
        "A deleted source cannot be rebound.",
      );
    }
    if (
      root.identity_status !== "bound" ||
      !root.subject_id ||
      !root.assignment_id
    ) {
      throw new ApiError(
        409,
        "IDENTITY_CORRECTION_REQUIRES_BOUND_SOURCE",
        "Use the identity review queue for an unbound or ambiguous source.",
      );
    }
    if (
      root.version !== request.expected_capture_version ||
      root.subject_id !== request.expected_person_id ||
      root.assignment_id !== request.expected_relationship_context_id
    ) {
      throw new ApiError(
        409,
        "IDENTITY_CORRECTION_STALE",
        "The source identity changed before this correction.",
        {
          current_capture_version: root.version,
          current_person_id: root.subject_id,
          current_relationship_context_id: root.assignment_id,
        },
      );
    }

    const decisionId = randomUUID();
    const target = await resolveTarget(
      client,
      auth.accountId,
      decisionId,
      request.target,
    );
    if (
      target.personId === root.subject_id &&
      target.relationshipContextId === root.assignment_id
    ) {
      throw new ApiError(
        409,
        "IDENTITY_CORRECTION_TARGET_UNCHANGED",
        "Choose a different person or relationship context.",
      );
    }
    const affectedPersonIds = [
      ...new Set([root.subject_id, target.personId]),
    ];
    const touchedPeople = await client.query(
      `UPDATE subjects
       SET version = version + 1
       WHERE account_id = $1
         AND id = ANY($2::uuid[])
         AND status = 'active'
       RETURNING id`,
      [auth.accountId, affectedPersonIds],
    );
    if (touchedPeople.rowCount !== affectedPersonIds.length) {
      throw new ApiError(
        409,
        "IDENTITY_CORRECTION_PERSON_CHANGED",
        "A selected person changed while the source identity was being corrected.",
      );
    }

    const captureIds = await loadLineageCaptureIds(
      client,
      auth.accountId,
      rootCaptureId,
    );
    const lineageCaptures = await client.query<BoundCaptureRow>(
      `SELECT
         id, subject_id, assignment_id, identity_status, status, version
       FROM captures
       WHERE account_id = $1
         AND id = ANY($2::uuid[])
       ORDER BY id
       FOR UPDATE`,
      [auth.accountId, captureIds],
    );
    if (
      lineageCaptures.rows.length !== captureIds.length ||
      lineageCaptures.rows.some(
        (capture) =>
          capture.status !== "active" ||
          capture.identity_status !== "bound" ||
          capture.subject_id !== root.subject_id ||
          capture.assignment_id !== root.assignment_id,
      )
    ) {
      throw new ApiError(
        409,
        "IDENTITY_CORRECTION_LINEAGE_DIVERGED",
        "A source discovered from this capture now belongs to a different identity scope; review the lineage before moving it.",
      );
    }

    const unresolvedEffects = await client.query<{ id: string }>(
      `SELECT id
       FROM action_proposals
       WHERE account_id = $1
         AND capture_id = ANY($2::uuid[])
         AND status IN ('executing', 'unknown')
       LIMIT 1`,
      [auth.accountId, captureIds],
    );
    if (unresolvedEffects.rows[0]) {
      throw new ApiError(
        409,
        "IDENTITY_CORRECTION_RECONCILIATION_REQUIRED",
        "Reconcile the in-flight or unknown external effect before changing identity.",
      );
    }

    const decidedAt = new Date();
    const priorStates = await client.query<{ prior_state_id: string }>(
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
         WHERE NOT (
             candidate_assertion.capture_id = ANY($2::uuid[])
           )
           AND candidate.status = 'superseded'
           AND candidate.value_text IS NOT NULL
       )
       SELECT prior_state_id
       FROM surviving_prior
       WHERE candidate_rank = 1`,
      [auth.accountId, captureIds],
    );
    const priorStateIds = [
      ...new Set(priorStates.rows.map((state) => state.prior_state_id)),
    ];

    const retractedStates = await client.query<{ id: string }>(
      `UPDATE confirmed_states states
       SET status = 'retracted',
           valid_until = COALESCE(states.valid_until, $3)
       FROM proposed_assertions assertions
       WHERE assertions.account_id = $1
         AND assertions.capture_id = ANY($2::uuid[])
         AND states.account_id = assertions.account_id
         AND states.source_assertion_id = assertions.id
         AND states.status <> 'deleted'
         AND states.status <> 'retracted'
       RETURNING states.id`,
      [auth.accountId, captureIds, decidedAt],
    );
    const reopenedPriorStates =
      priorStateIds.length === 0
        ? { rows: [] as Array<{ id: string }> }
        : await client.query<{ id: string }>(
            `UPDATE confirmed_states
             SET status = 'contested'
             WHERE account_id = $1
               AND id = ANY($2::uuid[])
               AND status = 'superseded'
             RETURNING id`,
            [auth.accountId, priorStateIds],
          );

    await client.query(
      `UPDATE action_approvals approvals
       SET status = 'revoked',
           revoked_at = $3,
           revocation_reason = 'Source identity was corrected.'
       FROM action_proposals actions
       WHERE actions.account_id = $1
         AND actions.capture_id = ANY($2::uuid[])
         AND approvals.account_id = actions.account_id
         AND approvals.action_id = actions.id
         AND approvals.status = 'active'`,
      [auth.accountId, captureIds, decidedAt],
    );
    const revokedActions = await client.query<{ id: string }>(
      `UPDATE action_proposals
       SET status = 'revoked',
           version = version + 1,
           updated_at = $3
       WHERE account_id = $1
         AND capture_id = ANY($2::uuid[])
         AND status IN ('proposed', 'approved', 'failed')
       RETURNING id`,
      [auth.accountId, captureIds, decidedAt],
    );
    const completedActions = await client.query<{ count: number }>(
      `SELECT COUNT(*)::integer AS count
       FROM action_proposals
       WHERE account_id = $1
         AND capture_id = ANY($2::uuid[])
         AND status = 'completed'`,
      [auth.accountId, captureIds],
    );

    const snapshotsInvalidated = await invalidateKnowledge(
      client,
      auth.accountId,
      captureIds,
      [
        {
          personId: root.subject_id,
          relationshipContextId: root.assignment_id,
        },
        {
          personId: target.personId,
          relationshipContextId: target.relationshipContextId,
        },
      ],
    );

    await client.query(
      `UPDATE captures
       SET subject_id = $3,
           assignment_id = $4,
           identity_status = 'bound',
           version = version + 1,
           updated_at = $5
       WHERE account_id = $1
         AND id = ANY($2::uuid[])`,
      [
        auth.accountId,
        captureIds,
        target.personId,
        target.relationshipContextId,
        decidedAt,
      ],
    );
    await client.query(
      `UPDATE identity_resolution_cases
       SET status = 'superseded',
           version = version + 1,
           updated_at = $3
       WHERE account_id = $1
         AND capture_id = ANY($2::uuid[])
         AND status IN ('pending', 'resolved')`,
      [auth.accountId, captureIds, decidedAt],
    );
    await client.query(
      `UPDATE research_tasks
       SET subject_id = $3,
           assignment_id = $4
       WHERE account_id = $1
         AND seed_resource_id IN (
           SELECT id
           FROM source_resources
           WHERE account_id = $1
             AND capture_id = ANY($2::uuid[])
         )`,
      [
        auth.accountId,
        captureIds,
        target.personId,
        target.relationshipContextId,
      ],
    );
    const returnedHandles = await client.query<{ id: string }>(
      `UPDATE identity_handles
       SET subject_id = $3,
           status = 'proposed',
           confirmed_by_user_id = NULL,
           valid_until = NULL,
           updated_at = $4
       WHERE account_id = $1
         AND source_resource_id IN (
           SELECT id
           FROM source_resources
           WHERE account_id = $1
             AND capture_id = ANY($2::uuid[])
         )
         AND status IN ('proposed', 'confirmed', 'expired')
       RETURNING id`,
      [auth.accountId, captureIds, target.personId, decidedAt],
    );

    const reopenedClaims = await client.query<{ id: string }>(
      `WITH claim_targets AS (
         SELECT
           assertions.id,
           active.id AS active_state_id,
           active.value_text AS active_value
         FROM proposed_assertions assertions
         LEFT JOIN confirmed_states active
           ON active.account_id = assertions.account_id
          AND active.assignment_id = $3
          AND active.field = assertions.field
          AND active.status = 'active'
         WHERE assertions.account_id = $1
           AND assertions.capture_id = ANY($2::uuid[])
           AND assertions.evidence_fragment_id IS NOT NULL
           AND assertions.review_status <> 'deleted'
       )
       UPDATE proposed_assertions assertions
       SET review_status = 'pending',
           proposal_status = CASE
             WHEN targets.active_state_id IS NULL THEN 'proposed'
             WHEN targets.active_value = assertions.proposed_value THEN 'proposed'
             ELSE 'ambiguous'
           END,
           temporal_relation = CASE
             WHEN targets.active_state_id IS NULL THEN 'new'
             WHEN targets.active_value = assertions.proposed_value THEN 'reinforces'
             ELSE 'supersedes'
           END,
           supersedes_state_id = targets.active_state_id,
           version = assertions.version + 1
       FROM claim_targets targets
       WHERE assertions.account_id = $1
         AND assertions.id = targets.id
       RETURNING assertions.id`,
      [auth.accountId, captureIds, target.relationshipContextId],
    );

    await client.query(
      `UPDATE source_resources resources
       SET processing_state = CASE
             WHEN EXISTS (
               SELECT 1
               FROM evidence_fragments fragments
               WHERE fragments.account_id = resources.account_id
                 AND fragments.resource_id = resources.id
                 AND fragments.status = 'active'
                 AND fragments.review_status = 'proposed'
             )
             OR EXISTS (
               SELECT 1
               FROM proposed_assertions assertions
               JOIN evidence_fragments fragments
                 ON fragments.account_id = assertions.account_id
                AND fragments.id = assertions.evidence_fragment_id
               WHERE assertions.account_id = resources.account_id
                 AND fragments.resource_id = resources.id
                 AND assertions.review_status IN ('pending', 'unresolved')
             )
             THEN 'needs_fact_review'
             ELSE 'ready'
           END,
           updated_at = $3
       WHERE resources.account_id = $1
         AND resources.capture_id = ANY($2::uuid[])
         AND resources.processing_state <> 'deleted'`,
      [auth.accountId, captureIds, decidedAt],
    );

    await client.query(
      `INSERT INTO identity_correction_decisions(
         id, account_id, root_capture_id, decided_by_user_id,
         prior_subject_id, prior_assignment_id, selected_subject_id,
         selected_assignment_id, capture_version, reason, binding_basis,
         affected_capture_ids, states_retracted, claims_reopened,
         actions_revoked, decided_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
         $14, $15, $16
       )`,
      [
        decisionId,
        auth.accountId,
        rootCaptureId,
        auth.userId,
        root.subject_id,
        root.assignment_id,
        target.personId,
        target.relationshipContextId,
        root.version,
        request.reason,
        request.binding_basis,
        captureIds,
        retractedStates.rows.length,
        reopenedClaims.rows.length,
        revokedActions.rows.length,
        decidedAt,
      ],
    );
    const body: CaptureIdentityCorrectionResponse = {
      contract_version: CONTRACT_VERSION,
      decision_id: decisionId,
      root_capture_id: rootCaptureId,
      capture_ids_rebound: captureIds,
      prior_person_id: root.subject_id,
      prior_relationship_context_id: root.assignment_id,
      person_id: target.personId,
      relationship_context_id: target.relationshipContextId,
      root_capture_version: root.version + 1,
      states_retracted: retractedStates.rows.length,
      prior_states_reopened_for_review:
        reopenedPriorStates.rows.length,
      claims_reopened: reopenedClaims.rows.length,
      actions_revoked: revokedActions.rows.length,
      completed_actions_requiring_follow_up:
        completedActions.rows[0]?.count ?? 0,
      identity_handles_returned_to_review:
        returnedHandles.rows.length,
      knowledge_snapshots_invalidated: snapshotsInvalidated,
      decided_at: decidedAt.toISOString(),
    };
    await appendAudit(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "identity.corrected",
      "capture",
      rootCaptureId,
      {
        decision_id: decisionId,
        prior_person_id: root.subject_id,
        prior_relationship_context_id: root.assignment_id,
        person_id: target.personId,
        relationship_context_id: target.relationshipContextId,
        capture_ids_rebound: captureIds,
        states_retracted: body.states_retracted,
        prior_states_reopened_for_review:
          body.prior_states_reopened_for_review,
        claims_reopened: body.claims_reopened,
        actions_revoked: body.actions_revoked,
        completed_actions_requiring_follow_up:
          body.completed_actions_requiring_follow_up,
        knowledge_snapshots_invalidated:
          snapshotsInvalidated,
      },
    );
    await completeIdempotency(client, idempotency, 201, body);
    return { body, replayed: false, status: 201 };
  });
}
