import { randomUUID } from "node:crypto";

import { AgentCapabilityError } from "@talent-signal/agent";
import type {
  AgentCapabilityGateway,
  AgentEvidence,
  AgentNoActionCandidate,
  AgentProposalCandidate,
  AgentRunScope,
} from "@talent-signal/agent";
import type { StagePursuitProposalRequest } from "@talent-signal/contracts";
import type { Pool } from "pg";

import type { DatabaseClient } from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import { sha256 } from "../lib/hash.js";
import type { AuthContext } from "./auth.js";
import { stagePursuitProposal } from "./pursuitProposals.js";
import { readPursuit } from "./pursuits.js";

interface EvidenceRow {
  fragment_id: string;
  text_content: string;
  content_hash: string;
  observed_at: Date | string;
  source_display_name: string;
  retention_scope: string;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

async function assertCaptureScope(
  pool: DatabaseClient,
  auth: AuthContext,
  pursuitID: string,
  captureID: string,
): Promise<void> {
  const result = await pool.query<{ id: string }>(
    `SELECT captures.id
     FROM captures
     JOIN pursuit_roles roles
       ON roles.account_id = captures.account_id
      AND roles.pursuit_id = $3
      AND roles.person_id = captures.subject_id
      AND roles.role_type = 'candidate'
      AND roles.status = 'active'
      AND roles.confidence = 'confirmed'
     WHERE captures.account_id = $1
       AND captures.id = $2
       AND captures.status = 'active'
       AND captures.identity_status = 'bound'`,
    [auth.accountId, captureID, pursuitID],
  );
  if (!result.rows[0]) {
    throw new ApiError(
      422,
      "AGENT_CAPTURE_SCOPE_INVALID",
      "The Capture is not identity-bound to a confirmed candidate role in this Pursuit.",
    );
  }
}

async function readAuthorizedEvidence(
  pool: DatabaseClient,
  auth: AuthContext,
  captureID: string,
  evidenceRefs: readonly string[],
): Promise<EvidenceRow[]> {
  if (evidenceRefs.length === 0) return [];
  const result = await pool.query<EvidenceRow>(
    `SELECT
       fragments.id AS fragment_id,
       fragments.text_content,
       fragments.content_hash,
       resources.observed_at,
       resources.display_name AS source_display_name,
       resources.retention_scope
     FROM evidence_fragments fragments
     JOIN source_resources resources
       ON resources.account_id = fragments.account_id
      AND resources.id = fragments.resource_id
     JOIN captures
       ON captures.account_id = fragments.account_id
      AND captures.id = fragments.capture_id
     JOIN source_retention_receipts receipts
       ON receipts.account_id = fragments.account_id
      AND receipts.capture_id = fragments.capture_id
     WHERE fragments.account_id = $1
       AND fragments.capture_id = $2
       AND fragments.id = ANY($3::uuid[])
       AND fragments.status = 'active'
       AND fragments.review_status = 'reviewed'
       AND fragments.attribution_status = 'confirmed'
       AND fragments.text_content IS NOT NULL
       AND resources.processing_state <> 'deleted'
       AND captures.status = 'active'
       AND captures.identity_status = 'bound'
       AND receipts.source_access_state <> 'deleted'
       AND receipts.authorization_state = 'authorized'
       AND (
         receipts.authorization_expires_at IS NULL
         OR receipts.authorization_expires_at > now()
       )
     ORDER BY array_position($3::uuid[], fragments.id)`,
    [auth.accountId, captureID, evidenceRefs],
  );
  if (
    result.rows.length !== evidenceRefs.length ||
    result.rows.some((row) => sha256(row.text_content) !== row.content_hash)
  ) {
    throw new ApiError(
      422,
      "AGENT_EVIDENCE_UNAVAILABLE",
      "Every Agent fragment must remain active, authorized, reviewed, attribution-confirmed, and content-identical.",
    );
  }
  return result.rows;
}

export async function compileAgentScope(
  pool: DatabaseClient,
  auth: AuthContext,
  input: {
    runID: string;
    pursuitID: string;
    pursuitRevision: number;
    captureID: string;
    objective: string;
    evidenceRefs: readonly string[];
  },
): Promise<AgentRunScope> {
  const pursuit = await readPursuit(pool, auth.accountId, input.pursuitID);
  if (pursuit.revision !== input.pursuitRevision) {
    throw new ApiError(
      409,
      "AGENT_PURSUIT_BASE_CONFLICT",
      "The Pursuit changed before the Agent context could be frozen.",
      { current_revision: pursuit.revision },
    );
  }
  await assertCaptureScope(pool, auth, input.pursuitID, input.captureID);
  const evidence = await readAuthorizedEvidence(
    pool,
    auth,
    input.captureID,
    input.evidenceRefs,
  );
  return {
    runID: input.runID,
    workspaceID: auth.accountId,
    userID: auth.userId,
    pursuitID: input.pursuitID,
    pursuitRevision: input.pursuitRevision,
    captureID: input.captureID,
    objective: input.objective.trim(),
    evidenceManifest: evidence.map((item) => ({
      fragmentID: item.fragment_id,
      contentHash: item.content_hash,
      inclusionReason:
        "Explicitly selected, reviewed evidence for this one Pursuit run.",
      authorizationScope: item.retention_scope,
    })),
  };
}

function mapProposalItems(
  items: AgentProposalCandidate["items"],
): StagePursuitProposalRequest["items"] {
  return items.map((item) => {
    const common = {
      item_key: item.itemKey,
      basis_kind: "evidence_supported" as const,
      epistemic_status: item.epistemicStatus,
      evidence_refs: item.evidenceRefs,
      reason: item.reason,
      effect_summary: item.effectSummary,
    };
    switch (item.change.kind) {
      case "set_milestone":
        return {
          ...common,
          change: {
            kind: item.change.kind,
            proposed_value: item.change.proposedValue,
          },
        };
      case "set_pursuit_status":
        return {
          ...common,
          change: {
            kind: item.change.kind,
            proposed_value: item.change.proposedValue,
          },
        };
      case "set_role_status":
        return {
          ...common,
          change: {
            kind: item.change.kind,
            role_id: item.change.roleID,
            proposed_value: item.change.proposedValue,
          },
        };
      case "add_gap":
        return {
          ...common,
          change: {
            kind: item.change.kind,
            proposed_value: {
              title: item.change.proposedValue.title,
              basis_summary: item.change.proposedValue.basisSummary,
              close_condition: item.change.proposedValue.closeCondition,
            },
          },
        };
      case "add_action":
        return {
          ...common,
          change: {
            kind: item.change.kind,
            proposed_value: {
              title: item.change.proposedValue.title,
              owner_user_id: item.change.proposedValue.ownerUserID,
              due_at: item.change.proposedValue.dueAt,
            },
          },
        };
    }
  });
}

export class DatabaseAgentGateway implements AgentCapabilityGateway {
  constructor(
    private readonly pool: Pool,
    private readonly auth: AuthContext,
  ) {}

  async readPursuit(scope: AgentRunScope) {
    const pursuit = await readPursuit(
      this.pool,
      this.auth.accountId,
      scope.pursuitID,
    );
    return {
      workspaceID: pursuit.workspace_id,
      pursuitID: pursuit.id,
      revision: pursuit.revision,
      title: pursuit.title,
      status: pursuit.status,
      milestone: pursuit.milestone,
      roles: pursuit.roles,
      gaps: pursuit.gaps,
      actions: pursuit.actions,
    };
  }

  async readEvidence(
    scope: AgentRunScope,
    evidenceRefs: readonly string[],
  ): Promise<readonly AgentEvidence[]> {
    let rows: EvidenceRow[];
    try {
      await assertCaptureScope(
        this.pool,
        this.auth,
        scope.pursuitID,
        scope.captureID,
      );
      rows = await readAuthorizedEvidence(
        this.pool,
        this.auth,
        scope.captureID,
        evidenceRefs,
      );
    } catch (error) {
      if (error instanceof ApiError) {
        throw new AgentCapabilityError(error.code, error.message);
      }
      throw error;
    }
    return rows.map((item) => ({
      fragmentID: item.fragment_id,
      text: item.text_content,
      observedAt: iso(item.observed_at),
      sourceDisplayName: item.source_display_name,
      attributionStatus: "confirmed",
      reviewStatus: "reviewed",
      availability: "available",
      contentHash: item.content_hash,
    }));
  }

  async commitProposal(
    scope: AgentRunScope,
    candidate: AgentProposalCandidate,
    candidateFingerprint: string,
  ) {
    const result = await stagePursuitProposal(
      this.pool,
      this.auth,
      scope.pursuitID,
      {
        idempotency_key: `agent:${scope.runID}:${candidateFingerprint}`,
        proposal_id: scope.runID,
        capture_id: scope.captureID,
        base_revision: scope.pursuitRevision,
        summary: candidate.summary,
        producer: {
          kind: "agent",
          name: "talent-signal-pursuit-momentum",
          version: "1.0.0",
          run_id: scope.runID,
        },
        items: mapProposalItems(candidate.items),
      },
    );
    if (result.body.proposal.status !== "needs_review") {
      throw new ApiError(
        500,
        "AGENT_PROPOSAL_READBACK_MISMATCH",
        "The Agent Proposal did not remain review-only after staging.",
      );
    }
    return {
      proposalID: result.body.proposal.id,
      status: "needs_review" as const,
      replayed: result.replayed,
    };
  }

  async commitNoAction(
    scope: AgentRunScope,
    candidate: AgentNoActionCandidate,
    candidateFingerprint: string,
  ) {
    const id = randomUUID();
    const result = await this.pool.query<{ id: string; inserted: boolean }>(
      `INSERT INTO agent_no_actions(
         id, account_id, run_id, pursuit_id, capture_id, reason,
         missing_evidence_refs, candidate_fingerprint, external_effects
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '[]'::jsonb)
       ON CONFLICT (account_id, run_id) DO UPDATE
       SET run_id = agent_no_actions.run_id
       RETURNING id, (xmax = 0) AS inserted`,
      [
        id,
        this.auth.accountId,
        scope.runID,
        scope.pursuitID,
        scope.captureID,
        candidate.reason,
        JSON.stringify(candidate.missingEvidenceRefs),
        candidateFingerprint,
      ],
    );
    return {
      noActionID: result.rows[0]?.id ?? id,
      replayed: !(result.rows[0]?.inserted ?? true),
    };
  }
}
