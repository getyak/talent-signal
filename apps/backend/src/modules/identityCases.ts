import { randomUUID } from "node:crypto";

import type {
  IdentityResolutionCase,
  IdentityResolutionDecisionRequest,
  IdentityResolutionDecisionResponse,
  PersonScopeIntent,
  RelationshipContextIntent,
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
import { confirmIdentityHandles } from "./identityHandles.js";

interface CaseRow {
  id: string;
  capture_id: string;
  status:
    | "pending"
    | "resolved"
    | "dismissed"
    | "superseded"
    | "deleted";
  version: number;
  reason: string;
  identity_context: PersonScopeIntent;
  display_name_hint: string | null;
  resolved_subject_id: string | null;
  resolved_assignment_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface CandidateRow {
  subject_id: string;
  display_label: string;
  context_count: number;
  capture_count: number;
  relationship_contexts: Array<{
    id: string;
    display_label: string;
  }>;
  match_reasons: string[];
}

interface CaseSourceRow {
  resource_id: string;
  resource_kind: IdentityResolutionCase["source"]["kind"];
  display_name: string;
  observed_at: Date;
  excerpt: string;
  fragment_count: number;
}

interface LatestDecisionRow {
  decision: NonNullable<
    IdentityResolutionCase["latest_decision"]
  >["decision"];
  reason: string;
  decided_at: Date;
}

export interface IdentityDecisionMutationResult {
  body: IdentityResolutionDecisionResponse;
  replayed: boolean;
  status: number;
}

async function loadCaseRow(
  client: Pool | PoolClient,
  accountId: string,
  caseId: string,
  lock = false,
): Promise<CaseRow> {
  const result = await client.query<CaseRow>(
    `SELECT
       cases.id,
       cases.capture_id,
       cases.status,
       cases.version,
       cases.reason,
       captures.identity_context,
       COALESCE(
         captures.identity_context->>'display_name_hint',
         captures.identity_context->>'display_label'
       ) AS display_name_hint,
       cases.resolved_subject_id,
       cases.resolved_assignment_id,
       cases.created_at,
       cases.updated_at
     FROM identity_resolution_cases cases
     JOIN captures
       ON captures.account_id = cases.account_id
      AND captures.id = cases.capture_id
     WHERE cases.account_id = $1
       AND cases.id = $2
     ${lock ? "FOR UPDATE OF cases, captures" : ""}`,
    [accountId, caseId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ApiError(
      404,
      "IDENTITY_RESOLUTION_CASE_NOT_FOUND",
      "The identity resolution case was not found.",
    );
  }
  if (row.status === "deleted") {
    throw new ApiError(
      410,
      "IDENTITY_RESOLUTION_CASE_DELETED",
      "The source and its identity resolution case were deleted.",
    );
  }
  return row;
}

export async function getIdentityResolutionCase(
  pool: Pool,
  auth: AuthContext,
  caseId: string,
): Promise<IdentityResolutionCase> {
  const row = await loadCaseRow(pool, auth.accountId, caseId);
  const [candidates, source, latestDecision] = await Promise.all([
    pool.query<CandidateRow>(
      `SELECT
         candidates.subject_id,
         subjects.display_label,
         candidates.match_reasons,
         (
           SELECT COUNT(*)::integer
           FROM assignments
           WHERE assignments.account_id = subjects.account_id
             AND assignments.subject_id = subjects.id
             AND assignments.status = 'active'
         ) AS context_count,
         (
           SELECT COUNT(*)::integer
           FROM captures
           WHERE captures.account_id = subjects.account_id
             AND captures.subject_id = subjects.id
             AND captures.status = 'active'
         ) AS capture_count,
         COALESCE(
           (
             SELECT jsonb_agg(
               jsonb_build_object(
                 'id', contexts.id,
                 'display_label', contexts.display_label
               )
               ORDER BY contexts.last_activity_at DESC, contexts.id
             )
             FROM (
               SELECT
                 assignments.id,
                 assignments.display_label,
                 COALESCE(MAX(captures.created_at), assignments.created_at)
                   AS last_activity_at
               FROM assignments
               LEFT JOIN captures
                 ON captures.account_id = assignments.account_id
                AND captures.assignment_id = assignments.id
                AND captures.status = 'active'
               WHERE assignments.account_id = subjects.account_id
                 AND assignments.subject_id = subjects.id
                 AND assignments.status = 'active'
               GROUP BY assignments.id
               ORDER BY last_activity_at DESC, assignments.id
               LIMIT 20
             ) contexts
           ),
           '[]'::jsonb
         ) AS relationship_contexts
       FROM identity_resolution_candidates candidates
       JOIN subjects
         ON subjects.account_id = candidates.account_id
        AND subjects.id = candidates.subject_id
       WHERE candidates.account_id = $1
         AND candidates.case_id = $2
         AND subjects.status = 'active'
       ORDER BY candidates.candidate_order, candidates.id`,
      [auth.accountId, caseId],
    ),
    pool.query<CaseSourceRow>(
      `SELECT
         resources.id AS resource_id,
         resources.resource_kind,
         resources.display_name,
         resources.observed_at,
         (
           SELECT LEFT(fragments.text_content, 4000)
           FROM evidence_fragments fragments
           WHERE fragments.account_id = resources.account_id
             AND fragments.resource_id = resources.id
             AND fragments.status = 'active'
           ORDER BY fragments.sequence, fragments.id
           LIMIT 1
         ) AS excerpt,
         (
           SELECT COUNT(*)::integer
           FROM evidence_fragments fragments
           WHERE fragments.account_id = resources.account_id
             AND fragments.resource_id = resources.id
             AND fragments.status = 'active'
         ) AS fragment_count
       FROM source_resources resources
       WHERE resources.account_id = $1
         AND resources.capture_id = $2
         AND resources.processing_state <> 'deleted'
       ORDER BY resources.created_at, resources.id
       LIMIT 1`,
      [auth.accountId, row.capture_id],
    ),
    pool.query<LatestDecisionRow>(
      `SELECT decision, reason, decided_at
       FROM identity_resolution_decisions
       WHERE account_id = $1
         AND case_id = $2
       ORDER BY decided_at DESC, id DESC
       LIMIT 1`,
      [auth.accountId, caseId],
    ),
  ]);
  const governedSource = source.rows[0];
  if (
    !governedSource ||
    !governedSource.excerpt ||
    governedSource.fragment_count < 1
  ) {
    throw new ApiError(
      409,
      "IDENTITY_RESOLUTION_SOURCE_UNAVAILABLE",
      "The governed source for this identity review is unavailable.",
    );
  }
  const relationshipContext =
    "relationship_context" in row.identity_context
      ? row.identity_context.relationship_context ?? null
      : null;
  const lastDecision = latestDecision.rows[0] ?? null;
  return {
    id: row.id,
    capture_id: row.capture_id,
    status: row.status as IdentityResolutionCase["status"],
    version: row.version,
    reason: row.reason,
    display_name_hint: row.display_name_hint,
    relationship_context: relationshipContext,
    source: {
      resource_id: governedSource.resource_id,
      kind: governedSource.resource_kind,
      display_name: governedSource.display_name,
      observed_at: governedSource.observed_at.toISOString(),
      excerpt: governedSource.excerpt,
      fragment_count: governedSource.fragment_count,
    },
    candidates: candidates.rows.map((candidate) => ({
      person_id: candidate.subject_id,
      display_label: candidate.display_label,
      context_count: candidate.context_count,
      capture_count: candidate.capture_count,
      relationship_contexts: candidate.relationship_contexts,
      match_reasons: candidate.match_reasons,
    })),
    latest_decision: lastDecision
      ? {
          decision: lastDecision.decision,
          reason: lastDecision.reason,
          decided_at: lastDecision.decided_at.toISOString(),
        }
      : null,
    resolved_person_id: row.resolved_subject_id,
    resolved_relationship_context_id: row.resolved_assignment_id,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

async function createRelationshipContext(
  client: PoolClient,
  accountId: string,
  personId: string,
  caseId: string,
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
      `identity-resolution-context:${caseId}`,
      context.label,
    ],
  );
  return relationshipContextId;
}

async function resolveExistingContext(
  client: PoolClient,
  accountId: string,
  personId: string,
  context: Extract<
    RelationshipContextIntent,
    { status: "existing" }
  >,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `SELECT id
     FROM assignments
     WHERE account_id = $1
       AND id = $2
       AND subject_id = $3
       AND status = 'active'
     FOR UPDATE`,
    [accountId, context.relationship_context_id, personId],
  );
  if (!result.rows[0]) {
    throw new ApiError(
      404,
      "RELATIONSHIP_CONTEXT_NOT_FOUND",
      "The selected relationship context does not belong to this person.",
    );
  }
  return result.rows[0].id;
}

async function bindIdentity(
  client: PoolClient,
  auth: AuthContext,
  caseId: string,
  request: Exclude<
    IdentityResolutionDecisionRequest,
    { decision: "leave_unresolved" }
  >,
): Promise<{ personId: string; relationshipContextId: string }> {
  let personId: string;
  if (request.decision === "create_new") {
    personId = randomUUID();
    await client.query(
      `INSERT INTO subjects(
         id, account_id, external_ref, display_label, status
       )
       VALUES ($1, $2, $3, $4, 'active')`,
      [
        personId,
        auth.accountId,
        `identity-resolution-person:${caseId}`,
        request.display_label,
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
      [auth.accountId, request.selected_person_id],
    );
    if (!person.rows[0]) {
      throw new ApiError(
        404,
        "PERSON_NOT_FOUND",
        "The selected person is unavailable in this account.",
      );
    }
    personId = person.rows[0].id;
  }

  const relationshipContextId =
    request.relationship_context.status === "existing"
      ? await resolveExistingContext(
          client,
          auth.accountId,
          personId,
          request.relationship_context,
        )
      : await createRelationshipContext(
          client,
          auth.accountId,
          personId,
          caseId,
          request.relationship_context,
        );
  return { personId, relationshipContextId };
}

export async function decideIdentityResolutionCase(
  pool: Pool,
  auth: AuthContext,
  caseId: string,
  request: IdentityResolutionDecisionRequest,
): Promise<IdentityDecisionMutationResult> {
  return inTransaction(pool, async (client) => {
    const idempotency = await claimIdempotency(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      `resolve_identity_case:${caseId}`,
      request.idempotency_key,
      request,
    );
    if (idempotency.replay) {
      return {
        body:
          idempotency.replay
            .body as IdentityResolutionDecisionResponse,
        replayed: true,
        status: idempotency.replay.status,
      };
    }

    const identityCase = await loadCaseRow(
      client,
      auth.accountId,
      caseId,
      true,
    );
    if (identityCase.status !== "pending") {
      throw new ApiError(
        409,
        "IDENTITY_RESOLUTION_CASE_CLOSED",
        "This identity resolution case no longer accepts decisions.",
      );
    }
    if (identityCase.version !== request.expected_case_version) {
      throw new ApiError(
        409,
        "IDENTITY_RESOLUTION_CASE_STALE",
        "The identity resolution case changed before this decision.",
        { current_case_version: identityCase.version },
      );
    }

    const decidedAt = new Date();
    let personId: string | null = null;
    let relationshipContextId: string | null = null;
    let caseStatus: "pending" | "resolved";
    let identityStatus: "bound" | "unresolved";
    let processingState:
      | "needs_identity_review"
      | "needs_fact_review"
      | "ready";
    let identityHandlesConfirmed = 0;

    if (request.decision === "leave_unresolved") {
      caseStatus = "pending";
      identityStatus = "unresolved";
      processingState = "needs_identity_review";
      await client.query(
        `UPDATE captures
         SET identity_status = 'unbound',
             updated_at = $3
         WHERE account_id = $1
           AND id = $2
           AND status = 'active'`,
        [auth.accountId, identityCase.capture_id, decidedAt],
      );
    } else {
      const binding = await bindIdentity(
        client,
        auth,
        caseId,
        request,
      );
      personId = binding.personId;
      relationshipContextId = binding.relationshipContextId;
      if (
        identityCase.identity_context.status === "unresolved" &&
        identityCase.identity_context.handles.length > 0
      ) {
        const resource = await client.query<{ id: string }>(
          `SELECT id
           FROM source_resources
           WHERE account_id = $1
             AND capture_id = $2
             AND processing_state <> 'deleted'
           ORDER BY created_at, id
           LIMIT 1`,
          [auth.accountId, identityCase.capture_id],
        );
        if (!resource.rows[0]) {
          throw new ApiError(
            409,
            "IDENTITY_HANDLE_SOURCE_UNAVAILABLE",
            "The governed source for these identity clues is unavailable.",
          );
        }
        identityHandlesConfirmed = await confirmIdentityHandles(
          client,
          {
            accountId: auth.accountId,
            confirmedByUserId: auth.userId,
            handles: identityCase.identity_context.handles,
            personId,
            relationshipContextId,
            sourceResourceId: resource.rows[0].id,
          },
        );
      }
      caseStatus = "resolved";
      identityStatus = "bound";
      const proposed = await client.query<{ exists: boolean }>(
        `SELECT EXISTS(
           SELECT 1
           FROM evidence_fragments
           WHERE account_id = $1
             AND capture_id = $2
             AND status = 'active'
             AND review_status = 'proposed'
         ) AS exists`,
        [auth.accountId, identityCase.capture_id],
      );
      processingState = proposed.rows[0]?.exists
        ? "needs_fact_review"
        : "ready";
      await client.query(
        `UPDATE captures
         SET subject_id = $3,
             assignment_id = $4,
             identity_status = 'bound',
             updated_at = $5
         WHERE account_id = $1
           AND id = $2
           AND status = 'active'`,
        [
          auth.accountId,
          identityCase.capture_id,
          personId,
          relationshipContextId,
          decidedAt,
        ],
      );
    }

    await client.query(
      `UPDATE source_resources
       SET processing_state = $3,
           updated_at = $4
       WHERE account_id = $1
         AND capture_id = $2
         AND processing_state <> 'deleted'`,
      [
        auth.accountId,
        identityCase.capture_id,
        processingState,
        decidedAt,
      ],
    );
    await client.query(
      `INSERT INTO identity_resolution_decisions(
         id, account_id, case_id, decided_by_user_id, decision,
         selected_subject_id, selected_assignment_id, case_version,
         reason, decided_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        randomUUID(),
        auth.accountId,
        caseId,
        auth.userId,
        request.decision,
        personId,
        relationshipContextId,
        identityCase.version,
        request.reason,
        decidedAt,
      ],
    );
    const nextCaseVersion = identityCase.version + 1;
    await client.query(
      `UPDATE identity_resolution_cases
       SET status = $3,
           version = $4,
           resolved_subject_id = $5,
           resolved_assignment_id = $6,
           updated_at = $7
       WHERE account_id = $1 AND id = $2`,
      [
        auth.accountId,
        caseId,
        caseStatus,
        nextCaseVersion,
        personId,
        relationshipContextId,
        decidedAt,
      ],
    );

    const body: IdentityResolutionDecisionResponse = {
      case_id: caseId,
      capture_id: identityCase.capture_id,
      case_status: caseStatus,
      case_version: nextCaseVersion,
      decision: request.decision,
      identity_status: identityStatus,
      person_id: personId,
      relationship_context_id: relationshipContextId,
      resource_processing_state: processingState,
      identity_handles_confirmed: identityHandlesConfirmed,
      decided_at: decidedAt.toISOString(),
    };
    await appendAudit(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "identity_resolution.decided",
      "identity_resolution_case",
      caseId,
      {
        capture_id: identityCase.capture_id,
        decision: request.decision,
        person_id: personId,
        relationship_context_id: relationshipContextId,
        identity_handles_confirmed: identityHandlesConfirmed,
      },
    );
    await completeIdempotency(client, idempotency, 201, body);
    return { body, replayed: false, status: 201 };
  });
}
