import {
  CONTRACT_VERSION,
  type MemoryPursuitScope,
  type MemoryPursuitScopesResponse,
} from "@talent-signal/contracts";
import type { DatabaseClient } from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import type { AuthContext } from "./auth.js";

interface PursuitScopeRow {
  role_id: string;
  person_id: string;
  person_display_label: string;
  relationship_context_id: string | null;
  relationship_display_label: string | null;
  role_evidence_fragment_id: string | null;
  capture_id: string | null;
  capture_version: number | null;
  pending_review: boolean;
}

/**
 * Resolve the person/relationship Memory scopes an authorized Pursuit may
 * open. A confirmed role (confidence `confirmed`, status `active`/`quiet`,
 * person-only) reaches a context only through its current, active evidence
 * reference: `pursuit_roles.person_id` -> `pursuit_role_evidence` ->
 * `evidence_fragments` -> active `captures` -> active `assignments` whose
 * subject matches the role person. A role with no valid evidentiary context is
 * returned person-only rather than granting all of that person's relationships.
 */
export async function resolveMemoryPursuitScopes(
  client: DatabaseClient,
  auth: AuthContext,
  pursuitId: string,
): Promise<MemoryPursuitScopesResponse> {
  const pursuit = await client.query<{ id: string; title: string }>(
    `SELECT id, title FROM pursuits
     WHERE account_id = $1 AND id = $2 AND status <> 'cancelled'`,
    [auth.accountId, pursuitId],
  );
  if (!pursuit.rows[0]) {
    throw new ApiError(404, "MEMORY_NOT_FOUND", "The requested Pursuit was not found.");
  }
  const result = await client.query<PursuitScopeRow>(
    `SELECT DISTINCT
       role.id AS role_id,
       role.person_id,
       subject.display_label AS person_display_label,
       capture.assignment_id AS relationship_context_id,
       assignment.display_label AS relationship_display_label,
       fragment.id AS role_evidence_fragment_id,
       capture.id AS capture_id,
       capture.version AS capture_version,
       EXISTS (
         SELECT 1 FROM memory_proposals proposal
         JOIN memory_proposal_items item
           ON item.account_id = proposal.account_id
          AND item.proposal_id = proposal.id
         WHERE proposal.account_id = role.account_id
           AND proposal.status IN ('open', 'partially_committed')
           AND proposal.expires_at > now()
           AND item.status = 'pending'
           AND item.subject_id = role.person_id
           AND (
             capture.assignment_id IS NULL
             OR item.relationship_context_id IS NULL
             OR item.relationship_context_id = capture.assignment_id
           )
       ) AS pending_review
     FROM pursuit_roles role
     JOIN subjects subject
       ON subject.account_id = role.account_id
      AND subject.id = role.person_id
      AND subject.status = 'active'
     LEFT JOIN pursuit_role_evidence role_evidence
       ON role_evidence.account_id = role.account_id
      AND role_evidence.role_id = role.id
     LEFT JOIN evidence_fragments fragment
       ON fragment.account_id = role_evidence.account_id
      AND fragment.id = role_evidence.evidence_fragment_id
      AND fragment.status = 'active'
      AND fragment.review_status = 'reviewed'
      AND fragment.attribution_status = 'confirmed'
      AND fragment.text_content IS NOT NULL
     LEFT JOIN source_resources resource
       ON resource.account_id = fragment.account_id
      AND resource.id = fragment.resource_id
      AND resource.processing_state <> 'deleted'
     LEFT JOIN captures capture
       ON capture.account_id = fragment.account_id
      AND capture.id = fragment.capture_id
      AND capture.status = 'active'
      AND capture.identity_status = 'bound'
      AND capture.subject_id = role.person_id
     LEFT JOIN source_retention_receipts receipt
       ON receipt.account_id = capture.account_id
      AND receipt.capture_id = capture.id
      AND receipt.source_access_state = 'available'
      AND receipt.authorization_state = 'authorized'
      AND (
        receipt.authorization_expires_at IS NULL
        OR receipt.authorization_expires_at > now()
      )
      AND (
        receipt.retention_until IS NULL
        OR receipt.retention_until > now()
      )
     LEFT JOIN assignments assignment
       ON assignment.account_id = capture.account_id
      AND assignment.id = capture.assignment_id
      AND assignment.status = 'active'
      AND assignment.subject_id = role.person_id
      AND resource.id IS NOT NULL
      AND receipt.capture_id IS NOT NULL
     WHERE role.account_id = $1
       AND role.pursuit_id = $2
       AND role.person_id IS NOT NULL
       AND role.status IN ('active', 'quiet')
       AND role.confidence = 'confirmed'
     ORDER BY role.person_id, capture.assignment_id`,
    [auth.accountId, pursuitId],
  );

  const scopes: MemoryPursuitScope[] = [];
  const seen = new Set<string>();
  for (const row of result.rows) {
    const relationshipContextId = row.relationship_context_id
      && row.relationship_display_label
      ? row.relationship_context_id
      : null;
    // Keep each exact evidence reference; do not deduplicate away which
    // fragment/capture epoch authorized a context.
    const key = `${row.person_id}:${relationshipContextId ?? ""}:${row.role_evidence_fragment_id ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    scopes.push({
      person_id: row.person_id,
      person_display_label: row.person_display_label,
      relationship_context_id: relationshipContextId,
      relationship_display_label: row.relationship_display_label,
      role_id: row.role_id,
      role_evidence_fragment_id: row.role_evidence_fragment_id,
      capture_id: row.capture_id,
      capture_version: row.capture_version,
      has_pending_review: row.pending_review,
    });
  }
  return {
    contract_version: CONTRACT_VERSION,
    pursuit_id: pursuitId,
    pursuit_display_label: pursuit.rows[0].title,
    scopes,
  };
}

interface PursuitAssociation {
  pursuitId: string;
  roleId: string;
  evidenceFragmentId: string;
  personId: string;
  relationshipContextId: string | null;
  /** Stored capture epoch; when provided the current version must match. */
  captureVersion?: number | null;
  captureId?: string | null;
}

export interface PursuitAssociationResult {
  captureId: string;
  captureVersion: number;
  relationshipContextId: string | null;
}

/**
 * Revalidate one exact Pursuit role/evidence association against current
 * authority. Reused by review open/read/draft/commit/undo so a resolved
 * association can never degrade into an unrestricted relationship scope, and a
 * later removal/revocation/rebind invalidates the derived review.
 */
export async function assertPursuitAssociationCurrent(
  client: DatabaseClient,
  auth: AuthContext,
  association: PursuitAssociation,
  options: { lock?: boolean; acceptedHistory?: boolean } = {},
): Promise<PursuitAssociationResult> {
  const lock = options.lock === true;
  const result = await client.query<{
    role_id: string;
    person_id: string;
    relationship_context_id: string | null;
    capture_id: string;
    capture_version: number;
    assignment_id: string | null;

  }>(
    `SELECT role.id AS role_id, role.person_id,
            capture.assignment_id AS relationship_context_id,
            capture.id AS capture_id, capture.version AS capture_version,
            assignment.id AS assignment_id
     FROM pursuit_roles role
     JOIN pursuits pursuit
       ON pursuit.account_id = role.account_id
      AND pursuit.id = role.pursuit_id
      AND pursuit.status <> 'cancelled'
     JOIN subjects subject
       ON subject.account_id = role.account_id
      AND subject.id = role.person_id
      AND subject.status = 'active'
     JOIN pursuit_role_evidence role_evidence
       ON role_evidence.account_id = role.account_id
      AND role_evidence.role_id = role.id
     JOIN evidence_fragments fragment
       ON fragment.account_id = role_evidence.account_id
      AND fragment.id = role_evidence.evidence_fragment_id
      AND ${options.acceptedHistory ? "fragment.status IN ('active', 'purged')" : "fragment.status = 'active'"}
      AND fragment.review_status = 'reviewed'
      AND fragment.attribution_status = 'confirmed'
      ${options.acceptedHistory ? "" : "AND fragment.text_content IS NOT NULL"}
     JOIN source_resources resource
       ON resource.account_id = fragment.account_id
      AND resource.id = fragment.resource_id
      AND resource.processing_state <> 'deleted'
     JOIN captures capture
       ON capture.account_id = fragment.account_id
      AND capture.id = fragment.capture_id
      AND capture.status = 'active'
      AND capture.identity_status = 'bound'
      AND capture.subject_id = role.person_id
     JOIN source_retention_receipts receipt
       ON receipt.account_id = capture.account_id
      AND receipt.capture_id = capture.id
      AND ${options.acceptedHistory
        ? "receipt.source_access_state IN ('available', 'purged') AND receipt.authorization_state IN ('authorized', 'expired')"
        : "receipt.source_access_state = 'available' AND receipt.authorization_state = 'authorized' AND (receipt.authorization_expires_at IS NULL OR receipt.authorization_expires_at > now()) AND (receipt.retention_until IS NULL OR receipt.retention_until > now())"}
     LEFT JOIN assignments assignment
       ON assignment.account_id = capture.account_id
      AND assignment.id = capture.assignment_id
      AND assignment.status = 'active'
      AND assignment.subject_id = role.person_id
     WHERE role.account_id = $1
       AND role.id = $2
       AND role.pursuit_id = $3
       AND role.person_id = $4
       AND role.status IN ('active', 'quiet')
       AND role.confidence = 'confirmed'
       AND fragment.id = $5
       AND NOT EXISTS (SELECT 1 FROM memory_source_revocations revoked
         WHERE revoked.account_id = capture.account_id AND revoked.source_kind = 'capture'
           AND revoked.source_id = capture.id::text AND (revoked.source_version IS NULL OR revoked.source_version = COALESCE($6::integer, capture.version)))
       AND (capture.assignment_id IS NULL OR assignment.id IS NOT NULL)
     ${lock ? "FOR SHARE OF pursuit, role, role_evidence, fragment, resource, capture, receipt, subject" : ""}`,
    [
      auth.accountId,
      association.roleId,
      association.pursuitId,
      association.personId,
      association.evidenceFragmentId,
      association.captureVersion ?? null,
    ],
  );
  const row = result.rows[0];
  const contextMatches = association.relationshipContextId === null
    ? true
    : row?.relationship_context_id === association.relationshipContextId;
  let versionMatches = association.captureVersion == null || row?.capture_version === association.captureVersion;
  if (!versionMatches && options.acceptedHistory && row && association.captureVersion != null && row.capture_version > association.captureVersion) {
    const chain = await client.query<{ count: number }>(`SELECT count(*)::integer AS count FROM source_natural_epoch_transitions
      WHERE account_id=$1 AND capture_id=$2 AND from_version >= $3 AND to_version <= $4`,
      [auth.accountId, row.capture_id, association.captureVersion, row.capture_version]);
    // Unique contiguous single-version edges prove every intervening change was
    // natural. A manual rebind/revoke/correction leaves a gap and stays denied.
    versionMatches = chain.rows[0]?.count === row.capture_version - association.captureVersion;
  }
  const captureMatches = association.captureId == null || row?.capture_id === association.captureId;
  // PostgreSQL cannot lock the nullable side of an outer join. Lock and
  // revalidate that row separately before releasing any authority to callers.
  let assignmentMatches = true;
  if (row?.relationship_context_id && lock) {
    const assignment = await client.query(
      `SELECT id FROM assignments WHERE account_id = $1 AND id = $2
       AND subject_id = $3 AND status = 'active' FOR SHARE`,
      [auth.accountId, row.relationship_context_id, association.personId],
    );
    assignmentMatches = assignment.rowCount === 1;
  }
  if (!row || !contextMatches || !versionMatches || !captureMatches || !assignmentMatches) {
    throw new ApiError(
      409,
      "MEMORY_PURSUIT_ASSOCIATION_STALE",
      "The Pursuit role, evidence or bound source is no longer current; reopen the review from the Pursuit.",
    );
  }
  return {
    captureId: row.capture_id,
    captureVersion: row.capture_version,
    relationshipContextId: row.relationship_context_id,
  };
}
