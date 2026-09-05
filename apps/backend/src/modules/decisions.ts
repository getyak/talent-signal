import { randomUUID } from "node:crypto";

import type {
  AssertionDecisionRequest,
  AssertionDecisionResponse,
} from "@talent-signal/contracts";
import type { Pool } from "pg";

import { inTransaction } from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import { appendAudit } from "../lib/audit.js";
import {
  claimIdempotency,
  completeIdempotency,
} from "../lib/idempotency.js";
import type { AuthContext } from "./auth.js";
import type { MutationResult } from "./captures.js";
import { invalidateKnowledgeForFragment } from "./resources.js";
import { isCompleteReviewDate, loadClaimReviewAuthority, requiresCalendarDate } from "./claimReviewAuthority.js";

interface AssertionContext {
  id: string;
  capture_id: string;
  field: string;
  proposal_status: "proposed" | "ambiguous" | "superseded";
  review_status:
    | "pending"
    | "confirmed"
    | "dismissed"
    | "unresolved"
    | "deleted";
  proposed_value: string | null;
  temporal_relation: "new" | "reinforces" | "supersedes";
  supersedes_state_id: string | null;
  evidence_fragment_id: string | null;
  version: number;
  capture_status: "active" | "deleted";
  subject_id: string | null;
  assignment_id: string | null;
  authorization_state: "authorized" | "revoked" | "expired";
}

export async function decideAssertion(
  pool: Pool,
  auth: AuthContext,
  assertionId: string,
  request: AssertionDecisionRequest,
): Promise<MutationResult<AssertionDecisionResponse>> {
  return inTransaction(pool, async (client) => {
    const idempotency = await claimIdempotency(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      `decide_assertion:${assertionId}`,
      request.idempotency_key,
      request,
    );
    // Match evidence review/deletion lock order: capture before its children.
    await client.query(`SELECT id FROM captures WHERE account_id = $1 AND id = (
      SELECT capture_id FROM proposed_assertions WHERE account_id = $1 AND id = $2
    ) FOR UPDATE`, [auth.accountId, assertionId]);
    const result = await client.query<AssertionContext>(
      `SELECT
         assertions.id,
         assertions.capture_id,
         assertions.field,
         assertions.proposal_status,
         assertions.review_status,
         assertions.proposed_value,
         assertions.temporal_relation,
         assertions.supersedes_state_id,
         assertions.evidence_fragment_id,
         assertions.version,
         captures.status AS capture_status,
         captures.subject_id,
         captures.assignment_id,
         CASE
           WHEN receipts.authorization_state = 'authorized'
            AND receipts.authorization_expires_at IS NOT NULL
            AND receipts.authorization_expires_at <= now()
           THEN 'expired'
           ELSE receipts.authorization_state
         END AS authorization_state
       FROM proposed_assertions assertions
       JOIN captures
         ON captures.account_id = assertions.account_id
        AND captures.id = assertions.capture_id
       JOIN source_retention_receipts receipts
         ON receipts.account_id = captures.account_id
        AND receipts.capture_id = captures.id
       WHERE assertions.account_id = $1 AND assertions.id = $2
       FOR UPDATE OF assertions, captures, receipts`,
      [auth.accountId, assertionId],
    );
    const assertion = result.rows[0];
    if (!assertion) {
      throw new ApiError(
        404,
        "ASSERTION_NOT_FOUND",
        "The assertion proposal was not found.",
      );
    }
    if (
      assertion.capture_status === "deleted" ||
      assertion.review_status === "deleted"
    ) {
      throw new ApiError(
        410,
        "ASSERTION_DELETED",
        "Deleted evidence cannot receive a fact decision.",
      );
    }
    if (assertion.authorization_state !== "authorized") {
      throw new ApiError(
        409,
        "ASSERTION_SOURCE_AUTHORIZATION_UNAVAILABLE",
        "Restore or renew and then review the source before deciding this claim.",
      );
    }
    if (assertion.evidence_fragment_id) {
      await client.query(
        `SELECT id FROM evidence_fragments WHERE account_id = $1 AND id = $2 FOR UPDATE`,
        [auth.accountId, assertion.evidence_fragment_id],
      );
    }
    const authority = await loadClaimReviewAuthority(client, auth.accountId, assertionId);
    const screenshotClaim = authority.row.resource_kind === "conversation_screenshot" && Boolean(assertion.evidence_fragment_id);
    if ((screenshotClaim || request.expected_review_token) && request.expected_review_token !== authority.token) {
      throw new ApiError(409, "CLAIM_REVIEW_STALE", "The source, identity, or review changed. Reload the current claim before deciding.");
    }
    const blocked = authority.blockers.filter((reason) => reason !== "calendar_date_required");
    if (blocked.length > 0) {
      throw new ApiError(409, "CLAIM_EVIDENCE_UNAVAILABLE", "Resolve the source, identity, and speaker before deciding this claim.", { blockers: blocked });
    }
    if (idempotency.replay) {
      const replay = idempotency.replay.body as AssertionDecisionResponse;
      const latest = await client.query<{ id: string }>(
        `SELECT id FROM fact_decisions WHERE account_id = $1 AND assertion_id = $2 ORDER BY decided_at DESC, id DESC LIMIT 1`,
        [auth.accountId, assertionId],
      );
      if (latest.rows[0]?.id !== replay.decision_id) {
        throw new ApiError(409, "CLAIM_DECISION_SUPERSEDED", "A later decision replaced this result. Review the current claim.");
      }
      return { body: replay, replayed: true, status: idempotency.replay.status };
    }
    if (assertion.version !== request.expected_assertion_version) {
      throw new ApiError(
        409,
        "ASSERTION_VERSION_CONFLICT",
        "The assertion changed; review the current version.",
        { current_version: assertion.version },
      );
    }
    if (
      assertion.review_status === "confirmed" ||
      assertion.review_status === "dismissed"
    ) {
      throw new ApiError(
        409,
        "ASSERTION_ALREADY_DECIDED",
        "The assertion already has a final user decision.",
      );
    }
    if (
      request.decision === "confirm" &&
      (!assertion.subject_id || !assertion.assignment_id)
    ) {
      throw new ApiError(
        422,
        "IDENTITY_REVIEW_REQUIRED",
        "A fact cannot be confirmed without a bound subject and assignment.",
      );
    }
    if (
      request.decision === "confirm" &&
      assertion.proposal_status === "ambiguous" &&
      !request.corrected_value
    ) {
      throw new ApiError(
        422,
        "AMBIGUOUS_VALUE_REQUIRES_CORRECTION",
        "Confirming an ambiguous proposal requires an explicit corrected value.",
      );
    }

    const chosenValue = request.corrected_value ?? assertion.proposed_value;
    if (request.decision === "confirm" &&
        (requiresCalendarDate(assertion.field, assertion.proposed_value ?? "") || requiresCalendarDate(assertion.field, chosenValue ?? "")) &&
        !isCompleteReviewDate(chosenValue ?? "")) {
      throw new ApiError(422, "CALENDAR_DATE_REQUIRED", "Review a complete calendar date (YYYY-MM-DD). Import time does not establish message time.");
    }
    if (request.decision === "confirm" && !chosenValue) {
      throw new ApiError(
        422,
        "CONFIRMED_VALUE_REQUIRED",
        "A confirmed fact requires an explicit value.",
      );
    }

    let existingStateId: string | null = null;
    if (request.decision === "confirm") {
      const activeState = await client.query<{
        id: string;
        value_text: string | null;
      }>(
        `SELECT id, value_text
         FROM confirmed_states
         WHERE account_id = $1
           AND assignment_id = $2
           AND field = $3
           AND status = 'active'
         FOR UPDATE`,
        [auth.accountId, assertion.assignment_id, assertion.field],
      );
      const active = activeState.rows[0];
      if (assertion.temporal_relation === "supersedes") {
        if (
          !active ||
          !assertion.supersedes_state_id ||
          active.id !== assertion.supersedes_state_id
        ) {
          throw new ApiError(
            409,
            "SUPERSESSION_TARGET_STALE",
            "The state selected for supersession is no longer active.",
          );
        }
      } else if (active && active.value_text !== chosenValue) {
        throw new ApiError(
          409,
          "STATE_CONFLICT_REQUIRES_SUPERSESSION",
          "A different active value exists; create a reviewed supersession proposal.",
          { active_state_id: active.id },
        );
      } else if (active) {
        existingStateId = active.id;
      }
    }

    const decisionId = randomUUID();
    const decidedAt = new Date();
    await client.query(
      `INSERT INTO fact_decisions(
         id, account_id, assertion_id, decided_by_user_id, decision,
         proposed_value_at_decision, corrected_value, assertion_version,
         decided_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        decisionId,
        auth.accountId,
        assertionId,
        auth.userId,
        request.decision,
        assertion.proposed_value,
        request.corrected_value ?? null,
        assertion.version,
        decidedAt,
      ],
    );

    let confirmedStateId: string | null = null;
    if (request.decision === "confirm") {
      if (existingStateId) {
        confirmedStateId = existingStateId;
      } else {
        if (assertion.temporal_relation === "supersedes") {
          await client.query(
            `UPDATE confirmed_states
             SET status = 'superseded', valid_until = $3
             WHERE account_id = $1
               AND id = $2
               AND status = 'active'`,
            [auth.accountId, assertion.supersedes_state_id, decidedAt],
          );
        }
        confirmedStateId = randomUUID();
        await client.query(
          `INSERT INTO confirmed_states(
             id, account_id, subject_id, assignment_id, field, value_text,
             status, source_assertion_id, confirmed_by_decision_id,
             supersedes_state_id, valid_from
           )
           VALUES (
             $1, $2, $3, $4, $5, $6, 'active', $7, $8, $9, $10
           )`,
          [
            confirmedStateId,
            auth.accountId,
            assertion.subject_id,
            assertion.assignment_id,
            assertion.field,
            chosenValue,
            assertionId,
            decisionId,
            assertion.temporal_relation === "supersedes"
              ? assertion.supersedes_state_id
              : null,
            decidedAt,
          ],
        );
      }
    }

    const reviewStatus =
      request.decision === "confirm"
        ? "confirmed"
        : request.decision === "dismiss"
          ? "dismissed"
          : "unresolved";
    await client.query(
      `UPDATE proposed_assertions
       SET review_status = $3,
           version = version + 1
       WHERE account_id = $1 AND id = $2`,
      [auth.accountId, assertionId, reviewStatus],
    );
    let invalidatedSnapshotIds: string[] = [];
    if (assertion.evidence_fragment_id) {
      invalidatedSnapshotIds = await invalidateKnowledgeForFragment(
        client,
        auth.accountId,
        assertion.evidence_fragment_id,
      );
      const resourceState = await client.query<{
        resource_id: string;
        pending_claim_count: number;
        proposed_fragment_count: number;
        reviewed_fragment_count: number;
      }>(
        `SELECT
           fragments.resource_id,
           (
             SELECT COUNT(*)::integer
             FROM proposed_assertions claims
             JOIN evidence_fragments claim_fragments
               ON claim_fragments.account_id = claims.account_id
              AND claim_fragments.id = claims.evidence_fragment_id
             WHERE claims.account_id = $1
               AND claim_fragments.resource_id = fragments.resource_id
               AND claims.review_status IN ('pending', 'unresolved')
           ) AS pending_claim_count,
           (
             SELECT COUNT(*)::integer
             FROM evidence_fragments source_fragments
             WHERE source_fragments.account_id = $1
               AND source_fragments.resource_id = fragments.resource_id
               AND source_fragments.status = 'active'
               AND source_fragments.review_status = 'proposed'
           ) AS proposed_fragment_count,
           (
             SELECT COUNT(*)::integer
             FROM evidence_fragments source_fragments
             WHERE source_fragments.account_id = $1
               AND source_fragments.resource_id = fragments.resource_id
               AND source_fragments.status = 'active'
               AND source_fragments.review_status = 'reviewed'
           ) AS reviewed_fragment_count
         FROM evidence_fragments fragments
         WHERE fragments.account_id = $1
           AND fragments.id = $2`,
        [auth.accountId, assertion.evidence_fragment_id],
      );
      const resource = resourceState.rows[0];
      if (resource) {
        const processingState =
          resource.pending_claim_count > 0 ||
          resource.proposed_fragment_count > 0
            ? "needs_fact_review"
            : resource.reviewed_fragment_count > 0
              ? "ready"
              : "failed";
        await client.query(
          `UPDATE source_resources
           SET processing_state = $3,
               updated_at = $4
           WHERE account_id = $1 AND id = $2`,
          [
            auth.accountId,
            resource.resource_id,
            processingState,
            decidedAt,
          ],
        );
      }
    }
    await appendAudit(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      `assertion.${request.decision}`,
      "assertion_proposal",
      assertionId,
      {
        corrected: request.corrected_value !== undefined,
        field: assertion.field,
        temporal_relation: assertion.temporal_relation,
        evidence_fragment_id: assertion.evidence_fragment_id,
        invalidated_snapshot_ids: invalidatedSnapshotIds,
      },
    );
    if (confirmedStateId) {
      await appendAudit(
        client,
        { accountId: auth.accountId, actorUserId: auth.userId },
        "state.confirmed",
        "confirmed_state",
        confirmedStateId,
        {
          assertion_id: assertionId,
          field: assertion.field,
          relationship: assertion.temporal_relation,
        },
      );
    }

    const body: AssertionDecisionResponse = {
      decision_id: decisionId,
      assertion_id: assertionId,
      decision: request.decision,
      decided_by_user_id: auth.userId,
      confirmed_state_id: confirmedStateId,
      decided_at: decidedAt.toISOString(),
    };
    await completeIdempotency(client, idempotency, 201, body);
    return { body, replayed: false, status: 201 };
  });
}
