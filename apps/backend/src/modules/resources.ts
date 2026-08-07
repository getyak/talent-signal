import { randomUUID } from "node:crypto";

import {
  CONTRACT_VERSION,
  type EvidenceFragment,
  type EvidenceFragmentReviewRequest,
  type EvidenceFragmentReviewResponse,
  type RelationshipResourceDetail,
  type RelationshipResourceListItem,
  type RelationshipResourceListResponse,
  type ResourceClaimProposal,
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
import { proposeResourceClaimsForFragment } from "./resourceClaims.js";

interface ResourceListRow {
  id: string;
  capture_id: string;
  capture_version: number;
  resource_kind: RelationshipResourceListItem["kind"];
  input_channel: RelationshipResourceListItem["input_channel"];
  display_name: string;
  media_type: string;
  source_locator: string | null;
  observed_at: Date;
  processing_state: RelationshipResourceListItem["processing_state"];
  duplicate_of_resource_id: string | null;
  discovered_from_resource_id: string | null;
  fragment_count: number;
  proposed_fragment_count: number;
  pending_claim_count: number;
  conflicted_claim_count: number;
  source_access_state: RelationshipResourceListItem["source_access_state"];
  authorization_state:
    RelationshipResourceListItem["source_authorization_state"];
  authorization_expires_at: Date | null;
}

interface FragmentRow {
  id: string;
  account_id: string;
  capture_id: string;
  resource_id: string;
  fragment_kind: EvidenceFragment["kind"];
  sequence: number;
  text_content: string | null;
  content_hash: string;
  locator: EvidenceFragment["locator"];
  attributed_actor: EvidenceFragment["attribution"]["actor_kind"];
  attribution_status: EvidenceFragment["attribution"]["status"];
  review_status: EvidenceFragment["review_status"];
  parser_name: string;
  parser_version: string;
  created_at: Date;
}

interface ClaimRow {
  id: string;
  field: string;
  proposal_status: ResourceClaimProposal["proposal_status"];
  review_status: ResourceClaimProposal["review_status"];
  proposed_value: string | null;
  evidence_fragment_id: string;
  evidence_quote: string | null;
  subject_kind: ResourceClaimProposal["subject_kind"];
  temporal_relation: ResourceClaimProposal["temporal_relation"];
  supersedes_state_id: string | null;
  prior_confirmed_value: string | null;
  version: number;
  producer_name: string;
  producer_version: string;
  created_at: Date;
}

export interface ResourceReviewMutationResult {
  body: EvidenceFragmentReviewResponse;
  replayed: boolean;
  status: number;
}

function mapResource(row: ResourceListRow): RelationshipResourceListItem {
  return {
    id: row.id,
    capture_id: row.capture_id,
    capture_version: row.capture_version,
    kind: row.resource_kind,
    input_channel: row.input_channel,
    display_name: row.display_name,
    media_type: row.media_type,
    source_locator:
      row.authorization_state === "authorized"
        ? row.source_locator
        : null,
    observed_at: row.observed_at.toISOString(),
    processing_state: row.processing_state,
    duplicate_of_resource_id: row.duplicate_of_resource_id,
    discovered_from_resource_id: row.discovered_from_resource_id,
    fragment_count:
      row.authorization_state === "authorized"
        ? row.fragment_count
        : 0,
    proposed_fragment_count:
      row.authorization_state === "authorized"
        ? row.proposed_fragment_count
        : 0,
    pending_claim_count:
      row.authorization_state === "authorized"
        ? row.pending_claim_count
        : 0,
    conflicted_claim_count:
      row.authorization_state === "authorized"
        ? row.conflicted_claim_count
        : 0,
    source_access_state: row.source_access_state,
    source_authorization_state: row.authorization_state,
    source_authorization_expires_at:
      row.authorization_expires_at?.toISOString() ?? null,
  };
}

async function assertRelationshipScope(
  client: Pool | PoolClient,
  accountId: string,
  personId: string,
  relationshipContextId: string,
): Promise<void> {
  const scope = await client.query<{ id: string }>(
    `SELECT assignments.id
     FROM assignments
     JOIN subjects
       ON subjects.account_id = assignments.account_id
      AND subjects.id = assignments.subject_id
     WHERE assignments.account_id = $1
       AND subjects.id = $2
       AND assignments.id = $3
       AND subjects.status = 'active'
       AND assignments.status = 'active'`,
    [accountId, personId, relationshipContextId],
  );
  if (!scope.rows[0]) {
    throw new ApiError(
      404,
      "RELATIONSHIP_CONTEXT_NOT_FOUND",
      "The active person and relationship context were not found together.",
    );
  }
}

const RESOURCE_SELECT = `
  SELECT
    resources.id,
    resources.capture_id,
    captures.version AS capture_version,
    resources.resource_kind,
    resources.input_channel,
    resources.display_name,
    resources.media_type,
    resources.source_locator,
    resources.observed_at,
    resources.processing_state,
    resources.duplicate_of_resource_id,
    resources.discovered_from_resource_id,
    COUNT(fragments.id) FILTER (
      WHERE fragments.status = 'active'
    )::integer AS fragment_count,
    COUNT(fragments.id) FILTER (
      WHERE fragments.status = 'active'
        AND fragments.review_status = 'proposed'
    )::integer AS proposed_fragment_count,
    (
      SELECT COUNT(*)::integer
      FROM proposed_assertions claims
      JOIN evidence_fragments claim_fragments
        ON claim_fragments.account_id = claims.account_id
       AND claim_fragments.id = claims.evidence_fragment_id
      WHERE claims.account_id = resources.account_id
        AND claim_fragments.resource_id = resources.id
        AND claims.review_status IN ('pending', 'unresolved')
    ) AS pending_claim_count,
    (
      SELECT COUNT(*)::integer
      FROM proposed_assertions claims
      JOIN evidence_fragments claim_fragments
        ON claim_fragments.account_id = claims.account_id
       AND claim_fragments.id = claims.evidence_fragment_id
      WHERE claims.account_id = resources.account_id
        AND claim_fragments.resource_id = resources.id
        AND claims.review_status IN ('pending', 'unresolved')
        AND claims.proposal_status = 'ambiguous'
    ) AS conflicted_claim_count,
    receipts.source_access_state,
    CASE
      WHEN receipts.authorization_state = 'authorized'
       AND receipts.authorization_expires_at IS NOT NULL
       AND receipts.authorization_expires_at <= now()
      THEN 'expired'
      ELSE receipts.authorization_state
    END AS authorization_state,
    receipts.authorization_expires_at
  FROM source_resources resources
  JOIN captures
    ON captures.account_id = resources.account_id
   AND captures.id = resources.capture_id
  JOIN source_retention_receipts receipts
    ON receipts.account_id = captures.account_id
   AND receipts.capture_id = captures.id
  LEFT JOIN evidence_fragments fragments
    ON fragments.account_id = resources.account_id
   AND fragments.resource_id = resources.id
`;

export async function listRelationshipResources(
  pool: Pool,
  auth: AuthContext,
  personId: string,
  relationshipContextId: string,
): Promise<RelationshipResourceListResponse> {
  await assertRelationshipScope(
    pool,
    auth.accountId,
    personId,
    relationshipContextId,
  );
  const result = await pool.query<ResourceListRow>(
    `${RESOURCE_SELECT}
     WHERE resources.account_id = $1
       AND captures.subject_id = $2
       AND captures.assignment_id = $3
       AND captures.identity_status = 'bound'
       AND captures.status = 'active'
       AND resources.processing_state <> 'deleted'
     GROUP BY
       resources.id,
       captures.version,
       receipts.source_access_state,
       receipts.authorization_state,
       receipts.authorization_expires_at
     ORDER BY resources.observed_at DESC, resources.created_at DESC,
              resources.id DESC
     LIMIT 200`,
    [auth.accountId, personId, relationshipContextId],
  );
  return {
    contract_version: CONTRACT_VERSION,
    person_id: personId,
    relationship_context_id: relationshipContextId,
    resources: result.rows.map(mapResource),
  };
}

export async function getRelationshipResource(
  pool: Pool,
  auth: AuthContext,
  resourceId: string,
): Promise<RelationshipResourceDetail> {
  const resourceResult = await pool.query<ResourceListRow>(
    `${RESOURCE_SELECT}
     WHERE resources.account_id = $1
       AND resources.id = $2
       AND captures.identity_status = 'bound'
       AND captures.status = 'active'
       AND resources.processing_state <> 'deleted'
     GROUP BY
       resources.id,
       captures.version,
       receipts.source_access_state,
       receipts.authorization_state,
       receipts.authorization_expires_at`,
    [auth.accountId, resourceId],
  );
  const resource = resourceResult.rows[0];
  if (!resource) {
    throw new ApiError(
      404,
      "RELATIONSHIP_RESOURCE_NOT_FOUND",
      "The governed relationship resource was not found.",
    );
  }
  if (resource.authorization_state !== "authorized") {
    return {
      contract_version: CONTRACT_VERSION,
      resource: mapResource(resource),
      fragments: [],
      claim_proposals: [],
    };
  }
  const fragments = await pool.query<FragmentRow>(
    `SELECT
       id, account_id, capture_id, resource_id, fragment_kind, sequence,
       text_content, content_hash, locator, attributed_actor,
       attribution_status, review_status, parser_name, parser_version,
       created_at
     FROM evidence_fragments
     WHERE account_id = $1
       AND resource_id = $2
       AND status = 'active'
     ORDER BY sequence, id`,
    [auth.accountId, resourceId],
  );
  const claims = await pool.query<ClaimRow>(
    `SELECT
       assertions.id,
       assertions.field,
       assertions.proposal_status,
       assertions.review_status,
       assertions.proposed_value,
       assertions.evidence_fragment_id,
       assertions.evidence_quote,
       assertions.subject_kind,
       assertions.temporal_relation,
       assertions.supersedes_state_id,
       prior_states.value_text AS prior_confirmed_value,
       assertions.version,
       proposals.producer_name,
       proposals.producer_version,
       assertions.created_at
     FROM proposed_assertions assertions
     JOIN evidence_fragments fragments
       ON fragments.account_id = assertions.account_id
      AND fragments.id = assertions.evidence_fragment_id
     JOIN analysis_proposals proposals
       ON proposals.account_id = assertions.account_id
      AND proposals.id = assertions.analysis_proposal_id
     LEFT JOIN confirmed_states prior_states
       ON prior_states.account_id = assertions.account_id
      AND prior_states.id = assertions.supersedes_state_id
     WHERE assertions.account_id = $1
       AND fragments.resource_id = $2
       AND assertions.review_status <> 'deleted'
       AND fragments.status = 'active'
     ORDER BY assertions.created_at, assertions.field, assertions.id`,
    [auth.accountId, resourceId],
  );
  return {
    contract_version: CONTRACT_VERSION,
    resource: mapResource(resource),
    fragments: fragments.rows.map((fragment) => ({
      id: fragment.id,
      account_id: fragment.account_id,
      capture_id: fragment.capture_id,
      resource_id: fragment.resource_id,
      kind: fragment.fragment_kind,
      sequence: fragment.sequence,
      text: fragment.text_content,
      content_hash: fragment.content_hash,
      locator: fragment.locator,
      attribution: {
        actor_kind: fragment.attributed_actor,
        status: fragment.attribution_status,
      },
      review_status: fragment.review_status,
      parser: {
        name: fragment.parser_name,
        version: fragment.parser_version,
      },
      created_at: fragment.created_at.toISOString(),
    })),
    claim_proposals: claims.rows.map((claim) => ({
      id: claim.id,
      field: claim.field,
      proposal_status: claim.proposal_status,
      review_status: claim.review_status,
      proposed_value: claim.proposed_value,
      evidence_fragment_id: claim.evidence_fragment_id,
      evidence_quote: claim.evidence_quote,
      subject_kind: claim.subject_kind,
      temporal_relation: claim.temporal_relation,
      supersedes_state_id: claim.supersedes_state_id,
      prior_confirmed_value: claim.prior_confirmed_value,
      version: claim.version,
      producer: {
        name: claim.producer_name,
        version: claim.producer_version,
      },
      created_at: claim.created_at.toISOString(),
    })),
  };
}

export async function invalidateKnowledgeForFragment(
  client: PoolClient,
  accountId: string,
  fragmentId: string,
): Promise<string[]> {
  const snapshots = await client.query<{ id: string }>(
    `SELECT DISTINCT blocks.snapshot_id AS id
     FROM knowledge_dependencies dependencies
     JOIN knowledge_blocks blocks
       ON blocks.account_id = dependencies.account_id
      AND blocks.id = dependencies.block_id
     WHERE dependencies.account_id = $1
       AND dependencies.dependency_type = 'evidence_fragment'
       AND dependencies.dependency_id = $2`,
    [accountId, fragmentId],
  );
  const ids = snapshots.rows.map((snapshot) => snapshot.id);
  if (ids.length === 0) {
    return [];
  }
  await client.query(
    `UPDATE knowledge_snapshots
     SET status = 'superseded'
     WHERE account_id = $1
       AND id = ANY($2::uuid[])
       AND status = 'published'`,
    [accountId, ids],
  );
  await client.query(
    `UPDATE context_manifests
     SET status = 'superseded'
     WHERE account_id = $1
       AND knowledge_snapshot_id = ANY($2::uuid[])
       AND status = 'active'`,
    [accountId, ids],
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
    [accountId, ids],
  );
  return ids;
}

export async function reviewEvidenceFragment(
  pool: Pool,
  auth: AuthContext,
  fragmentId: string,
  request: EvidenceFragmentReviewRequest,
): Promise<ResourceReviewMutationResult> {
  return inTransaction(pool, async (client) => {
    const idempotency = await claimIdempotency(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "review_evidence_fragment",
      request.idempotency_key,
      { fragment_id: fragmentId, ...request },
    );
    if (idempotency.replay) {
      return {
        body: idempotency.replay.body as EvidenceFragmentReviewResponse,
        replayed: true,
        status: idempotency.replay.status,
      };
    }

    const fragmentResult = await client.query<{
      resource_id: string;
      review_status: EvidenceFragment["review_status"];
      identity_status: "bound" | "ambiguous" | "unbound";
      authorization_state: "authorized" | "revoked" | "expired";
    }>(
      `SELECT
         fragments.resource_id,
         fragments.review_status,
         captures.identity_status,
         CASE
           WHEN receipts.authorization_state = 'authorized'
            AND receipts.authorization_expires_at IS NOT NULL
            AND receipts.authorization_expires_at <= now()
           THEN 'expired'
           ELSE receipts.authorization_state
         END AS authorization_state
       FROM evidence_fragments fragments
       JOIN source_resources resources
         ON resources.account_id = fragments.account_id
        AND resources.id = fragments.resource_id
       JOIN captures
         ON captures.account_id = resources.account_id
        AND captures.id = resources.capture_id
       JOIN source_retention_receipts receipts
         ON receipts.account_id = captures.account_id
        AND receipts.capture_id = captures.id
       WHERE fragments.account_id = $1
         AND fragments.id = $2
         AND fragments.status = 'active'
         AND resources.processing_state <> 'deleted'
         AND captures.status = 'active'
       FOR UPDATE OF fragments, resources`,
      [auth.accountId, fragmentId],
    );
    const fragment = fragmentResult.rows[0];
    if (!fragment) {
      throw new ApiError(
        404,
        "EVIDENCE_FRAGMENT_NOT_FOUND",
        "The active evidence fragment was not found.",
      );
    }
    if (fragment.identity_status !== "bound") {
      throw new ApiError(
        409,
        "EVIDENCE_IDENTITY_UNRESOLVED",
        "Resolve the source identity before reviewing its evidence fragments.",
      );
    }
    if (fragment.authorization_state !== "authorized") {
      throw new ApiError(
        409,
        "EVIDENCE_SOURCE_AUTHORIZATION_UNAVAILABLE",
        "Restore or renew the source authorization before reviewing its evidence.",
      );
    }
    if (fragment.review_status !== request.expected_review_status) {
      throw new ApiError(
        409,
        "EVIDENCE_REVIEW_STALE",
        "The evidence fragment review state changed before this decision.",
        { current_review_status: fragment.review_status },
      );
    }

    const decidedAt = new Date();
    await client.query(
      `INSERT INTO evidence_fragment_reviews(
         id, account_id, fragment_id, decided_by_user_id,
         prior_review_status, decision, reason, decided_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        randomUUID(),
        auth.accountId,
        fragmentId,
        auth.userId,
        fragment.review_status,
        request.decision,
        request.reason,
        decidedAt,
      ],
    );
    await client.query(
      `UPDATE evidence_fragments
       SET review_status = $3
       WHERE account_id = $1 AND id = $2`,
      [auth.accountId, fragmentId, request.decision],
    );
    const proposedClaimCount =
      request.decision === "reviewed"
        ? await proposeResourceClaimsForFragment(
            client,
            auth,
            fragmentId,
          )
        : 0;

    const counts = await client.query<{
      proposed_count: number;
      reviewed_count: number;
      pending_claim_count: number;
    }>(
      `SELECT
         COUNT(*) FILTER (
           WHERE review_status = 'proposed' AND status = 'active'
         )::integer AS proposed_count,
         COUNT(*) FILTER (
           WHERE review_status = 'reviewed' AND status = 'active'
         )::integer AS reviewed_count,
         (
           SELECT COUNT(*)::integer
           FROM proposed_assertions assertions
           JOIN evidence_fragments claim_fragments
             ON claim_fragments.account_id = assertions.account_id
            AND claim_fragments.id = assertions.evidence_fragment_id
           WHERE assertions.account_id = $1
             AND claim_fragments.resource_id = $2
             AND assertions.review_status IN ('pending', 'unresolved')
         ) AS pending_claim_count
       FROM evidence_fragments
       WHERE account_id = $1 AND resource_id = $2`,
      [auth.accountId, fragment.resource_id],
    );
    const proposedCount = counts.rows[0]?.proposed_count ?? 0;
    const reviewedCount = counts.rows[0]?.reviewed_count ?? 0;
    const pendingClaimCount =
      counts.rows[0]?.pending_claim_count ?? 0;
    const processingState:
      | "needs_fact_review"
      | "ready"
      | "failed" =
      proposedCount > 0 || pendingClaimCount > 0
        ? "needs_fact_review"
        : reviewedCount > 0
          ? "ready"
          : "failed";
    await client.query(
      `UPDATE source_resources
       SET processing_state = $3, updated_at = $4
       WHERE account_id = $1 AND id = $2`,
      [
        auth.accountId,
        fragment.resource_id,
        processingState,
        decidedAt,
      ],
    );
    const invalidatedSnapshotIds =
      await invalidateKnowledgeForFragment(
        client,
        auth.accountId,
        fragmentId,
      );

    const body: EvidenceFragmentReviewResponse = {
      fragment_id: fragmentId,
      resource_id: fragment.resource_id,
      review_status: request.decision,
      resource_processing_state: processingState,
      decided_at: decidedAt.toISOString(),
    };
    await appendAudit(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "evidence_fragment.reviewed",
      "evidence_fragment",
      fragmentId,
      {
        decision: request.decision,
        resource_id: fragment.resource_id,
        proposed_claim_count: proposedClaimCount,
        invalidated_snapshot_ids: invalidatedSnapshotIds,
      },
    );
    await completeIdempotency(client, idempotency, 201, body);
    return { body, replayed: false, status: 201 };
  });
}
