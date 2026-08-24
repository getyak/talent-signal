import { randomUUID } from "node:crypto";

import {
  CONTRACT_VERSION,
  type CompletePursuitActionRequest,
  type CreatePursuitRequest,
  type Pursuit,
  type PursuitDetailResponse,
  type PursuitListResponse,
  type PursuitMutationResponse,
  type PursuitOperationResponse,
  type PursuitReceipt,
  type RevisePursuitRequest,
} from "@talent-signal/contracts";
import type { Pool } from "pg";

import { inTransaction, type DatabaseClient } from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import { appendAudit } from "../lib/audit.js";
import {
  claimIdempotency,
  completeIdempotency,
} from "../lib/idempotency.js";
import type { AuthContext } from "./auth.js";
import type { MutationResult } from "./captures.js";
import { evidenceAuthority } from "./evidenceAuthority.js";

interface PursuitRow {
  id: string;
  account_id: string;
  pursuit_type: Pursuit["type"];
  title: string;
  target_outcome: string;
  target_date: string;
  status: Pursuit["status"];
  milestone: string;
  milestone_authority_kind: "evidence_supported" | "user_authored";
  milestone_authority_proposal_id: string | null;
  milestone_authority_proposal_item_id: string | null;
  milestone_authority_operation_id: string | null;
  milestone_authority_receipt_id: string | null;
  milestone_authority_user_id: string;
  milestone_authority_at: Date | string;
  updated_by_user_id: string;
  revision: number;
  created_at: Date | string;
  updated_at: Date | string;
}

interface MilestoneAuthorityRow {
  proposal_id: string | null;
  basis_kind: "evidence_supported" | "user_authored";
  decided_by_user_id: string;
  decided_at: Date | string;
  receipt_id: string | null;
  evidence_refs: string[];
  available_evidence_refs: string[];
}

interface RoleRow {
  id: string;
  pursuit_id: string;
  person_id: string | null;
  organization_id: string | null;
  role_type: string;
  status: Pursuit["roles"][number]["status"];
  confidence: Pursuit["roles"][number]["confidence"];
  basis_kind: Pursuit["roles"][number]["basis"]["kind"];
  created_by_user_id: string;
  evidence_refs: string[];
  available_evidence_refs: string[];
  revision: number;
}

interface CriterionRow {
  id: string;
  pursuit_id: string;
  criterion_key: string;
  label: string;
  requirement: string;
  status: Pursuit["criteria"][number]["status"];
  revision: number;
}

interface GapRow {
  id: string;
  pursuit_id: string;
  title: string;
  status: Pursuit["gaps"][number]["status"];
  basis_kind: Pursuit["gaps"][number]["basis"]["kind"];
  basis_summary: string;
  close_condition: string;
  created_by_user_id: string;
  evidence_refs: string[];
  available_evidence_refs: string[];
  revision: number;
}

interface ActionRow {
  id: string;
  pursuit_id: string;
  gap_id: string | null;
  title: string;
  owner_user_id: string;
  owner_display_name: string;
  status: Pursuit["actions"][number]["status"];
  due_at: Date | string | null;
  outcome_summary: string | null;
  completed_at: Date | string | null;
  external_effects: never[];
  revision: number;
}

interface ReceiptRow {
  id: string;
  operation_id: string;
  account_id: string;
  actor_user_id: string;
  operation_kind: PursuitReceipt["operation_kind"];
  status: "applied";
  proposal_id: string | null;
  outcome: PursuitReceipt["outcome"];
  pursuit_id: string;
  before_revision: number;
  after_revision: number;
  changed_fields: string[];
  item_decisions: PursuitReceipt["item_decisions"];
  external_effects: never[];
  summary: string;
  occurred_at: Date | string;
}

interface OperationRow {
  id: string;
  pursuit_id: string;
  proposal_id: string | null;
  operation_kind: PursuitReceipt["operation_kind"];
  status: PursuitOperationResponse["operation"]["status"];
  before_revision: number;
  after_revision: number | null;
  reason: string;
  created_at: Date | string;
  resolved_at: Date | string | null;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function assertUniqueCreateItems(request: CreatePursuitRequest): void {
  const criterionKeys = (request.criteria ?? []).map((item) => item.key);
  if (new Set(criterionKeys).size !== criterionKeys.length) {
    throw new ApiError(
      422,
      "PURSUIT_CRITERION_DUPLICATE",
      "Criterion keys must be unique inside one Pursuit.",
    );
  }

  const roleKeys = (request.roles ?? []).map(
    (item) =>
      `${item.subject_ref.type}:${item.subject_ref.id}:${item.role_type}`,
  );
  if (new Set(roleKeys).size !== roleKeys.length) {
    throw new ApiError(
      422,
      "PURSUIT_ROLE_DUPLICATE",
      "The same subject and role type cannot be added twice to one Pursuit.",
    );
  }

  for (const gap of request.gaps ?? []) {
    if (
      gap.basis.kind === "evidence_supported" &&
      gap.basis.evidence_refs.length === 0
    ) {
      throw new ApiError(
        422,
        "PURSUIT_GAP_EVIDENCE_REQUIRED",
        "An evidence-supported gap requires at least one evidence reference.",
      );
    }
    if (
      gap.basis.kind === "user_authored" &&
      gap.basis.evidence_refs.length > 0
    ) {
      throw new ApiError(
        422,
        "PURSUIT_GAP_BASIS_MISMATCH",
        "Use evidence_supported when a gap cites evidence.",
      );
    }
  }

  for (const role of request.roles ?? []) {
    if (
      role.basis_kind === "evidence_supported" &&
      role.evidence_refs.length === 0
    ) {
      throw new ApiError(
        422,
        "PURSUIT_ROLE_EVIDENCE_REQUIRED",
        "An evidence-supported role requires at least one evidence reference.",
      );
    }
    if (
      role.basis_kind === "user_authored" &&
      role.evidence_refs.length > 0
    ) {
      throw new ApiError(
        422,
        "PURSUIT_ROLE_BASIS_MISMATCH",
        "Use evidence_supported when a role cites evidence.",
      );
    }
  }
}

async function assertReferences(
  client: DatabaseClient,
  auth: AuthContext,
  request: CreatePursuitRequest,
): Promise<void> {
  const personIds = unique(
    (request.roles ?? [])
      .filter((item) => item.subject_ref.type === "person")
      .map((item) => item.subject_ref.id),
  );
  if (personIds.length > 0) {
    const result = await client.query<{ id: string }>(
      `SELECT id
       FROM subjects
       WHERE account_id = $1
         AND id = ANY($2::uuid[])
         AND status = 'active'`,
      [auth.accountId, personIds],
    );
    if (result.rows.length !== personIds.length) {
      throw new ApiError(
        422,
        "PURSUIT_PERSON_SCOPE_INVALID",
        "Every person role must reference an active person in this workspace.",
      );
    }
  }

  const organizationIds = unique(
    (request.roles ?? [])
      .filter((item) => item.subject_ref.type === "organization")
      .map((item) => item.subject_ref.id),
  );
  if (organizationIds.length > 0) {
    const result = await client.query<{ id: string }>(
      `SELECT id
       FROM organizations
       WHERE account_id = $1
         AND id = ANY($2::uuid[])
         AND status = 'active'`,
      [auth.accountId, organizationIds],
    );
    if (result.rows.length !== organizationIds.length) {
      throw new ApiError(
        422,
        "PURSUIT_ORGANIZATION_SCOPE_INVALID",
        "Every organization role must reference an active organization in this workspace.",
      );
    }
  }

  const ownerIds = unique(
    (request.actions ?? []).map((item) => item.owner_user_id),
  );
  if (ownerIds.length > 0) {
    const result = await client.query<{ id: string }>(
      `SELECT id
       FROM users
       WHERE account_id = $1
         AND id = ANY($2::uuid[])
         AND status = 'active'`,
      [auth.accountId, ownerIds],
    );
    if (result.rows.length !== ownerIds.length) {
      throw new ApiError(
        422,
        "PURSUIT_ACTION_OWNER_SCOPE_INVALID",
        "Every action owner must be an active user in this workspace.",
      );
    }
  }

  const evidenceRefs = unique([
    ...(request.roles ?? []).flatMap((item) => item.evidence_refs),
    ...(request.gaps ?? []).flatMap((item) => item.basis.evidence_refs),
  ]);
  if (evidenceRefs.length > 0) {
    const result = await client.query<{
      id: string;
      review_status: "proposed" | "reviewed" | "rejected";
    }>(
      `SELECT fragments.id, fragments.review_status
       FROM evidence_fragments fragments
       JOIN captures
         ON captures.account_id = fragments.account_id
        AND captures.id = fragments.capture_id
       JOIN source_resources resources
         ON resources.account_id = fragments.account_id
        AND resources.id = fragments.resource_id
       JOIN source_retention_receipts receipts
         ON receipts.account_id = fragments.account_id
        AND receipts.capture_id = fragments.capture_id
       WHERE fragments.account_id = $1
         AND fragments.id = ANY($2::uuid[])
         AND fragments.status = 'active'
         AND fragments.review_status = 'reviewed'
         AND fragments.attribution_status = 'confirmed'
         AND fragments.text_content IS NOT NULL
         AND captures.status = 'active'
         AND captures.identity_status = 'bound'
         AND resources.processing_state <> 'deleted'
         AND receipts.source_access_state <> 'deleted'
         AND receipts.authorization_state = 'authorized'
         AND (
           receipts.authorization_expires_at IS NULL
           OR receipts.authorization_expires_at > now()
         )`,
      [auth.accountId, evidenceRefs],
    );
    if (
      result.rows.length !== evidenceRefs.length ||
      result.rows.some((item) => item.review_status !== "reviewed")
    ) {
      throw new ApiError(
        422,
        "PURSUIT_EVIDENCE_NOT_REVIEWED",
        "Pursuit roles and gaps may cite only active, reviewed evidence in this workspace.",
      );
    }
  }
}

export async function readPursuit(
  client: DatabaseClient,
  accountId: string,
  pursuitId: string,
): Promise<Pursuit> {
  const pursuitResult = await client.query<PursuitRow>(
    `SELECT
       id, account_id, pursuit_type, title, target_outcome,
       target_date::text, status, milestone, revision, updated_by_user_id,
       milestone_authority_kind, milestone_authority_proposal_id,
       milestone_authority_proposal_item_id, milestone_authority_operation_id,
       milestone_authority_receipt_id, milestone_authority_user_id,
       milestone_authority_at,
       created_at, updated_at
     FROM pursuits
     WHERE account_id = $1 AND id = $2`,
    [accountId, pursuitId],
  );
  const pursuit = pursuitResult.rows[0];
  if (!pursuit) {
    throw new ApiError(404, "PURSUIT_NOT_FOUND", "The Pursuit was not found.");
  }

  // This function also runs on a checked-out transaction client. `pg` does not
  // support overlapping queries on one client, so keep these reads ordered.
  const rolesResult = await client.query<RoleRow>(
        `SELECT
           roles.id, roles.pursuit_id, roles.person_id,
           roles.organization_id, roles.role_type, roles.status,
           roles.confidence, roles.basis_kind, roles.created_by_user_id,
           roles.revision,
           COALESCE(
             jsonb_agg(evidence.evidence_fragment_id ORDER BY evidence.evidence_fragment_id)
               FILTER (WHERE evidence.evidence_fragment_id IS NOT NULL),
             '[]'::jsonb
           ) AS evidence_refs,
           COALESCE(
             jsonb_agg(evidence.evidence_fragment_id ORDER BY evidence.evidence_fragment_id)
               FILTER (
                 WHERE fragments.status = 'active'
                   AND fragments.review_status = 'reviewed'
                   AND fragments.attribution_status = 'confirmed'
                   AND fragments.text_content IS NOT NULL
                   AND source_captures.status = 'active'
                   AND source_captures.identity_status = 'bound'
                   AND resources.processing_state <> 'deleted'
                   AND receipts.source_access_state <> 'deleted'
                   AND receipts.authorization_state = 'authorized'
                   AND (
                     receipts.authorization_expires_at IS NULL
                     OR receipts.authorization_expires_at > now()
                   )
               ),
             '[]'::jsonb
           ) AS available_evidence_refs
         FROM pursuit_roles roles
         LEFT JOIN pursuit_role_evidence evidence
          ON evidence.account_id = roles.account_id
         AND evidence.role_id = roles.id
         LEFT JOIN evidence_fragments fragments
           ON fragments.account_id = evidence.account_id
          AND fragments.id = evidence.evidence_fragment_id
         LEFT JOIN source_resources resources
           ON resources.account_id = fragments.account_id
          AND resources.id = fragments.resource_id
         LEFT JOIN captures source_captures
           ON source_captures.account_id = fragments.account_id
          AND source_captures.id = fragments.capture_id
         LEFT JOIN source_retention_receipts receipts
           ON receipts.account_id = fragments.account_id
          AND receipts.capture_id = fragments.capture_id
         WHERE roles.account_id = $1 AND roles.pursuit_id = $2
         GROUP BY roles.id
         ORDER BY roles.display_order, roles.id`,
    [accountId, pursuitId],
  );
  const criteriaResult = await client.query<CriterionRow>(
        `SELECT
           id, pursuit_id, criterion_key, label, requirement, status, revision
         FROM pursuit_criteria
         WHERE account_id = $1 AND pursuit_id = $2
         ORDER BY display_order, id`,
    [accountId, pursuitId],
  );
  const gapsResult = await client.query<GapRow>(
        `SELECT
           gaps.id, gaps.pursuit_id, gaps.title, gaps.status,
           gaps.basis_kind, gaps.basis_summary, gaps.close_condition,
           gaps.created_by_user_id, gaps.revision,
           COALESCE(
             jsonb_agg(evidence.evidence_fragment_id ORDER BY evidence.evidence_fragment_id)
               FILTER (WHERE evidence.evidence_fragment_id IS NOT NULL),
             '[]'::jsonb
           ) AS evidence_refs,
           COALESCE(
             jsonb_agg(evidence.evidence_fragment_id ORDER BY evidence.evidence_fragment_id)
               FILTER (
                 WHERE fragments.status = 'active'
                   AND fragments.review_status = 'reviewed'
                   AND fragments.attribution_status = 'confirmed'
                   AND fragments.text_content IS NOT NULL
                   AND source_captures.status = 'active'
                   AND source_captures.identity_status = 'bound'
                   AND resources.processing_state <> 'deleted'
                   AND receipts.source_access_state <> 'deleted'
                   AND receipts.authorization_state = 'authorized'
                   AND (
                     receipts.authorization_expires_at IS NULL
                     OR receipts.authorization_expires_at > now()
                   )
               ),
             '[]'::jsonb
           ) AS available_evidence_refs
         FROM pursuit_gaps gaps
         LEFT JOIN pursuit_gap_evidence evidence
          ON evidence.account_id = gaps.account_id
         AND evidence.gap_id = gaps.id
         LEFT JOIN evidence_fragments fragments
           ON fragments.account_id = evidence.account_id
          AND fragments.id = evidence.evidence_fragment_id
         LEFT JOIN source_resources resources
           ON resources.account_id = fragments.account_id
          AND resources.id = fragments.resource_id
         LEFT JOIN captures source_captures
           ON source_captures.account_id = fragments.account_id
          AND source_captures.id = fragments.capture_id
         LEFT JOIN source_retention_receipts receipts
           ON receipts.account_id = fragments.account_id
          AND receipts.capture_id = fragments.capture_id
         WHERE gaps.account_id = $1 AND gaps.pursuit_id = $2
         GROUP BY gaps.id
         ORDER BY gaps.display_order, gaps.id`,
    [accountId, pursuitId],
  );
  const actionsResult = await client.query<ActionRow>(
        `SELECT
           actions.id, actions.pursuit_id, actions.gap_id, actions.title,
           actions.owner_user_id, owners.display_name AS owner_display_name,
           actions.status, actions.due_at, actions.outcome_summary,
           actions.completed_at, actions.external_effects, actions.revision
         FROM pursuit_actions actions
         JOIN users owners
           ON owners.account_id = actions.account_id
          AND owners.id = actions.owner_user_id
         WHERE actions.account_id = $1 AND actions.pursuit_id = $2
         ORDER BY actions.display_order, actions.id`,
    [accountId, pursuitId],
  );
  const milestoneAuthorityResult = await client.query<MilestoneAuthorityRow>(
    `SELECT pursuits.milestone_authority_proposal_id AS proposal_id,
            pursuits.milestone_authority_kind AS basis_kind,
            pursuits.milestone_authority_user_id AS decided_by_user_id,
            pursuits.milestone_authority_at AS decided_at,
            pursuits.milestone_authority_receipt_id AS receipt_id,
            COALESCE(
              jsonb_agg(evidence.evidence_fragment_id ORDER BY evidence.evidence_fragment_id)
                FILTER (WHERE evidence.evidence_fragment_id IS NOT NULL),
              '[]'::jsonb
            ) AS evidence_refs,
            COALESCE(
              jsonb_agg(evidence.evidence_fragment_id ORDER BY evidence.evidence_fragment_id)
                FILTER (
                  WHERE fragments.status = 'active'
                    AND fragments.review_status = 'reviewed'
                    AND fragments.attribution_status = 'confirmed'
                    AND fragments.text_content IS NOT NULL
                    AND source_captures.status = 'active'
                    AND source_captures.identity_status = 'bound'
                    AND resources.processing_state <> 'deleted'
                    AND retention.source_access_state <> 'deleted'
                    AND retention.authorization_state = 'authorized'
                    AND (
                      retention.authorization_expires_at IS NULL
                      OR retention.authorization_expires_at > now()
                    )
                ),
              '[]'::jsonb
            ) AS available_evidence_refs
     FROM pursuits
     LEFT JOIN pursuit_proposal_item_evidence evidence
       ON evidence.account_id = $1
      AND evidence.proposal_item_id = pursuits.milestone_authority_proposal_item_id
     LEFT JOIN evidence_fragments fragments
       ON fragments.account_id = evidence.account_id
      AND fragments.id = evidence.evidence_fragment_id
     LEFT JOIN source_resources resources
       ON resources.account_id = fragments.account_id
      AND resources.id = fragments.resource_id
     LEFT JOIN captures source_captures
       ON source_captures.account_id = fragments.account_id
      AND source_captures.id = fragments.capture_id
     LEFT JOIN source_retention_receipts retention
       ON retention.account_id = fragments.account_id
      AND retention.capture_id = fragments.capture_id
     WHERE pursuits.account_id = $1 AND pursuits.id = $2
     GROUP BY pursuits.id`,
    [accountId, pursuitId],
  );
  const milestoneAuthority = milestoneAuthorityResult.rows[0];

  return {
    id: pursuit.id,
    workspace_id: pursuit.account_id,
    type: pursuit.pursuit_type,
    title: pursuit.title,
    target_outcome: pursuit.target_outcome,
    target_date: pursuit.target_date,
    status: pursuit.status,
    milestone: pursuit.milestone,
    milestone_authority: milestoneAuthority
      ? {
          kind: milestoneAuthority.basis_kind,
          evidence_refs: milestoneAuthority.evidence_refs,
          evidence_state: evidenceAuthority(
            milestoneAuthority.basis_kind,
            milestoneAuthority.evidence_refs,
            milestoneAuthority.available_evidence_refs,
          ),
          confirmed_by_user_id: milestoneAuthority.decided_by_user_id,
          confirmed_at: iso(milestoneAuthority.decided_at),
          proposal_id: milestoneAuthority.proposal_id,
          receipt_id: milestoneAuthority.receipt_id,
        }
      : {
          kind: "user_authored",
          evidence_refs: [],
          evidence_state: evidenceAuthority("user_authored", [], []),
          confirmed_by_user_id: pursuit.updated_by_user_id,
          confirmed_at: iso(pursuit.updated_at),
          proposal_id: null,
          receipt_id: null,
        },
    revision: pursuit.revision,
    roles: rolesResult.rows.map((item) => ({
      id: item.id,
      pursuit_id: item.pursuit_id,
      subject_ref: item.person_id
        ? { type: "person" as const, id: item.person_id }
        : { type: "organization" as const, id: item.organization_id! },
      role_type: item.role_type,
      status: item.status,
      confidence: item.confidence,
      basis: {
        kind: item.basis_kind,
        attributed_by_user_id:
          item.basis_kind === "user_authored"
            ? item.created_by_user_id
            : null,
      },
      evidence_refs: item.evidence_refs,
      evidence_state: evidenceAuthority(
        item.basis_kind,
        item.evidence_refs,
        item.available_evidence_refs,
      ),
      revision: item.revision,
    })),
    criteria: criteriaResult.rows.map((item) => ({
      id: item.id,
      pursuit_id: item.pursuit_id,
      key: item.criterion_key,
      label: item.label,
      requirement: item.requirement,
      status: item.status,
      revision: item.revision,
    })),
    gaps: gapsResult.rows.map((item) => ({
      id: item.id,
      pursuit_id: item.pursuit_id,
      title: item.title,
      status: item.status,
      basis: {
        kind: item.basis_kind,
        summary: item.basis_summary,
        evidence_refs: item.evidence_refs,
        attributed_by_user_id:
          item.basis_kind === "user_authored"
            ? item.created_by_user_id
            : null,
        evidence_state: evidenceAuthority(
          item.basis_kind,
          item.evidence_refs,
          item.available_evidence_refs,
        ),
      },
      close_condition: item.close_condition,
      revision: item.revision,
    })),
    actions: actionsResult.rows.map((item) => ({
      id: item.id,
      pursuit_id: item.pursuit_id,
      gap_id: item.gap_id,
      title: item.title,
      owner_user_id: item.owner_user_id,
      owner_display_name: item.owner_display_name,
      status: item.status,
      due_at: item.due_at === null ? null : iso(item.due_at),
      outcome_summary: item.outcome_summary,
      completed_at:
        item.completed_at === null ? null : iso(item.completed_at),
      external_effects: item.external_effects,
      revision: item.revision,
    })),
    created_at: iso(pursuit.created_at),
    updated_at: iso(pursuit.updated_at),
  };
}

export function mapPursuitReceipt(row: ReceiptRow): PursuitReceipt {
  return {
    id: row.id,
    operation_id: row.operation_id,
    workspace_id: row.account_id,
    actor_user_id: row.actor_user_id,
    operation_kind: row.operation_kind,
    status: row.status,
    proposal_id: row.proposal_id,
    outcome: row.outcome,
    entity_ref: {
      type: "pursuit",
      id: row.pursuit_id,
      before_revision: row.before_revision,
      after_revision: row.after_revision,
    },
    changed_fields: row.changed_fields,
    item_decisions: row.item_decisions,
    external_effects: row.external_effects,
    summary: row.summary,
    occurred_at: iso(row.occurred_at),
  };
}

async function insertAppliedOperation(
  client: DatabaseClient,
  input: {
    accountId: string;
    actorUserId: string;
    idempotencyRecordId: string;
    pursuitId: string;
    kind: PursuitReceipt["operation_kind"];
    beforeRevision: number;
    afterRevision: number;
    changedFields: string[];
    reason: string;
    summary: string;
    occurredAt: Date;
    operationId?: string;
  },
): Promise<PursuitReceipt> {
  const operationId = input.operationId ?? randomUUID();
  const receiptId = randomUUID();
  await client.query(
    `INSERT INTO pursuit_operations(
       id, account_id, pursuit_id, idempotency_record_id,
       requested_by_user_id, operation_kind, status, before_revision,
       after_revision, changed_fields, reason, created_at, resolved_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'applied', $7, $8, $9, $10, $11, $11)`,
    [
      operationId,
      input.accountId,
      input.pursuitId,
      input.idempotencyRecordId,
      input.actorUserId,
      input.kind,
      input.beforeRevision,
      input.afterRevision,
      JSON.stringify(input.changedFields),
      input.reason,
      input.occurredAt,
    ],
  );
  const result = await client.query<ReceiptRow>(
    `INSERT INTO pursuit_receipts(
       id, account_id, operation_id, pursuit_id, actor_user_id,
       operation_kind, status, before_revision, after_revision,
       changed_fields, summary, occurred_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'applied', $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      receiptId,
      input.accountId,
      operationId,
      input.pursuitId,
      input.actorUserId,
      input.kind,
      input.beforeRevision,
      input.afterRevision,
      JSON.stringify(input.changedFields),
      input.summary,
      input.occurredAt,
    ],
  );
  return mapPursuitReceipt(result.rows[0]!);
}

export async function createPursuit(
  pool: Pool,
  auth: AuthContext,
  request: CreatePursuitRequest,
): Promise<MutationResult<PursuitMutationResponse>> {
  return inTransaction(pool, async (client) => {
    const idempotency = await claimIdempotency(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "create_pursuit",
      request.idempotency_key,
      request,
    );
    if (idempotency.replay) {
      return {
        body: idempotency.replay.body as PursuitMutationResponse,
        replayed: true,
        status: idempotency.replay.status,
      };
    }

    assertUniqueCreateItems(request);
    await assertReferences(client, auth, request);

    const pursuitId = randomUUID();
    const occurredAt = new Date();
    await client.query(
      `INSERT INTO pursuits(
         id, account_id, pursuit_type, title, target_outcome,
         target_date, status, milestone, revision,
         created_by_user_id, updated_by_user_id,
         milestone_authority_kind, milestone_authority_user_id,
         milestone_authority_at, created_at, updated_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, 1, $9, $9,
         'user_authored', $9, $10, $10, $10
       )`,
      [
        pursuitId,
        auth.accountId,
        request.type,
        request.title,
        request.target_outcome,
        request.target_date,
        request.status ?? "draft",
        request.milestone,
        auth.userId,
        occurredAt,
      ],
    );

    for (const [displayOrder, item] of (request.roles ?? []).entries()) {
      const roleId = randomUUID();
      await client.query(
        `INSERT INTO pursuit_roles(
           id, account_id, pursuit_id, person_id, organization_id,
           role_type, status, confidence, basis_kind, display_order,
           revision, created_by_user_id,
           created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, $11, $12, $12)`,
        [
          roleId,
          auth.accountId,
          pursuitId,
          item.subject_ref.type === "person" ? item.subject_ref.id : null,
          item.subject_ref.type === "organization"
            ? item.subject_ref.id
            : null,
          item.role_type,
          item.status ?? "active",
          item.confidence,
          item.basis_kind,
          displayOrder,
          auth.userId,
          occurredAt,
        ],
      );
      for (const evidenceId of unique(item.evidence_refs)) {
        await client.query(
          `INSERT INTO pursuit_role_evidence(
             account_id, role_id, evidence_fragment_id, created_at
           )
           VALUES ($1, $2, $3, $4)`,
          [auth.accountId, roleId, evidenceId, occurredAt],
        );
      }
    }

    for (const [displayOrder, item] of (request.criteria ?? []).entries()) {
      await client.query(
        `INSERT INTO pursuit_criteria(
           id, account_id, pursuit_id, criterion_key, label,
           requirement, status, display_order, revision, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, 1, $8, $8)`,
        [
          randomUUID(),
          auth.accountId,
          pursuitId,
          item.key,
          item.label,
          item.requirement,
          displayOrder,
          occurredAt,
        ],
      );
    }

    for (const [displayOrder, item] of (request.gaps ?? []).entries()) {
      const gapId = randomUUID();
      await client.query(
        `INSERT INTO pursuit_gaps(
           id, account_id, pursuit_id, title, status, basis_kind,
           basis_summary, close_condition, display_order, revision, created_by_user_id,
           created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, 'open', $5, $6, $7, $8, 1, $9, $10, $10)`,
        [
          gapId,
          auth.accountId,
          pursuitId,
          item.title,
          item.basis.kind,
          item.basis.summary,
          item.close_condition,
          displayOrder,
          auth.userId,
          occurredAt,
        ],
      );
      for (const evidenceId of unique(item.basis.evidence_refs)) {
        await client.query(
          `INSERT INTO pursuit_gap_evidence(
             account_id, gap_id, evidence_fragment_id, created_at
           )
           VALUES ($1, $2, $3, $4)`,
          [auth.accountId, gapId, evidenceId, occurredAt],
        );
      }
    }

    for (const [displayOrder, item] of (request.actions ?? []).entries()) {
      await client.query(
        `INSERT INTO pursuit_actions(
           id, account_id, pursuit_id, title, owner_user_id, status,
           due_at, external_effects, display_order, revision, created_by_user_id,
           created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, 'drafted', $6, '[]'::jsonb, $7, 1, $8, $9, $9)`,
        [
          randomUUID(),
          auth.accountId,
          pursuitId,
          item.title,
          item.owner_user_id,
          item.due_at ?? null,
          displayOrder,
          auth.userId,
          occurredAt,
        ],
      );
    }

    const changedFields = [
      "type",
      "title",
      "target_outcome",
      "target_date",
      "status",
      "milestone",
      ...(request.roles?.length ? ["roles"] : []),
      ...(request.criteria?.length ? ["criteria"] : []),
      ...(request.gaps?.length ? ["gaps"] : []),
      ...(request.actions?.length ? ["actions"] : []),
    ];
    const appliedReceipt = await insertAppliedOperation(client, {
      accountId: auth.accountId,
      actorUserId: auth.userId,
      idempotencyRecordId: idempotency.id,
      pursuitId,
      kind: "create_pursuit",
      beforeRevision: 0,
      afterRevision: 1,
      changedFields,
      reason: "User created the Pursuit.",
      summary: "Pursuit created as canonical workspace state.",
      occurredAt,
    });
    await client.query(
      `UPDATE pursuits
       SET milestone_authority_operation_id = $3,
           milestone_authority_receipt_id = $4
       WHERE account_id = $1 AND id = $2`,
      [
        auth.accountId,
        pursuitId,
        appliedReceipt.operation_id,
        appliedReceipt.id,
      ],
    );
    const sequence = await appendAudit(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "pursuit.created",
      "pursuit",
      pursuitId,
      {
        operation_id: appliedReceipt.operation_id,
        receipt_id: appliedReceipt.id,
        revision: 1,
        pursuit_type: request.type,
        changed_fields: changedFields,
      },
    );
    const pursuit = await readPursuit(client, auth.accountId, pursuitId);
    const body: PursuitMutationResponse = {
      contract_version: CONTRACT_VERSION,
      pursuit,
      receipt: appliedReceipt,
    };
    await completeIdempotency(client, idempotency, 201, body);
    void sequence;
    return { body, replayed: false, status: 201 };
  });
}

const statusTransitions: Record<Pursuit["status"], Pursuit["status"][]> = {
  draft: ["active", "cancelled"],
  active: ["paused", "succeeded", "failed", "cancelled"],
  paused: ["active", "succeeded", "failed", "cancelled"],
  succeeded: [],
  failed: [],
  cancelled: [],
};

export function canTransitionPursuitStatus(
  current: Pursuit["status"],
  requested: Pursuit["status"],
): boolean {
  return requested === current || statusTransitions[current].includes(requested);
}

export async function revisePursuit(
  pool: Pool,
  auth: AuthContext,
  pursuitId: string,
  request: RevisePursuitRequest,
): Promise<MutationResult<PursuitMutationResponse>> {
  return inTransaction(pool, async (client) => {
    const idempotency = await claimIdempotency(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      `revise_pursuit:${pursuitId}`,
      request.idempotency_key,
      request,
    );
    if (idempotency.replay) {
      return {
        body: idempotency.replay.body as PursuitMutationResponse,
        replayed: true,
        status: idempotency.replay.status,
      };
    }

    const currentResult = await client.query<PursuitRow>(
      `SELECT
         id, account_id, pursuit_type, title, target_outcome,
         target_date::text, status, milestone, revision, updated_by_user_id,
         created_at, updated_at
       FROM pursuits
       WHERE account_id = $1 AND id = $2
       FOR UPDATE`,
      [auth.accountId, pursuitId],
    );
    const current = currentResult.rows[0];
    if (!current) {
      throw new ApiError(404, "PURSUIT_NOT_FOUND", "The Pursuit was not found.");
    }
    if (current.revision !== request.expected_revision) {
      throw new ApiError(
        409,
        "PURSUIT_REVISION_CONFLICT",
        "The Pursuit changed; review the current revision before applying this update.",
        { current_revision: current.revision },
      );
    }
    if (
      request.status !== undefined &&
      request.status !== current.status &&
      !canTransitionPursuitStatus(current.status, request.status)
    ) {
      throw new ApiError(
        422,
        "PURSUIT_STATUS_TRANSITION_INVALID",
        "The requested Pursuit status transition is not allowed.",
        { current_status: current.status, requested_status: request.status },
      );
    }

    const next = {
      title: request.title ?? current.title,
      target_outcome: request.target_outcome ?? current.target_outcome,
      target_date: request.target_date ?? current.target_date,
      status: request.status ?? current.status,
      milestone: request.milestone ?? current.milestone,
    };
    const changedFields = (
      ["title", "target_outcome", "target_date", "status", "milestone"] as const
    ).filter((field) => next[field] !== current[field]);
    if (changedFields.length === 0) {
      throw new ApiError(
        422,
        "PURSUIT_REVISION_EMPTY",
        "A Pursuit revision must change at least one canonical field.",
      );
    }

    const nextRevision = current.revision + 1;
    const occurredAt = new Date();
    await client.query(
      `UPDATE pursuits
       SET title = $3,
           target_outcome = $4,
           target_date = $5,
           status = $6,
           milestone = $7,
           revision = $8,
           updated_by_user_id = $9,
           updated_at = $10,
           milestone_authority_kind = CASE
             WHEN $11 THEN 'user_authored'
             ELSE milestone_authority_kind
           END,
           milestone_authority_proposal_id = CASE
             WHEN $11 THEN NULL
             ELSE milestone_authority_proposal_id
           END,
           milestone_authority_proposal_item_id = CASE
             WHEN $11 THEN NULL
             ELSE milestone_authority_proposal_item_id
           END,
           milestone_authority_operation_id = CASE
             WHEN $11 THEN NULL
             ELSE milestone_authority_operation_id
           END,
           milestone_authority_receipt_id = CASE
             WHEN $11 THEN NULL
             ELSE milestone_authority_receipt_id
           END,
           milestone_authority_user_id = CASE
             WHEN $11 THEN $9
             ELSE milestone_authority_user_id
           END,
           milestone_authority_at = CASE
             WHEN $11 THEN $10
             ELSE milestone_authority_at
           END
       WHERE account_id = $1 AND id = $2`,
      [
        auth.accountId,
        pursuitId,
        next.title,
        next.target_outcome,
        next.target_date,
        next.status,
        next.milestone,
        nextRevision,
        auth.userId,
        occurredAt,
        changedFields.includes("milestone"),
      ],
    );
    const appliedReceipt = await insertAppliedOperation(client, {
      accountId: auth.accountId,
      actorUserId: auth.userId,
      idempotencyRecordId: idempotency.id,
      pursuitId,
      kind: "revise_pursuit",
      beforeRevision: current.revision,
      afterRevision: nextRevision,
      changedFields: [...changedFields],
      reason: request.reason,
      summary: `Pursuit revision ${nextRevision} applied.`,
      occurredAt,
    });
    if (changedFields.includes("milestone")) {
      await client.query(
        `UPDATE pursuits
         SET milestone_authority_operation_id = $3,
             milestone_authority_receipt_id = $4
         WHERE account_id = $1 AND id = $2`,
        [
          auth.accountId,
          pursuitId,
          appliedReceipt.operation_id,
          appliedReceipt.id,
        ],
      );
    }
    await appendAudit(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "pursuit.revised",
      "pursuit",
      pursuitId,
      {
        operation_id: appliedReceipt.operation_id,
        receipt_id: appliedReceipt.id,
        prior_revision: current.revision,
        revision: nextRevision,
        changed_fields: changedFields,
        reason: request.reason,
      },
    );
    const pursuit = await readPursuit(client, auth.accountId, pursuitId);
    const body: PursuitMutationResponse = {
      contract_version: CONTRACT_VERSION,
      pursuit,
      receipt: appliedReceipt,
    };
    await completeIdempotency(client, idempotency, 200, body);
    return { body, replayed: false, status: 200 };
  });
}

export async function completePursuitAction(
  pool: Pool,
  auth: AuthContext,
  pursuitId: string,
  actionId: string,
  request: CompletePursuitActionRequest,
): Promise<MutationResult<PursuitMutationResponse>> {
  return inTransaction(pool, async (client) => {
    const idempotency = await claimIdempotency(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      `complete_pursuit_action:${pursuitId}:${actionId}`,
      request.idempotency_key,
      request,
    );
    if (idempotency.replay) {
      return {
        body: idempotency.replay.body as PursuitMutationResponse,
        replayed: true,
        status: idempotency.replay.status,
      };
    }

    const operationIdResult = await client.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM pursuit_operations WHERE id = $1
       ) AS exists`,
      [request.operation_id],
    );
    if (operationIdResult.rows[0]?.exists) {
      throw new ApiError(
        409,
        "OPERATION_ID_REUSED",
        "This action operation identifier has already been used.",
      );
    }

    const pursuitResult = await client.query<PursuitRow>(
      `SELECT
         id, account_id, pursuit_type, title, target_outcome,
         target_date::text, status, milestone, revision, created_at, updated_at
       FROM pursuits
       WHERE account_id = $1 AND id = $2
       FOR UPDATE`,
      [auth.accountId, pursuitId],
    );
    const pursuit = pursuitResult.rows[0];
    if (!pursuit) {
      throw new ApiError(404, "PURSUIT_NOT_FOUND", "The Pursuit was not found.");
    }
    if (pursuit.revision !== request.expected_pursuit_revision) {
      throw new ApiError(
        409,
        "PURSUIT_REVISION_CONFLICT",
        "The Pursuit changed; review its current actions before recording an outcome.",
        { current_revision: pursuit.revision },
      );
    }

    const actionResult = await client.query<{
      id: string;
      owner_user_id: string;
      status: Pursuit["actions"][number]["status"];
      revision: number;
    }>(
      `SELECT id, owner_user_id, status, revision
       FROM pursuit_actions
       WHERE account_id = $1 AND pursuit_id = $2 AND id = $3
       FOR UPDATE`,
      [auth.accountId, pursuitId, actionId],
    );
    const action = actionResult.rows[0];
    if (!action) {
      throw new ApiError(
        404,
        "PURSUIT_ACTION_NOT_FOUND",
        "The owned action was not found in this Pursuit.",
      );
    }
    if (action.owner_user_id !== auth.userId) {
      throw new ApiError(
        403,
        "PURSUIT_ACTION_OWNER_REQUIRED",
        "Only the current canonical owner may record this action outcome.",
      );
    }
    if (action.revision !== request.expected_action_revision) {
      throw new ApiError(
        409,
        "PURSUIT_ACTION_REVISION_CONFLICT",
        "The action changed; review its current state before recording an outcome.",
        { current_revision: action.revision },
      );
    }
    if (["completed", "cancelled"].includes(action.status)) {
      throw new ApiError(
        409,
        "PURSUIT_ACTION_ALREADY_TERMINAL",
        "This action already has a terminal canonical state.",
      );
    }

    const outcome = request.outcome_summary.trim();
    if (!outcome) {
      throw new ApiError(
        422,
        "PURSUIT_ACTION_OUTCOME_REQUIRED",
        "Record the observed internal outcome before completing this action.",
      );
    }
    const occurredAt = new Date();
    const nextPursuitRevision = pursuit.revision + 1;
    await client.query(
      `UPDATE pursuit_actions
       SET status = 'completed', outcome_summary = $4, completed_at = $5,
           revision = revision + 1, updated_at = $5
       WHERE account_id = $1 AND pursuit_id = $2 AND id = $3`,
      [auth.accountId, pursuitId, actionId, outcome, occurredAt],
    );
    await client.query(
      `UPDATE pursuits
       SET revision = $3, updated_by_user_id = $4, updated_at = $5
       WHERE account_id = $1 AND id = $2`,
      [auth.accountId, pursuitId, nextPursuitRevision, auth.userId, occurredAt],
    );
    const changedFields = [
      `actions.${actionId}.status`,
      `actions.${actionId}.outcome_summary`,
    ];
    const receipt = await insertAppliedOperation(client, {
      accountId: auth.accountId,
      actorUserId: auth.userId,
      idempotencyRecordId: idempotency.id,
      pursuitId,
      kind: "revise_pursuit",
      beforeRevision: pursuit.revision,
      afterRevision: nextPursuitRevision,
      changedFields,
      reason: "The canonical action owner recorded an observed internal outcome.",
      summary: "Owned internal action completed with an observed outcome; no external effect was executed.",
      occurredAt,
      operationId: request.operation_id,
    });
    await appendAudit(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "pursuit.action_completed",
      "pursuit_action",
      actionId,
      {
        pursuit_id: pursuitId,
        operation_id: receipt.operation_id,
        receipt_id: receipt.id,
        prior_pursuit_revision: pursuit.revision,
        pursuit_revision: nextPursuitRevision,
        prior_action_revision: action.revision,
        action_revision: action.revision + 1,
        outcome_summary: outcome,
        external_effects: [],
      },
    );
    const body: PursuitMutationResponse = {
      contract_version: CONTRACT_VERSION,
      pursuit: await readPursuit(client, auth.accountId, pursuitId),
      receipt,
    };
    await completeIdempotency(client, idempotency, 200, body);
    return { body, replayed: false, status: 200 };
  });
}

export async function getPursuit(
  pool: Pool,
  auth: AuthContext,
  pursuitId: string,
): Promise<PursuitDetailResponse> {
  return {
    contract_version: CONTRACT_VERSION,
    pursuit: await readPursuit(pool, auth.accountId, pursuitId),
  };
}

export async function listPursuits(
  pool: Pool,
  auth: AuthContext,
): Promise<PursuitListResponse> {
  const result = await pool.query<{ id: string }>(
    `SELECT id
     FROM pursuits
     WHERE account_id = $1
     ORDER BY
       CASE status
         WHEN 'active' THEN 0
         WHEN 'paused' THEN 1
         WHEN 'draft' THEN 2
         ELSE 3
       END,
       target_date,
       updated_at DESC,
       id`,
    [auth.accountId],
  );
  return {
    contract_version: CONTRACT_VERSION,
    workspace_id: auth.accountId,
    pursuits: await Promise.all(
      result.rows.map((item) =>
        readPursuit(pool, auth.accountId, item.id),
      ),
    ),
  };
}

export async function getPursuitOperation(
  pool: Pool,
  auth: AuthContext,
  operationId: string,
): Promise<PursuitOperationResponse> {
  const operationResult = await pool.query<OperationRow>(
    `SELECT
       id, pursuit_id, proposal_id, operation_kind, status,
       before_revision, after_revision, reason, created_at, resolved_at
     FROM pursuit_operations
     WHERE account_id = $1 AND id = $2`,
    [auth.accountId, operationId],
  );
  const operation = operationResult.rows[0];
  if (!operation) {
    throw new ApiError(
      404,
      "OPERATION_NOT_FOUND",
      "The operation was not found in this workspace.",
    );
  }
  const receiptResult = await pool.query<ReceiptRow>(
    `SELECT *
     FROM pursuit_receipts
     WHERE account_id = $1 AND operation_id = $2`,
    [auth.accountId, operationId],
  );
  return {
    contract_version: CONTRACT_VERSION,
    operation: {
      id: operation.id,
      pursuit_id: operation.pursuit_id,
      proposal_id: operation.proposal_id,
      operation_kind: operation.operation_kind,
      status: operation.status,
      before_revision: operation.before_revision,
      after_revision: operation.after_revision,
      reason: operation.reason,
      created_at: iso(operation.created_at),
      resolved_at:
        operation.resolved_at === null ? null : iso(operation.resolved_at),
    },
    receipt: receiptResult.rows[0]
      ? mapPursuitReceipt(receiptResult.rows[0])
      : null,
    pursuit: await readPursuit(pool, auth.accountId, operation.pursuit_id),
  };
}
