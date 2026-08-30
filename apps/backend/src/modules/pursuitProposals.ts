import { randomUUID } from "node:crypto";

import {
  CONTRACT_VERSION,
  type Pursuit,
  type PursuitProposalListResponse,
  type PursuitProposal,
  type PursuitProposalResponse,
  type PursuitProposalReviewResponse,
  type PursuitReceipt,
  type ReviewPursuitProposalRequest,
  type StagePursuitProposalRequest,
} from "@talent-signal/contracts";
import type { Pool, PoolClient } from "pg";

import {
  inTransaction,
  type DatabaseClient,
} from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import { appendAudit } from "../lib/audit.js";
import {
  claimIdempotency,
  completeIdempotency,
} from "../lib/idempotency.js";
import type { AuthContext } from "./auth.js";
import type { MutationResult } from "./captures.js";
import { evidenceAuthority } from "./evidenceAuthority.js";
import {
  canTransitionPursuitStatus,
  mapPursuitReceipt,
  readPursuit,
} from "./pursuits.js";

type StageItem = StagePursuitProposalRequest["items"][number];
type ProposalItem = PursuitProposal["items"][number];
type ProposalDecision = ReviewPursuitProposalRequest["decisions"][number];

interface ProposalRow {
  id: string;
  account_id: string;
  pursuit_id: string;
  capture_id: string;
  base_revision: number;
  summary: string;
  producer_kind: PursuitProposal["producer"]["kind"];
  producer_name: string;
  producer_version: string;
  producer_run_id: string;
  status: PursuitProposal["status"];
  revision: number;
  created_by_user_id: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ProposalItemRow {
  id: string;
  proposal_id: string;
  item_key: string;
  change_kind: ProposalItem["change_kind"];
  target_entity_type: ProposalItem["target"]["entity_type"];
  target_entity_id: string | null;
  target_field: string;
  before_value: unknown;
  proposed_value: unknown;
  basis_kind: ProposalItem["basis_kind"];
  epistemic_status: ProposalItem["epistemic_status"];
  reason: string;
  effect_summary: string;
  decision_status: ProposalItem["decision"]["status"];
  decided_value: unknown;
  decided_by_user_id: string | null;
  decision_reason: string | null;
  decided_at: Date | string | null;
  evidence_refs: string[];
  available_evidence_refs: string[];
}

interface ProposalContextRow {
  pursuit_title: string;
  capture_purpose: string;
  person_id: string;
  display_label: string;
  contextual_roles: PursuitProposal["review_context"]["subject"]["contextual_roles"];
}

interface ProposalEvidenceContextRow {
  fragment_id: string;
  text: string | null;
  fragment_kind: string;
  fragment_status: string;
  observed_at: Date | string;
  source_timezone: string | null;
  source_display_name: string;
  input_channel: string;
  source_processing_state: string;
  attributed_actor: string;
  attribution_status: "confirmed" | "proposed" | "unknown";
  review_status: string;
  parser_name: string;
  parser_version: string;
}

interface PursuitStateRow {
  id: string;
  status: Pursuit["status"];
  milestone: string;
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

export interface ProposalReviewConflict {
  kind: "conflict";
  operation_id: string;
  proposal_id: string;
  proposal_base_revision: number;
  current_revision: number;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: string[],
): void {
  const keys = Object.keys(value).sort();
  if (!sameValue(keys, [...expected].sort())) {
    throw new ApiError(
      422,
      "PROPOSAL_EDIT_SHAPE_INVALID",
      "The edited value does not match this proposal item type.",
    );
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ApiError(
      422,
      "PROPOSAL_EDIT_SHAPE_INVALID",
      "The edited value must be a structured object for this item.",
    );
  }
  return value as Record<string, unknown>;
}

function boundedText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(
      422,
      "PROPOSAL_EDIT_VALUE_INVALID",
      `${field} must be non-empty text.`,
    );
  }
  const text = value.trim();
  if (text.length > maxLength) {
    throw new ApiError(
      422,
      "PROPOSAL_EDIT_VALUE_INVALID",
      `${field} is longer than the governed limit.`,
    );
  }
  return text;
}

function normalizeValue(
  item: ProposalItemRow,
  decision: ProposalDecision,
): unknown | null {
  if (decision.decision === "reject" || decision.decision === "keep_unresolved") {
    if (decision.edited_value !== undefined) {
      throw new ApiError(
        422,
        "PROPOSAL_EDIT_UNEXPECTED",
        "Rejected or unresolved items cannot carry an edited value.",
      );
    }
    return null;
  }
  if (decision.decision === "confirm") {
    if (decision.edited_value !== undefined) {
      throw new ApiError(
        422,
        "PROPOSAL_EDIT_UNEXPECTED",
        "Confirm uses the staged value; choose edit to change it.",
      );
    }
    return item.proposed_value;
  }
  if (decision.edited_value === undefined) {
    throw new ApiError(
      422,
      "PROPOSAL_EDIT_REQUIRED",
      "Edit requires an explicit edited value.",
    );
  }

  switch (item.change_kind) {
    case "set_milestone":
      return boundedText(decision.edited_value, "milestone", 120);
    case "set_pursuit_status": {
      const statuses: Pursuit["status"][] = [
        "draft",
        "active",
        "paused",
        "succeeded",
        "failed",
        "cancelled",
      ];
      if (!statuses.includes(decision.edited_value as Pursuit["status"])) {
        throw new ApiError(
          422,
          "PROPOSAL_EDIT_VALUE_INVALID",
          "The edited Pursuit status is not supported.",
        );
      }
      return decision.edited_value;
    }
    case "set_role_status": {
      const statuses = ["active", "quiet", "removed"];
      if (!statuses.includes(decision.edited_value as string)) {
        throw new ApiError(
          422,
          "PROPOSAL_EDIT_VALUE_INVALID",
          "The edited role status is not supported.",
        );
      }
      return decision.edited_value;
    }
    case "add_gap": {
      const value = record(decision.edited_value);
      assertExactKeys(value, ["title", "basis_summary", "close_condition"]);
      return {
        title: boundedText(value.title, "title", 240),
        basis_summary: boundedText(value.basis_summary, "basis_summary", 1_000),
        close_condition: boundedText(
          value.close_condition,
          "close_condition",
          1_000,
        ),
      };
    }
    case "add_action": {
      const value = record(decision.edited_value);
      assertExactKeys(value, ["title", "owner_user_id", "due_at"]);
      const owner = value.owner_user_id;
      if (typeof owner !== "string") {
        throw new ApiError(
          422,
          "PROPOSAL_EDIT_VALUE_INVALID",
          "The edited action owner must be a user ID.",
        );
      }
      const dueAt = value.due_at;
      if (
        dueAt !== null &&
        (typeof dueAt !== "string" || Number.isNaN(Date.parse(dueAt)))
      ) {
        throw new ApiError(
          422,
          "PROPOSAL_EDIT_VALUE_INVALID",
          "The edited action due time must be an ISO timestamp or null.",
        );
      }
      return {
        title: boundedText(value.title, "title", 240),
        owner_user_id: owner,
        due_at: dueAt,
      };
    }
  }
}

function mapProposalItem(
  item: ProposalItemRow,
  attributedByUserId: string,
): ProposalItem {
  return {
    id: item.id,
    item_key: item.item_key,
    change_kind: item.change_kind,
    target: {
      entity_type: item.target_entity_type,
      entity_id: item.target_entity_id,
      field: item.target_field,
    },
    before_value: item.before_value,
    proposed_value: item.proposed_value,
    basis_kind: item.basis_kind,
    attributed_by_user_id:
      item.basis_kind === "user_authored" ? attributedByUserId : null,
    epistemic_status: item.epistemic_status,
    evidence_refs: item.evidence_refs,
    evidence_state: evidenceAuthority(
      item.basis_kind,
      item.evidence_refs,
      item.available_evidence_refs,
    ),
    reason: item.reason,
    effect_summary: item.effect_summary,
    decision: {
      status: item.decision_status,
      decided_value: item.decided_value,
      decided_by_user_id: item.decided_by_user_id,
      reason: item.decision_reason,
      decided_at:
        item.decided_at === null ? null : iso(item.decided_at),
    },
  };
}

async function readProposal(
  client: DatabaseClient,
  accountId: string,
  proposalId: string,
): Promise<PursuitProposal> {
  const proposalResult = await client.query<ProposalRow>(
    `SELECT *
     FROM pursuit_proposals
     WHERE account_id = $1 AND id = $2`,
    [accountId, proposalId],
  );
  const proposal = proposalResult.rows[0];
  if (!proposal) {
    throw new ApiError(
      404,
      "PURSUIT_PROPOSAL_NOT_FOUND",
      "The Pursuit Proposal was not found.",
    );
  }
  const items = await client.query<ProposalItemRow>(
    `SELECT
       items.*,
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
     FROM pursuit_proposal_items items
     LEFT JOIN pursuit_proposal_item_evidence evidence
      ON evidence.account_id = items.account_id
     AND evidence.proposal_item_id = items.id
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
     WHERE items.account_id = $1 AND items.proposal_id = $2
     GROUP BY items.id
     ORDER BY items.created_at, items.id`,
    [accountId, proposalId],
  );
  const contextResult = await client.query<ProposalContextRow>(
    `SELECT
       pursuits.title AS pursuit_title,
       captures.purpose AS capture_purpose,
       subjects.id AS person_id,
       subjects.display_label,
       COALESCE(
         jsonb_agg(
           jsonb_build_object(
             'role_type', roles.role_type,
             'status', roles.status,
             'confidence', roles.confidence
           ) ORDER BY roles.role_type, roles.id
         ) FILTER (WHERE roles.id IS NOT NULL),
         '[]'::jsonb
       ) AS contextual_roles
     FROM pursuit_proposals proposals
     JOIN pursuits
       ON pursuits.account_id = proposals.account_id
      AND pursuits.id = proposals.pursuit_id
     JOIN captures
       ON captures.account_id = proposals.account_id
      AND captures.id = proposals.capture_id
     JOIN subjects
       ON subjects.account_id = captures.account_id
      AND subjects.id = captures.subject_id
     LEFT JOIN pursuit_roles roles
       ON roles.account_id = proposals.account_id
      AND roles.pursuit_id = proposals.pursuit_id
      AND roles.person_id = captures.subject_id
      AND roles.status <> 'removed'
     WHERE proposals.account_id = $1 AND proposals.id = $2
     GROUP BY pursuits.title, captures.purpose, subjects.id, subjects.display_label`,
    [accountId, proposalId],
  );
  const context = contextResult.rows[0];
  if (!context || context.contextual_roles.length === 0) {
    throw new ApiError(
      409,
      "PURSUIT_PROPOSAL_CONTEXT_UNAVAILABLE",
      "The Proposal identity context is no longer available.",
    );
  }
  const evidenceIds = unique(items.rows.flatMap((item) => item.evidence_refs));
  const availableEvidenceIds = unique(
    items.rows.flatMap((item) => item.available_evidence_refs),
  );
  const evidenceResult =
    evidenceIds.length === 0
      ? { rows: [] as ProposalEvidenceContextRow[] }
      : await client.query<ProposalEvidenceContextRow>(
          `SELECT
             fragments.id AS fragment_id,
             fragments.text_content AS text,
             fragments.fragment_kind,
             fragments.status AS fragment_status,
             resources.observed_at,
             resources.source_timezone,
             resources.display_name AS source_display_name,
             resources.input_channel,
             resources.processing_state AS source_processing_state,
             fragments.attributed_actor,
             fragments.attribution_status,
             fragments.review_status,
             fragments.parser_name,
             fragments.parser_version
           FROM evidence_fragments fragments
           JOIN source_resources resources
             ON resources.account_id = fragments.account_id
            AND resources.id = fragments.resource_id
           WHERE fragments.account_id = $1
             AND fragments.id = ANY($2::uuid[])
           ORDER BY resources.observed_at, fragments.sequence, fragments.id`,
          [accountId, evidenceIds],
        );
  return {
    id: proposal.id,
    workspace_id: proposal.account_id,
    pursuit_id: proposal.pursuit_id,
    capture_id: proposal.capture_id,
    base_revision: proposal.base_revision,
    summary: proposal.summary,
    producer: {
      kind: proposal.producer_kind,
      name: proposal.producer_name,
      version: proposal.producer_version,
      run_id: proposal.producer_run_id,
    },
    status: proposal.status,
    revision: proposal.revision,
    evidence_state: evidenceAuthority(
      items.rows.some((item) => item.basis_kind === "evidence_supported")
        ? "evidence_supported"
        : "user_authored",
      evidenceIds,
      availableEvidenceIds,
    ),
    review_context: {
      pursuit: {
        id: proposal.pursuit_id,
        title: context.pursuit_title,
      },
      capture: {
        id: proposal.capture_id,
        purpose: context.capture_purpose,
      },
      subject: {
        person_id: context.person_id,
        display_label: context.display_label,
        contextual_roles: context.contextual_roles,
      },
      evidence: evidenceResult.rows.map((evidence) => ({
        fragment_id: evidence.fragment_id,
        text: evidence.text,
        fragment_kind: evidence.fragment_kind,
        fragment_status: evidence.fragment_status,
        observed_at: iso(evidence.observed_at),
        source_timezone: evidence.source_timezone,
        source_display_name: evidence.source_display_name,
        input_channel: evidence.input_channel,
        source_processing_state: evidence.source_processing_state,
        attributed_actor: evidence.attributed_actor,
        attribution_status: evidence.attribution_status,
        review_status: evidence.review_status,
        parser: {
          name: evidence.parser_name,
          version: evidence.parser_version,
        },
      })),
    },
    items: items.rows.map((item) =>
      mapProposalItem(item, proposal.created_by_user_id),
    ),
    created_at: iso(proposal.created_at),
    updated_at: iso(proposal.updated_at),
  };
}

async function assertCaptureAndIdentityScope(
  client: DatabaseClient,
  auth: AuthContext,
  pursuitId: string,
  captureId: string,
): Promise<void> {
  const result = await client.query<{ subject_id: string | null }>(
    `SELECT captures.subject_id
     FROM captures
     JOIN source_retention_receipts receipts
       ON receipts.account_id = captures.account_id
      AND receipts.capture_id = captures.id
     WHERE captures.account_id = $1
       AND captures.id = $2
       AND captures.status = 'active'
       AND captures.identity_status = 'bound'
       AND receipts.authorization_state = 'authorized'
       AND (
         receipts.authorization_expires_at IS NULL
         OR receipts.authorization_expires_at > now()
       )`,
    [auth.accountId, captureId],
  );
  const subjectId = result.rows[0]?.subject_id;
  if (!subjectId) {
    throw new ApiError(
      422,
      "PROPOSAL_CAPTURE_SCOPE_INVALID",
      "The proposal requires an active, authorized, identity-bound capture.",
    );
  }
  const role = await client.query<{ id: string }>(
    `SELECT id
     FROM pursuit_roles
     WHERE account_id = $1
       AND pursuit_id = $2
       AND person_id = $3
       AND status <> 'removed'`,
    [auth.accountId, pursuitId, subjectId],
  );
  if (!role.rows[0]) {
    throw new ApiError(
      422,
      "PROPOSAL_IDENTITY_NOT_IN_PURSUIT",
      "The capture Person is not an active contextual role in this Pursuit.",
    );
  }
}

async function assertEvidenceUsable(
  client: DatabaseClient,
  accountId: string,
  captureId: string,
  evidenceRefs: string[],
): Promise<void> {
  const refs = unique(evidenceRefs);
  if (refs.length === 0) return;
  const result = await client.query<{ id: string }>(
    `SELECT fragments.id
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
       AND fragments.capture_id = $2
       AND fragments.id = ANY($3::uuid[])
       AND fragments.status = 'active'
       AND fragments.review_status = 'reviewed'
       AND fragments.attribution_status = 'confirmed'
       AND captures.status = 'active'
       AND captures.identity_status = 'bound'
       AND resources.processing_state <> 'deleted'
       AND receipts.authorization_state = 'authorized'
       AND (
         receipts.authorization_expires_at IS NULL
         OR receipts.authorization_expires_at > now()
       )`,
    [accountId, captureId, refs],
  );
  if (result.rows.length !== refs.length) {
    throw new ApiError(
      422,
      "PROPOSAL_EVIDENCE_UNAVAILABLE",
      "Every cited fragment must remain active, authorized, reviewed, identity-bound, and attribution-confirmed.",
    );
  }
}

function assertStageItems(request: StagePursuitProposalRequest): void {
  const itemKeys = request.items.map((item) => item.item_key);
  if (new Set(itemKeys).size !== itemKeys.length) {
    throw new ApiError(
      422,
      "PROPOSAL_ITEM_KEY_DUPLICATE",
      "Proposal item keys must be unique.",
    );
  }
  const targetKeys = request.items.map((item) => {
    if (item.change.kind === "set_role_status") {
      return `${item.change.kind}:${item.change.role_id}`;
    }
    return item.change.kind;
  });
  const setterKeys = targetKeys.filter((key) => key.startsWith("set_"));
  if (new Set(setterKeys).size !== setterKeys.length) {
    throw new ApiError(
      422,
      "PROPOSAL_TARGET_DUPLICATE",
      "One proposal cannot change the same canonical target twice.",
    );
  }
  for (const item of request.items) {
    const changeKeys = Object.keys(item.change).sort();
    const expectedChangeKeys =
      item.change.kind === "set_role_status"
        ? ["kind", "proposed_value", "role_id"]
        : ["kind", "proposed_value"];
    if (!sameValue(changeKeys, expectedChangeKeys)) {
      throw new ApiError(
        422,
        "PROPOSAL_CHANGE_SHAPE_INVALID",
        "A proposal change may include only the governed fields for its kind.",
      );
    }
    if (item.basis_kind === "evidence_supported" && item.evidence_refs.length === 0) {
      throw new ApiError(
        422,
        "PROPOSAL_EVIDENCE_REQUIRED",
        "Evidence-supported proposal items require at least one fragment.",
      );
    }
    if (item.basis_kind === "user_authored") {
      if (request.producer.kind !== "human") {
        throw new ApiError(
          422,
          "PROPOSAL_AGENT_AUTHORSHIP_INVALID",
          "An Agent cannot stage a user-authored basis.",
        );
      }
      if (item.evidence_refs.length > 0 || item.epistemic_status !== "unknown") {
        throw new ApiError(
          422,
          "PROPOSAL_AUTHORSHIP_BASIS_INVALID",
          "User-authored items must remain unknown and cannot cite evidence as their basis.",
        );
      }
    }
    if (item.epistemic_status === "fact" && item.basis_kind !== "evidence_supported") {
      throw new ApiError(
        422,
        "PROPOSAL_FACT_EVIDENCE_REQUIRED",
        "A staged fact label requires reviewed supporting evidence.",
      );
    }
  }
}

async function resolveStageTarget(
  client: DatabaseClient,
  auth: AuthContext,
  pursuit: PursuitStateRow,
  item: StageItem,
): Promise<{
  entityType: ProposalItem["target"]["entity_type"];
  entityId: string | null;
  field: string;
  beforeValue: unknown;
  proposedValue: unknown;
}> {
  switch (item.change.kind) {
    case "set_milestone":
      if (item.change.proposed_value === pursuit.milestone) {
        throw new ApiError(422, "PROPOSAL_ITEM_NO_CHANGE", "The proposed milestone already matches canonical state.");
      }
      return {
        entityType: "pursuit",
        entityId: pursuit.id,
        field: "milestone",
        beforeValue: pursuit.milestone,
        proposedValue: item.change.proposed_value,
      };
    case "set_pursuit_status":
      if (item.change.proposed_value === pursuit.status) {
        throw new ApiError(422, "PROPOSAL_ITEM_NO_CHANGE", "The proposed status already matches canonical state.");
      }
      return {
        entityType: "pursuit",
        entityId: pursuit.id,
        field: "status",
        beforeValue: pursuit.status,
        proposedValue: item.change.proposed_value,
      };
    case "set_role_status": {
      const result = await client.query<{ status: string }>(
        `SELECT status
         FROM pursuit_roles
         WHERE account_id = $1 AND pursuit_id = $2 AND id = $3`,
        [auth.accountId, pursuit.id, item.change.role_id],
      );
      const role = result.rows[0];
      if (!role) {
        throw new ApiError(422, "PROPOSAL_ROLE_TARGET_INVALID", "The proposal role target is not in this Pursuit.");
      }
      if (item.change.proposed_value === role.status) {
        throw new ApiError(422, "PROPOSAL_ITEM_NO_CHANGE", "The proposed role status already matches canonical state.");
      }
      return {
        entityType: "pursuit_role",
        entityId: item.change.role_id,
        field: "status",
        beforeValue: role.status,
        proposedValue: item.change.proposed_value,
      };
    }
    case "add_gap":
      return {
        entityType: "pursuit_gap",
        entityId: null,
        field: "create",
        beforeValue: null,
        proposedValue: item.change.proposed_value,
      };
    case "add_action": {
      const owner = await client.query<{ id: string }>(
        `SELECT id FROM users
         WHERE account_id = $1 AND id = $2 AND status = 'active'`,
        [auth.accountId, item.change.proposed_value.owner_user_id],
      );
      if (!owner.rows[0]) {
        throw new ApiError(422, "PROPOSAL_ACTION_OWNER_INVALID", "The proposed action owner is not active in this workspace.");
      }
      return {
        entityType: "pursuit_action",
        entityId: null,
        field: "create",
        beforeValue: null,
        proposedValue: item.change.proposed_value,
      };
    }
  }
}

export async function stagePursuitProposal(
  pool: Pool,
  auth: AuthContext,
  pursuitId: string,
  request: StagePursuitProposalRequest,
): Promise<MutationResult<PursuitProposalResponse>> {
  return inTransaction(pool, async (client) => {
    const idempotency = await claimIdempotency(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      `stage_pursuit_proposal:${pursuitId}`,
      request.idempotency_key,
      request,
    );
    if (idempotency.replay) {
      return {
        body: idempotency.replay.body as PursuitProposalResponse,
        replayed: true,
        status: idempotency.replay.status,
      };
    }

    assertStageItems(request);
    const pursuitResult = await client.query<PursuitStateRow>(
      `SELECT id, status, milestone, revision
       FROM pursuits
       WHERE account_id = $1 AND id = $2
       FOR SHARE`,
      [auth.accountId, pursuitId],
    );
    const pursuit = pursuitResult.rows[0];
    if (!pursuit) {
      throw new ApiError(404, "PURSUIT_NOT_FOUND", "The Pursuit was not found.");
    }
    if (pursuit.revision !== request.base_revision) {
      throw new ApiError(
        409,
        "PURSUIT_PROPOSAL_BASE_CONFLICT",
        "The Pursuit changed before this proposal could be staged.",
        { current_revision: pursuit.revision },
      );
    }
    await assertCaptureAndIdentityScope(
      client,
      auth,
      pursuitId,
      request.capture_id,
    );
    await assertEvidenceUsable(
      client,
      auth.accountId,
      request.capture_id,
      request.items.flatMap((item) => item.evidence_refs),
    );

    const proposalId = request.proposal_id ?? randomUUID();
    const occurredAt = new Date();
    await client.query(
      `INSERT INTO pursuit_proposals(
         id, account_id, pursuit_id, capture_id, base_revision, summary,
         producer_kind, producer_name, producer_version, producer_run_id,
         status, revision, created_by_user_id, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
               'needs_review', 1, $11, $12, $12)`,
      [
        proposalId,
        auth.accountId,
        pursuitId,
        request.capture_id,
        request.base_revision,
        request.summary,
        request.producer.kind,
        request.producer.name,
        request.producer.version,
        request.producer.run_id,
        auth.userId,
        occurredAt,
      ],
    );

    for (const item of request.items) {
      const target = await resolveStageTarget(client, auth, pursuit, item);
      const itemId = randomUUID();
      await client.query(
        `INSERT INTO pursuit_proposal_items(
           id, account_id, proposal_id, item_key, change_kind,
           target_entity_type, target_entity_id, target_field,
           before_value, proposed_value, basis_kind, epistemic_status,
           reason, effect_summary, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                 $9::jsonb, $10::jsonb, $11, $12, $13, $14, $15)`,
        [
          itemId,
          auth.accountId,
          proposalId,
          item.item_key,
          item.change.kind,
          target.entityType,
          target.entityId,
          target.field,
          JSON.stringify(target.beforeValue),
          JSON.stringify(target.proposedValue),
          item.basis_kind,
          item.epistemic_status,
          item.reason,
          item.effect_summary,
          occurredAt,
        ],
      );
      for (const evidenceId of unique(item.evidence_refs)) {
        await client.query(
          `INSERT INTO pursuit_proposal_item_evidence(
             account_id, proposal_item_id, evidence_fragment_id, created_at
           ) VALUES ($1, $2, $3, $4)`,
          [auth.accountId, itemId, evidenceId, occurredAt],
        );
      }
    }

    await appendAudit(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "pursuit.proposal.staged",
      "pursuit_proposal",
      proposalId,
      {
        pursuit_id: pursuitId,
        capture_id: request.capture_id,
        base_revision: request.base_revision,
        item_count: request.items.length,
        producer_kind: request.producer.kind,
        producer_name: request.producer.name,
        producer_version: request.producer.version,
        producer_run_id: request.producer.run_id,
      },
    );
    const body: PursuitProposalResponse = {
      contract_version: CONTRACT_VERSION,
      proposal: await readProposal(client, auth.accountId, proposalId),
    };
    await completeIdempotency(client, idempotency, 201, body);
    return { body, replayed: false, status: 201 };
  });
}

function exactDecisionSet(
  items: ProposalItemRow[],
  decisions: ProposalDecision[],
): Map<string, ProposalDecision> {
  const byId = new Map(decisions.map((decision) => [decision.item_id, decision]));
  if (
    byId.size !== decisions.length ||
    items.length !== decisions.length ||
    items.some((item) => !byId.has(item.id))
  ) {
    throw new ApiError(
      422,
      "PROPOSAL_DECISION_SET_INVALID",
      "Review must provide exactly one decision for every proposal item.",
    );
  }
  return byId;
}

async function activeUser(
  client: DatabaseClient,
  accountId: string,
  userId: string,
): Promise<boolean> {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM users
     WHERE account_id = $1 AND id = $2 AND status = 'active'`,
    [accountId, userId],
  );
  return Boolean(result.rows[0]);
}

export async function reviewPursuitProposal(
  pool: Pool,
  auth: AuthContext,
  proposalId: string,
  request: ReviewPursuitProposalRequest,
  options: {
    onBeforeReview?: (client: PoolClient) => Promise<void>;
    onResolved?: (
      client: PoolClient,
      body: PursuitProposalReviewResponse,
    ) => Promise<void>;
  } = {},
): Promise<
  MutationResult<PursuitProposalReviewResponse | ProposalReviewConflict>
> {
  return inTransaction(pool, async (client) => {
    const idempotency = await claimIdempotency(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      `review_pursuit_proposal:${proposalId}`,
      request.idempotency_key,
      request,
    );
    if (idempotency.replay) {
      return {
        body: idempotency.replay.body as
          | PursuitProposalReviewResponse
          | ProposalReviewConflict,
        replayed: true,
        status: idempotency.replay.status,
      };
    }

    const proposalResult = await client.query<ProposalRow>(
      `SELECT * FROM pursuit_proposals
       WHERE account_id = $1 AND id = $2
       FOR UPDATE`,
      [auth.accountId, proposalId],
    );
    const proposal = proposalResult.rows[0];
    if (!proposal) {
      throw new ApiError(404, "PURSUIT_PROPOSAL_NOT_FOUND", "The Pursuit Proposal was not found.");
    }
    if (proposal.status !== "needs_review") {
      throw new ApiError(
        409,
        "PURSUIT_PROPOSAL_NOT_REVIEWABLE",
        "This Proposal no longer accepts a new review command.",
        { status: proposal.status },
      );
    }
    await options.onBeforeReview?.(client);

    const pursuitResult = await client.query<PursuitStateRow>(
      `SELECT id, status, milestone, revision
       FROM pursuits
       WHERE account_id = $1 AND id = $2
       FOR UPDATE`,
      [auth.accountId, proposal.pursuit_id],
    );
    const pursuit = pursuitResult.rows[0];
    if (!pursuit) {
      throw new ApiError(404, "PURSUIT_NOT_FOUND", "The Pursuit was not found.");
    }
    const occurredAt = new Date();
    if (
      request.base_revision !== proposal.base_revision ||
      request.base_revision !== pursuit.revision
    ) {
      const conflict: ProposalReviewConflict = {
        kind: "conflict",
        operation_id: request.operation_id,
        proposal_id: proposal.id,
        proposal_base_revision: proposal.base_revision,
        current_revision: pursuit.revision,
      };
      await client.query(
        `INSERT INTO pursuit_operations(
           id, account_id, pursuit_id, proposal_id, idempotency_record_id,
           requested_by_user_id, operation_kind, status, before_revision,
           after_revision, changed_fields, reason, created_at, resolved_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, 'review_pursuit_proposal',
                 'conflict', $7, NULL, '[]'::jsonb, $8, $9, $9)`,
        [
          request.operation_id,
          auth.accountId,
          proposal.pursuit_id,
          proposal.id,
          idempotency.id,
          auth.userId,
          pursuit.revision,
          request.reason,
          occurredAt,
        ],
      );
      await client.query(
        `UPDATE pursuit_proposals
         SET status = 'conflict', revision = revision + 1, updated_at = $3
         WHERE account_id = $1 AND id = $2`,
        [auth.accountId, proposal.id, occurredAt],
      );
      await appendAudit(
        client,
        { accountId: auth.accountId, actorUserId: auth.userId },
        "pursuit.proposal.conflict",
        "pursuit_proposal",
        proposal.id,
        {
          operation_id: request.operation_id,
          proposal_base_revision: proposal.base_revision,
          request_base_revision: request.base_revision,
          current_revision: pursuit.revision,
        },
      );
      await completeIdempotency(client, idempotency, 409, conflict);
      return { body: conflict, replayed: false, status: 409 };
    }

    const itemResult = await client.query<ProposalItemRow>(
      `SELECT items.*, '[]'::jsonb AS evidence_refs,
              '[]'::jsonb AS available_evidence_refs
       FROM pursuit_proposal_items items
       WHERE items.account_id = $1 AND items.proposal_id = $2
       ORDER BY items.created_at, items.id
       FOR UPDATE`,
      [auth.accountId, proposal.id],
    );
    const items = itemResult.rows;
    const evidenceResult = await client.query<{
      proposal_item_id: string;
      evidence_fragment_id: string;
    }>(
      `SELECT proposal_item_id, evidence_fragment_id
       FROM pursuit_proposal_item_evidence
       WHERE account_id = $1
         AND proposal_item_id = ANY($2::uuid[])
       ORDER BY proposal_item_id, evidence_fragment_id`,
      [auth.accountId, items.map((item) => item.id)],
    );
    for (const evidence of evidenceResult.rows) {
      const item = items.find((candidate) => candidate.id === evidence.proposal_item_id);
      if (item) item.evidence_refs.push(evidence.evidence_fragment_id);
    }
    const decisions = exactDecisionSet(items, request.decisions);
    await assertEvidenceUsable(
      client,
      auth.accountId,
      proposal.capture_id,
      items
        .filter((item) => item.basis_kind === "evidence_supported")
        .flatMap((item) => item.evidence_refs),
    );

    await client.query(
      `INSERT INTO pursuit_operations(
         id, account_id, pursuit_id, proposal_id, idempotency_record_id,
         requested_by_user_id, operation_kind, status, before_revision,
         changed_fields, reason, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'review_pursuit_proposal',
               'confirming', $7, '[]'::jsonb, $8, $9)`,
      [
        request.operation_id,
        auth.accountId,
        proposal.pursuit_id,
        proposal.id,
        idempotency.id,
        auth.userId,
        pursuit.revision,
        request.reason,
        occurredAt,
      ],
    );
    await client.query(
      `UPDATE pursuit_proposals
       SET status = 'confirming', updated_at = $3
       WHERE account_id = $1 AND id = $2`,
      [auth.accountId, proposal.id, occurredAt],
    );

    let nextMilestone = pursuit.milestone;
    let nextStatus = pursuit.status;
    let accepted = 0;
    let unresolved = 0;
    let rejected = 0;
    let milestoneAuthorityItem: ProposalItemRow | null = null;
    const changedFields: string[] = [];
    const itemDecisions: PursuitReceipt["item_decisions"] = [];

    for (const item of items) {
      const decision = decisions.get(item.id)!;
      const decidedValue = normalizeValue(item, decision);
      const acceptedItem =
        decision.decision === "confirm" || decision.decision === "edit";
      if (acceptedItem && sameValue(decidedValue, item.before_value)) {
        throw new ApiError(
          422,
          "PROPOSAL_ITEM_NO_CHANGE",
          "A confirmed or edited item must change canonical state.",
        );
      }

      const decisionStatus: ProposalItem["decision"]["status"] =
        decision.decision === "confirm"
          ? "confirmed"
          : decision.decision === "edit"
            ? "edited"
            : decision.decision === "reject"
              ? "rejected"
              : "kept_unresolved";

      if (acceptedItem) {
        accepted += 1;
        switch (item.change_kind) {
          case "set_milestone":
            if (pursuit.milestone !== item.before_value) {
              throw new ApiError(409, "PROPOSAL_TARGET_CHANGED", "The milestone changed after this Proposal was staged.");
            }
            nextMilestone = decidedValue as string;
            milestoneAuthorityItem = item;
            changedFields.push("milestone");
            break;
          case "set_pursuit_status":
            if (pursuit.status !== item.before_value) {
              throw new ApiError(409, "PROPOSAL_TARGET_CHANGED", "The Pursuit status changed after this Proposal was staged.");
            }
            if (!canTransitionPursuitStatus(pursuit.status, decidedValue as Pursuit["status"])) {
              throw new ApiError(
                422,
                "PURSUIT_STATUS_TRANSITION_INVALID",
                "The reviewed Pursuit status transition is not allowed.",
              );
            }
            nextStatus = decidedValue as Pursuit["status"];
            changedFields.push("status");
            break;
          case "set_role_status": {
            const role = await client.query<{ status: string }>(
              `SELECT status FROM pursuit_roles
               WHERE account_id = $1 AND pursuit_id = $2 AND id = $3
               FOR UPDATE`,
              [auth.accountId, proposal.pursuit_id, item.target_entity_id],
            );
            if (!role.rows[0] || role.rows[0].status !== item.before_value) {
              throw new ApiError(409, "PROPOSAL_TARGET_CHANGED", "The contextual role changed after this Proposal was staged.");
            }
            await client.query(
              `UPDATE pursuit_roles
               SET status = $4, revision = revision + 1, updated_at = $5
               WHERE account_id = $1 AND pursuit_id = $2 AND id = $3`,
              [
                auth.accountId,
                proposal.pursuit_id,
                item.target_entity_id,
                decidedValue,
                occurredAt,
              ],
            );
            changedFields.push(`roles.${item.target_entity_id}.status`);
            break;
          }
          case "add_gap": {
            const value = decidedValue as {
              title: string;
              basis_summary: string;
              close_condition: string;
            };
            const gapId = randomUUID();
            await client.query(
              `INSERT INTO pursuit_gaps(
                 id, account_id, pursuit_id, title, status, basis_kind,
                 basis_summary, close_condition, display_order, revision,
                 created_by_user_id,
                 created_at, updated_at
               )
               VALUES (
                 $1, $2, $3, $4, 'open', $5, $6, $7,
                 (SELECT COALESCE(MAX(display_order), -1) + 1
                  FROM pursuit_gaps
                  WHERE account_id = $2 AND pursuit_id = $3),
                 1, $8, $9, $9
               )`,
              [
                gapId,
                auth.accountId,
                proposal.pursuit_id,
                value.title,
                item.basis_kind,
                value.basis_summary,
                value.close_condition,
                auth.userId,
                occurredAt,
              ],
            );
            for (const evidenceId of item.evidence_refs) {
              await client.query(
                `INSERT INTO pursuit_gap_evidence(
                   account_id, gap_id, evidence_fragment_id, created_at
                 ) VALUES ($1, $2, $3, $4)`,
                [auth.accountId, gapId, evidenceId, occurredAt],
              );
            }
            changedFields.push("gaps");
            break;
          }
          case "add_action": {
            const value = decidedValue as {
              title: string;
              owner_user_id: string;
              due_at: string | null;
            };
            if (!(await activeUser(client, auth.accountId, value.owner_user_id))) {
              throw new ApiError(422, "PROPOSAL_ACTION_OWNER_INVALID", "The reviewed action owner is not active in this workspace.");
            }
            await client.query(
              `INSERT INTO pursuit_actions(
                 id, account_id, pursuit_id, title, owner_user_id, status,
                 due_at, external_effects, display_order, revision,
                 created_by_user_id,
                 created_at, updated_at
               )
               VALUES (
                 $1, $2, $3, $4, $5, 'drafted', $6, '[]'::jsonb,
                 (SELECT COALESCE(MAX(display_order), -1) + 1
                  FROM pursuit_actions
                  WHERE account_id = $2 AND pursuit_id = $3),
                 1, $7, $8, $8
               )`,
              [
                randomUUID(),
                auth.accountId,
                proposal.pursuit_id,
                value.title,
                value.owner_user_id,
                value.due_at,
                auth.userId,
                occurredAt,
              ],
            );
            changedFields.push("actions");
            break;
          }
        }
      } else if (decision.decision === "keep_unresolved") {
        unresolved += 1;
      } else {
        rejected += 1;
      }

      await client.query(
        `UPDATE pursuit_proposal_items
         SET decision_status = $4,
             decided_value = $5::jsonb,
             decided_by_user_id = $6,
             decision_reason = $7,
             decided_at = $8
         WHERE account_id = $1 AND proposal_id = $2 AND id = $3`,
        [
          auth.accountId,
          proposal.id,
          item.id,
          decisionStatus,
          acceptedItem ? JSON.stringify(decidedValue) : null,
          auth.userId,
          request.reason,
          occurredAt,
        ],
      );
      itemDecisions.push({
        item_id: item.id,
        decision: decisionStatus as PursuitReceipt["item_decisions"][number]["decision"],
        changed: acceptedItem,
      });
    }

    const afterRevision = accepted > 0 ? pursuit.revision + 1 : pursuit.revision;
    if (accepted > 0) {
      await client.query(
        `UPDATE pursuits
         SET milestone = $3,
             status = $4,
             revision = $5,
             updated_by_user_id = $6,
             updated_at = $7
         WHERE account_id = $1 AND id = $2`,
        [
          auth.accountId,
          proposal.pursuit_id,
          nextMilestone,
          nextStatus,
          afterRevision,
          auth.userId,
          occurredAt,
        ],
      );
    }

    const outcome: PursuitReceipt["outcome"] =
      accepted > 0 && unresolved > 0
        ? "mixed_applied"
        : accepted > 0
          ? "canonical_applied"
          : unresolved > 0
            ? "kept_unresolved"
            : "rejected";
    const proposalStatus: PursuitProposal["status"] =
      unresolved > 0
        ? "kept_unresolved"
        : accepted > 0
          ? "applied"
          : "rejected";
    const deduplicatedFields = unique(changedFields);
    await client.query(
      `UPDATE pursuit_proposals
       SET status = $3, revision = revision + 1, updated_at = $4
       WHERE account_id = $1 AND id = $2`,
      [auth.accountId, proposal.id, proposalStatus, occurredAt],
    );
    await client.query(
      `UPDATE pursuit_operations
       SET status = 'applied', after_revision = $3,
           changed_fields = $4::jsonb, resolved_at = $5
       WHERE account_id = $1 AND id = $2`,
      [
        auth.accountId,
        request.operation_id,
        afterRevision,
        JSON.stringify(deduplicatedFields),
        occurredAt,
      ],
    );
    const receiptResult = await client.query<ReceiptRow>(
      `INSERT INTO pursuit_receipts(
         id, account_id, operation_id, pursuit_id, proposal_id,
         actor_user_id, operation_kind, status, outcome,
         before_revision, after_revision, changed_fields, item_decisions,
         external_effects, summary, occurred_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'review_pursuit_proposal',
               'applied', $7, $8, $9, $10::jsonb, $11::jsonb,
               '[]'::jsonb, $12, $13)
       RETURNING *`,
      [
        randomUUID(),
        auth.accountId,
        request.operation_id,
        proposal.pursuit_id,
        proposal.id,
        auth.userId,
        outcome,
        pursuit.revision,
        afterRevision,
        JSON.stringify(deduplicatedFields),
        JSON.stringify(itemDecisions),
        `Proposal review recorded: ${accepted} applied, ${rejected} rejected, ${unresolved} unresolved.`,
        occurredAt,
      ],
    );
    const appliedReceipt = mapPursuitReceipt(receiptResult.rows[0]!);
    if (milestoneAuthorityItem) {
      await client.query(
        `UPDATE pursuits
         SET milestone_authority_kind = $3,
             milestone_authority_proposal_id = $4,
             milestone_authority_proposal_item_id = $5,
             milestone_authority_operation_id = $6,
             milestone_authority_receipt_id = $7,
             milestone_authority_user_id = $8,
             milestone_authority_at = $9
         WHERE account_id = $1 AND id = $2`,
        [
          auth.accountId,
          proposal.pursuit_id,
          milestoneAuthorityItem.basis_kind,
          proposal.id,
          milestoneAuthorityItem.id,
          request.operation_id,
          appliedReceipt.id,
          auth.userId,
          occurredAt,
        ],
      );
    }
    await appendAudit(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "pursuit.proposal.reviewed",
      "pursuit_proposal",
      proposal.id,
      {
        operation_id: request.operation_id,
        receipt_id: appliedReceipt.id,
        before_revision: pursuit.revision,
        after_revision: afterRevision,
        outcome,
        applied_items: accepted,
        rejected_items: rejected,
        unresolved_items: unresolved,
        changed_fields: deduplicatedFields,
        reason: request.reason,
      },
    );
    const body: PursuitProposalReviewResponse = {
      contract_version: CONTRACT_VERSION,
      proposal: await readProposal(client, auth.accountId, proposal.id),
      pursuit: await readPursuit(client, auth.accountId, proposal.pursuit_id),
      receipt: appliedReceipt,
    };
    await options.onResolved?.(client, body);
    await completeIdempotency(client, idempotency, 200, body);
    return { body, replayed: false, status: 200 };
  });
}

export async function getPursuitProposal(
  pool: Pool,
  auth: AuthContext,
  proposalId: string,
): Promise<PursuitProposalResponse> {
  return {
    contract_version: CONTRACT_VERSION,
    proposal: await readProposal(pool, auth.accountId, proposalId),
  };
}

export async function listPursuitProposals(
  pool: Pool,
  auth: AuthContext,
): Promise<PursuitProposalListResponse> {
  const result = await pool.query<{ id: string }>(
    `SELECT id
     FROM pursuit_proposals
     WHERE account_id = $1
       AND status IN ('needs_review', 'confirming', 'conflict', 'failed')
     ORDER BY
       CASE status
         WHEN 'needs_review' THEN 0
         WHEN 'confirming' THEN 1
         WHEN 'conflict' THEN 2
         WHEN 'failed' THEN 3
         ELSE 4
       END,
       updated_at DESC,
       id`,
    [auth.accountId],
  );
  return {
    contract_version: CONTRACT_VERSION,
    workspace_id: auth.accountId,
    proposals: await Promise.all(
      result.rows.map((item) => readProposal(pool, auth.accountId, item.id)),
    ),
  };
}
