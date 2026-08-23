import { randomUUID } from "node:crypto";

import {
  SIMULATED_CAPABILITY,
  SIMULATED_REVERSAL_CAPABILITY,
  type ApproveEffectReversalRequest,
  type ApproveActionRequest,
  type ApprovalResponse,
  type EffectReversalApprovalResponse,
  type EffectReversalPreview,
  type EffectReversalResultResponse,
  type EffectReversalSnapshot,
  type EffectResultResponse,
  type ExecuteEffectReversalRequest,
  type ExecuteActionRequest,
  type ReconcileEffectRequest,
  type ReviseActionRequest,
  type RevokeApprovalRequest,
  type RevokeCapabilityRequest,
  type SimulatedEffectPreview,
} from "@talent-signal/contracts";
import type { Pool, PoolClient } from "pg";

import { inTransaction, type DatabaseClient } from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import { appendAudit } from "../lib/audit.js";
import { digestValue, stableStringify } from "../lib/hash.js";
import {
  claimIdempotency,
  completeIdempotency,
} from "../lib/idempotency.js";
import type { AuthContext } from "./auth.js";
import type { MutationResult } from "./captures.js";

interface ActionContext {
  id: string;
  capture_id: string;
  exact_preview: SimulatedEffectPreview;
  exact_preview_digest: string;
  required_assertion_ids: string[];
  simulated: true;
  status: string;
  version: number;
}

interface ApprovalContext {
  id: string;
  action_id: string;
  approved_by_user_id: string;
  action_version: number;
  exact_preview_digest: string;
  status: "active" | "revoked" | "stale" | "consumed";
  granted_at: Date;
  expires_at: Date;
}

interface EffectResultRows {
  attempt_id: string;
  action_id: string;
  attempt_status: "verified" | "failed" | "unknown";
  action_status: string;
  observation_id: string | null;
  destination_key: string | null;
  destination_version: number | null;
  match_status: "matched" | "mismatched" | "unavailable" | null;
  observed_at: Date | null;
  outcome_id: string | null;
  outcome_status: "verified" | "failed" | "unknown" | null;
  summary: string | null;
  outcome_created_at: Date | null;
}

interface EffectReversalApprovalRow {
  id: string;
  original_attempt_id: string;
  exact_preview: EffectReversalPreview;
  exact_preview_digest: string;
  status: EffectReversalApprovalResponse["status"];
  reason: string;
  approved_by_user_id: string;
  granted_at: Date;
  expires_at: Date;
}

interface EffectReversalResultRow {
  reversal_attempt_id: string;
  original_attempt_id: string;
  attempt_status: EffectReversalResultResponse["attempt_status"];
  observation_id: string | null;
  destination_key: string | null;
  destination_version: number | null;
  match_status:
    | "matched_absent"
    | "still_present"
    | "unavailable"
    | null;
  observed_at: Date | null;
  outcome_id: string | null;
  outcome_status: "verified" | "failed" | "unknown" | null;
  summary: string | null;
  outcome_created_at: Date | null;
}

async function lockAction(
  client: PoolClient,
  accountId: string,
  actionId: string,
): Promise<ActionContext> {
  const result = await client.query<ActionContext>(
    `SELECT
       id, capture_id, exact_preview, exact_preview_digest,
       required_assertion_ids, simulated, status, version
     FROM action_proposals
     WHERE account_id = $1 AND id = $2
     FOR UPDATE`,
    [accountId, actionId],
  );
  const action = result.rows[0];
  if (!action) {
    throw new ApiError(404, "ACTION_NOT_FOUND", "The action was not found.");
  }
  if (action.status === "deleted") {
    throw new ApiError(
      410,
      "ACTION_DELETED",
      "The action was deleted with its source evidence.",
    );
  }
  return action;
}

async function assertRequiredFactsConfirmed(
  client: PoolClient,
  accountId: string,
  assertionIds: string[],
): Promise<void> {
  if (assertionIds.length === 0) {
    throw new ApiError(
      422,
      "CONFIRMED_STATE_REQUIRED",
      "A consequential simulated effect requires at least one confirmed assertion.",
    );
  }
  const result = await client.query<{ confirmed_count: string }>(
    `SELECT count(*)::text AS confirmed_count
     FROM proposed_assertions
     WHERE account_id = $1
       AND id = ANY($2::uuid[])
       AND review_status = 'confirmed'`,
    [accountId, assertionIds],
  );
  if (Number(result.rows[0]?.confirmed_count ?? 0) !== assertionIds.length) {
    throw new ApiError(
      409,
      "FACT_REVIEW_INCOMPLETE",
      "Every assertion required by this action must be independently confirmed.",
    );
  }
}

export async function reviseAction(
  pool: Pool,
  auth: AuthContext,
  actionId: string,
  request: ReviseActionRequest,
): Promise<MutationResult<{
  id: string;
  version: number;
  exact_preview_digest: string;
}>> {
  return inTransaction(pool, async (client) => {
    const idempotency = await claimIdempotency(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      `revise_action:${actionId}`,
      request.idempotency_key,
      request,
    );
    if (idempotency.replay) {
      return {
        body: idempotency.replay.body as {
          id: string;
          version: number;
          exact_preview_digest: string;
        },
        replayed: true,
        status: idempotency.replay.status,
      };
    }
    const action = await lockAction(client, auth.accountId, actionId);
    if (action.version !== request.expected_action_version) {
      throw new ApiError(
        409,
        "ACTION_VERSION_CONFLICT",
        "The action changed; review the current exact preview.",
        { current_version: action.version },
      );
    }
    if (["completed", "executing", "unknown"].includes(action.status)) {
      throw new ApiError(
        409,
        "ACTION_NOT_REVISABLE",
        "Completed, executing, or unresolved actions cannot be revised.",
      );
    }

    const nextVersion = action.version + 1;
    const exactPreviewDigest = digestValue(request.exact_preview);
    await client.query(
      `UPDATE action_proposals
       SET exact_preview = $3,
           exact_preview_digest = $4,
           version = $5,
           status = 'proposed',
           updated_at = now()
       WHERE account_id = $1 AND id = $2`,
      [
        auth.accountId,
        actionId,
        request.exact_preview,
        exactPreviewDigest,
        nextVersion,
      ],
    );
    await client.query(
      `UPDATE action_approvals
       SET status = 'stale',
           revoked_at = now(),
           revocation_reason = 'action_revised'
       WHERE account_id = $1 AND action_id = $2 AND status = 'active'`,
      [auth.accountId, actionId],
    );
    await appendAudit(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "action.revised",
      "action_proposal",
      actionId,
      {
        prior_version: action.version,
        reason: request.reason,
        version: nextVersion,
      },
    );
    const body = {
      id: actionId,
      version: nextVersion,
      exact_preview_digest: exactPreviewDigest,
    };
    await completeIdempotency(client, idempotency, 200, body);
    return { body, replayed: false, status: 200 };
  });
}

export async function approveAction(
  pool: Pool,
  auth: AuthContext,
  actionId: string,
  request: ApproveActionRequest,
): Promise<MutationResult<ApprovalResponse>> {
  return inTransaction(pool, async (client) => {
    const idempotency = await claimIdempotency(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      `approve_action:${actionId}`,
      request.idempotency_key,
      request,
    );
    if (idempotency.replay) {
      return {
        body: idempotency.replay.body as ApprovalResponse,
        replayed: true,
        status: idempotency.replay.status,
      };
    }
    const action = await lockAction(client, auth.accountId, actionId);
    if (action.version !== request.expected_action_version) {
      throw new ApiError(
        409,
        "ACTION_VERSION_CONFLICT",
        "The action changed; approve the current exact preview.",
        { current_version: action.version },
      );
    }
    if (!["proposed", "failed", "approved"].includes(action.status)) {
      throw new ApiError(
        409,
        "ACTION_NOT_APPROVABLE",
        "The current action state cannot receive a new approval.",
      );
    }
    const requestDigest = digestValue(request.exact_preview);
    if (
      requestDigest !== action.exact_preview_digest ||
      stableStringify(request.exact_preview) !==
        stableStringify(action.exact_preview)
    ) {
      throw new ApiError(
        409,
        "APPROVAL_PREVIEW_MISMATCH",
        "Approval must match the current exact target and effect preview.",
      );
    }
    await assertRequiredFactsConfirmed(
      client,
      auth.accountId,
      action.required_assertion_ids,
    );

    const approvalId = randomUUID();
    const grantedAt = new Date();
    const requestedExpiry = request.expires_at
      ? new Date(request.expires_at)
      : new Date(grantedAt.getTime() + 15 * 60 * 1000);
    if (
      Number.isNaN(requestedExpiry.getTime()) ||
      requestedExpiry <= grantedAt ||
      requestedExpiry.getTime() > grantedAt.getTime() + 60 * 60 * 1000
    ) {
      throw new ApiError(
        422,
        "APPROVAL_EXPIRY_INVALID",
        "An approval must expire within the next hour.",
      );
    }
    await client.query(
      `UPDATE action_approvals
       SET status = 'stale',
           revoked_at = now(),
           revocation_reason = 'replaced_by_new_approval'
       WHERE account_id = $1 AND action_id = $2 AND status = 'active'`,
      [auth.accountId, actionId],
    );
    await client.query(
      `INSERT INTO action_approvals(
         id, account_id, action_id, approved_by_user_id, action_version,
         exact_preview_digest, status, granted_at, expires_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8)`,
      [
        approvalId,
        auth.accountId,
        actionId,
        auth.userId,
        action.version,
        action.exact_preview_digest,
        grantedAt,
        requestedExpiry,
      ],
    );
    await client.query(
      `UPDATE action_proposals
       SET status = 'approved', updated_at = now()
       WHERE account_id = $1 AND id = $2`,
      [auth.accountId, actionId],
    );
    await appendAudit(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "action.approved",
      "action_approval",
      approvalId,
      {
        action_id: actionId,
        action_version: action.version,
        exact_preview_digest: action.exact_preview_digest,
        simulated: true,
      },
    );
    const body: ApprovalResponse = {
      id: approvalId,
      action_id: actionId,
      action_version: action.version,
      exact_preview_digest: action.exact_preview_digest,
      status: "active",
      approved_by_user_id: auth.userId,
      granted_at: grantedAt.toISOString(),
      expires_at: requestedExpiry.toISOString(),
    };
    await completeIdempotency(client, idempotency, 201, body);
    return { body, replayed: false, status: 201 };
  });
}

export async function revokeApproval(
  pool: Pool,
  auth: AuthContext,
  approvalId: string,
  request: RevokeApprovalRequest,
): Promise<MutationResult<{ id: string; status: "revoked" }>> {
  return inTransaction(pool, async (client) => {
    const idempotency = await claimIdempotency(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      `revoke_approval:${approvalId}`,
      request.idempotency_key,
      request,
    );
    if (idempotency.replay) {
      return {
        body: idempotency.replay.body as { id: string; status: "revoked" },
        replayed: true,
        status: idempotency.replay.status,
      };
    }
    const result = await client.query<{ action_id: string; status: string }>(
      `SELECT action_id, status
       FROM action_approvals
       WHERE account_id = $1 AND id = $2
       FOR UPDATE`,
      [auth.accountId, approvalId],
    );
    const approval = result.rows[0];
    if (!approval) {
      throw new ApiError(
        404,
        "APPROVAL_NOT_FOUND",
        "The approval was not found.",
      );
    }
    if (approval.status !== "active") {
      throw new ApiError(
        409,
        "APPROVAL_NOT_ACTIVE",
        "Only an active approval can be revoked.",
      );
    }
    await client.query(
      `UPDATE action_approvals
       SET status = 'revoked',
           revoked_at = now(),
           revocation_reason = $3
       WHERE account_id = $1 AND id = $2`,
      [auth.accountId, approvalId, request.reason],
    );
    await client.query(
      `UPDATE action_proposals
       SET status = 'revoked', updated_at = now()
       WHERE account_id = $1 AND id = $2 AND status = 'approved'`,
      [auth.accountId, approval.action_id],
    );
    await appendAudit(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "approval.revoked",
      "action_approval",
      approvalId,
      { action_id: approval.action_id, reason: request.reason },
    );
    const body = { id: approvalId, status: "revoked" as const };
    await completeIdempotency(client, idempotency, 200, body);
    return { body, replayed: false, status: 200 };
  });
}

async function loadEffectResult(
  client: PoolClient,
  accountId: string,
  attemptId: string,
  reused: boolean,
): Promise<EffectResultResponse> {
  const result = await client.query<EffectResultRows>(
    `SELECT
       attempts.id AS attempt_id,
       attempts.action_id,
       attempts.status AS attempt_status,
       actions.status AS action_status,
       observations.id AS observation_id,
       observations.destination_key,
       observations.destination_version,
       observations.match_status,
       observations.observed_at,
       outcomes.id AS outcome_id,
       outcomes.status AS outcome_status,
       outcomes.summary,
       outcomes.created_at AS outcome_created_at
     FROM effect_attempts attempts
     JOIN action_proposals actions
       ON actions.account_id = attempts.account_id
      AND actions.id = attempts.action_id
     LEFT JOIN LATERAL (
       SELECT *
       FROM effect_observations
       WHERE account_id = attempts.account_id AND attempt_id = attempts.id
       ORDER BY observed_at DESC
       LIMIT 1
     ) observations ON true
     LEFT JOIN LATERAL (
       SELECT *
       FROM outcomes
       WHERE account_id = attempts.account_id AND attempt_id = attempts.id
       ORDER BY created_at DESC
       LIMIT 1
     ) outcomes ON true
     WHERE attempts.account_id = $1 AND attempts.id = $2`,
    [accountId, attemptId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ApiError(
      404,
      "EFFECT_ATTEMPT_NOT_FOUND",
      "The effect attempt was not found.",
    );
  }
  const reversal =
    row.attempt_status === "verified"
      ? await loadEffectReversalSnapshot(client, accountId, attemptId)
      : null;
  return {
    attempt_id: row.attempt_id,
    action_id: row.action_id,
    attempt_status: row.attempt_status,
    action_status: row.action_status,
    simulated: true,
    reused,
    observation:
      row.observation_id &&
      row.destination_key &&
      row.match_status &&
      row.observed_at
        ? {
            id: row.observation_id,
            destination_key: row.destination_key,
            destination_version: row.destination_version ?? 0,
            match_status: row.match_status,
            observed_at: row.observed_at.toISOString(),
          }
        : null,
    outcome:
      row.outcome_id &&
      row.outcome_status &&
      row.summary &&
      row.outcome_created_at
        ? {
            id: row.outcome_id,
            status: row.outcome_status,
            summary: row.summary,
            created_at: row.outcome_created_at.toISOString(),
          }
        : null,
    reversal,
  };
}

async function insertOutcome(
  client: PoolClient,
  accountId: string,
  attemptId: string,
  observationId: string | null,
  status: "verified" | "failed" | "unknown",
  summary: string,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO outcomes(
       id, account_id, attempt_id, observation_id, status, summary
     )
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, accountId, attemptId, observationId, status, summary],
  );
  return id;
}

async function observeDestination(
  client: PoolClient,
  accountId: string,
  attemptId: string,
  preview: SimulatedEffectPreview,
): Promise<{
  observationId: string;
  matchStatus: "matched" | "mismatched" | "unavailable";
}> {
  const destination = await client.query<{
    destination_key: string;
    state: unknown;
    version: number;
  }>(
    `SELECT destination_key, state, version
     FROM simulated_destinations
     WHERE account_id = $1 AND destination_key = $2`,
    [accountId, preview.target.destination_key],
  );
  const row = destination.rows[0];
  const matchStatus = !row
    ? "unavailable"
    : stableStringify(row.state) === stableStringify(preview.change)
      ? "matched"
      : "mismatched";
  const observationId = randomUUID();
  await client.query(
    `INSERT INTO effect_observations(
       id, account_id, attempt_id, destination_key, destination_version,
       observed_state, match_status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      observationId,
      accountId,
      attemptId,
      preview.target.destination_key,
      row?.version ?? null,
      row?.state ?? null,
      matchStatus,
    ],
  );
  return { observationId, matchStatus };
}

async function writeDestination(
  client: PoolClient,
  accountId: string,
  preview: SimulatedEffectPreview,
): Promise<"written" | "version_conflict"> {
  const current = await client.query<{ id: string; version: number }>(
    `SELECT id, version
     FROM simulated_destinations
     WHERE account_id = $1 AND destination_key = $2
     FOR UPDATE`,
    [accountId, preview.target.destination_key],
  );
  const row = current.rows[0];
  const currentVersion = row?.version ?? 0;
  if (currentVersion !== preview.expected_destination_version) {
    return "version_conflict";
  }
  if (row) {
    await client.query(
      `UPDATE simulated_destinations
       SET state = $3, version = version + 1, updated_at = now()
       WHERE account_id = $1 AND id = $2`,
      [accountId, row.id, preview.change],
    );
  } else {
    await client.query(
      `INSERT INTO simulated_destinations(
         id, account_id, destination_key, state, version
       )
       VALUES ($1, $2, $3, $4, 1)`,
      [
        randomUUID(),
        accountId,
        preview.target.destination_key,
        preview.change,
      ],
    );
  }
  return "written";
}

export async function executeAction(
  pool: Pool,
  auth: AuthContext,
  actionId: string,
  request: ExecuteActionRequest,
): Promise<MutationResult<EffectResultResponse>> {
  return inTransaction(pool, async (client) => {
    const idempotency = await claimIdempotency(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      `execute_action:${actionId}`,
      request.idempotency_key,
      request,
    );
    if (idempotency.replay) {
      return {
        body: {
          ...(idempotency.replay.body as EffectResultResponse),
          reused: true,
        },
        replayed: true,
        status: idempotency.replay.status,
      };
    }

    const action = await lockAction(client, auth.accountId, actionId);
    if (action.version !== request.expected_action_version) {
      throw new ApiError(
        409,
        "ACTION_VERSION_CONFLICT",
        "The action changed after approval.",
        { current_version: action.version },
      );
    }
    if (action.status === "unknown") {
      throw new ApiError(
        409,
        "RECONCILIATION_REQUIRED",
        "The prior attempt has an unknown result and must be reconciled before retry.",
      );
    }
    if (action.status === "completed") {
      const existing = await client.query<{ id: string }>(
        `SELECT id
         FROM effect_attempts
         WHERE account_id = $1 AND action_id = $2 AND status = 'verified'
         ORDER BY attempt_number DESC
         LIMIT 1`,
        [auth.accountId, actionId],
      );
      const attemptId = existing.rows[0]?.id;
      if (!attemptId) {
        throw new ApiError(
          409,
          "COMPLETED_EFFECT_MISSING",
          "The completed action has no verified effect record.",
        );
      }
      const body = await loadEffectResult(
        client,
        auth.accountId,
        attemptId,
        true,
      );
      await completeIdempotency(client, idempotency, 200, body);
      return { body, replayed: true, status: 200 };
    }

    const approvalResult = await client.query<ApprovalContext>(
      `SELECT
         id, action_id, approved_by_user_id, action_version,
         exact_preview_digest, status, granted_at, expires_at
       FROM action_approvals
       WHERE account_id = $1 AND id = $2 AND action_id = $3
       FOR UPDATE`,
      [auth.accountId, request.approval_id, actionId],
    );
    const approval = approvalResult.rows[0];
    if (!approval) {
      throw new ApiError(
        404,
        "APPROVAL_NOT_FOUND",
        "The exact action approval was not found.",
      );
    }
    if (
      approval.status !== "active" ||
      approval.expires_at <= new Date() ||
      approval.approved_by_user_id !== auth.userId
    ) {
      throw new ApiError(
        409,
        "APPROVAL_NOT_CURRENT",
        "The approval is stale, expired, revoked, consumed, or belongs to another user.",
      );
    }
    if (
      approval.action_version !== action.version ||
      approval.exact_preview_digest !== action.exact_preview_digest
    ) {
      throw new ApiError(
        409,
        "APPROVAL_STALE",
        "The approval no longer matches the current action.",
      );
    }
    await assertRequiredFactsConfirmed(
      client,
      auth.accountId,
      action.required_assertion_ids,
    );

    const grantResult = await client.query<{ id: string }>(
      `SELECT id
       FROM capability_grants
       WHERE account_id = $1
         AND user_id = $2
         AND capability = $3
         AND status = 'active'
         AND expires_at > now()
       FOR UPDATE`,
      [auth.accountId, auth.userId, SIMULATED_CAPABILITY],
    );
    const grant = grantResult.rows[0];
    if (!grant) {
      throw new ApiError(
        403,
        "CAPABILITY_NOT_AUTHORIZED",
        "The local simulated capability is not currently authorized.",
      );
    }

    const attemptNumberResult = await client.query<{ next_attempt: number }>(
      `SELECT (count(*) + 1)::integer AS next_attempt
       FROM effect_attempts
       WHERE account_id = $1 AND action_id = $2`,
      [auth.accountId, actionId],
    );
    const attemptNumber = attemptNumberResult.rows[0]?.next_attempt ?? 1;
    const attemptId = randomUUID();
    await client.query(
      `INSERT INTO effect_attempts(
         id, account_id, action_id, approval_id, capability_grant_id,
         action_version, exact_preview_digest, adapter, attempt_number, status
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, 'local_deterministic', $8, 'running'
       )`,
      [
        attemptId,
        auth.accountId,
        actionId,
        approval.id,
        grant.id,
        action.version,
        action.exact_preview_digest,
        attemptNumber,
      ],
    );
    await client.query(
      `UPDATE action_proposals
       SET status = 'executing', updated_at = now()
       WHERE account_id = $1 AND id = $2`,
      [auth.accountId, actionId],
    );
    await appendAudit(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "effect.started",
      "effect_attempt",
      attemptId,
      {
        action_id: actionId,
        action_version: action.version,
        adapter: "local_deterministic",
        simulated: true,
      },
    );

    const behavior = action.exact_preview.simulation_behavior;
    if (behavior === "failure") {
      await client.query(
        `UPDATE effect_attempts
         SET status = 'failed',
             failure_code = 'SIMULATED_ADAPTER_FAILURE',
             finished_at = now()
         WHERE account_id = $1 AND id = $2`,
        [auth.accountId, attemptId],
      );
      await client.query(
        `UPDATE action_proposals
         SET status = 'failed', updated_at = now()
         WHERE account_id = $1 AND id = $2`,
        [auth.accountId, actionId],
      );
      await insertOutcome(
        client,
        auth.accountId,
        attemptId,
        null,
        "failed",
        "The labeled local simulation failed before any destination write.",
      );
    } else if (behavior === "timeout_before_write") {
      await client.query(
        `UPDATE effect_attempts
         SET status = 'unknown',
             failure_code = 'SIMULATED_TIMEOUT_BEFORE_WRITE',
             finished_at = now()
         WHERE account_id = $1 AND id = $2`,
        [auth.accountId, attemptId],
      );
      await client.query(
        `UPDATE action_proposals
         SET status = 'unknown', updated_at = now()
         WHERE account_id = $1 AND id = $2`,
        [auth.accountId, actionId],
      );
      await insertOutcome(
        client,
        auth.accountId,
        attemptId,
        null,
        "unknown",
        "The labeled local simulation timed out without destination proof.",
      );
    } else {
      const writeResult = await writeDestination(
        client,
        auth.accountId,
        action.exact_preview,
      );
      if (writeResult === "version_conflict") {
        const observation = await observeDestination(
          client,
          auth.accountId,
          attemptId,
          action.exact_preview,
        );
        await client.query(
          `UPDATE effect_attempts
           SET status = 'failed',
               failure_code = 'DESTINATION_VERSION_CONFLICT',
               finished_at = now()
           WHERE account_id = $1 AND id = $2`,
          [auth.accountId, attemptId],
        );
        await client.query(
          `UPDATE action_proposals
           SET status = 'failed', updated_at = now()
           WHERE account_id = $1 AND id = $2`,
          [auth.accountId, actionId],
        );
        await insertOutcome(
          client,
          auth.accountId,
          attemptId,
          observation.observationId,
          "failed",
          "The simulated destination changed after preview; no write was applied.",
        );
      } else if (behavior === "timeout_after_write") {
        await client.query(
          `UPDATE effect_attempts
           SET status = 'unknown',
               failure_code = 'SIMULATED_TIMEOUT_AFTER_WRITE',
               finished_at = now()
           WHERE account_id = $1 AND id = $2`,
          [auth.accountId, attemptId],
        );
        await client.query(
          `UPDATE action_proposals
           SET status = 'unknown', updated_at = now()
           WHERE account_id = $1 AND id = $2`,
          [auth.accountId, actionId],
        );
        await insertOutcome(
          client,
          auth.accountId,
          attemptId,
          null,
          "unknown",
          "The labeled local simulation timed out after a possible write; reconciliation is required.",
        );
      } else {
        const observation = await observeDestination(
          client,
          auth.accountId,
          attemptId,
          action.exact_preview,
        );
        const verified = observation.matchStatus === "matched";
        await client.query(
          `UPDATE effect_attempts
           SET status = $3,
               failure_code = $4,
               finished_at = now()
           WHERE account_id = $1 AND id = $2`,
          [
            auth.accountId,
            attemptId,
            verified ? "verified" : "failed",
            verified ? null : "DESTINATION_READBACK_MISMATCH",
          ],
        );
        await client.query(
          `UPDATE action_proposals
           SET status = $3, updated_at = now()
           WHERE account_id = $1 AND id = $2`,
          [
            auth.accountId,
            actionId,
            verified ? "completed" : "failed",
          ],
        );
        await insertOutcome(
          client,
          auth.accountId,
          attemptId,
          observation.observationId,
          verified ? "verified" : "failed",
          verified
            ? "Verified against the labeled local simulated destination."
            : "The local simulated destination did not match the approved effect.",
        );
        if (verified) {
          await client.query(
            `UPDATE action_approvals
             SET status = 'consumed'
             WHERE account_id = $1 AND id = $2`,
            [auth.accountId, approval.id],
          );
        }
      }
    }

    const body = await loadEffectResult(
      client,
      auth.accountId,
      attemptId,
      false,
    );
    await appendAudit(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      `effect.${body.attempt_status}`,
      "effect_attempt",
      attemptId,
      {
        action_id: actionId,
        destination_observed: body.observation !== null,
        simulated: true,
      },
    );
    await completeIdempotency(client, idempotency, 200, body);
    return { body, replayed: false, status: 200 };
  });
}

export async function reconcileEffect(
  pool: Pool,
  auth: AuthContext,
  attemptId: string,
  request: ReconcileEffectRequest,
): Promise<MutationResult<EffectResultResponse>> {
  return inTransaction(pool, async (client) => {
    const idempotency = await claimIdempotency(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      `reconcile_effect:${attemptId}`,
      request.idempotency_key,
      request,
    );
    if (idempotency.replay) {
      return {
        body: {
          ...(idempotency.replay.body as EffectResultResponse),
          reused: true,
        },
        replayed: true,
        status: idempotency.replay.status,
      };
    }

    const attemptResult = await client.query<{
      status: "verified" | "failed" | "unknown";
      action_id: string;
      approval_id: string;
      exact_preview: SimulatedEffectPreview;
    }>(
      `SELECT
         attempts.status,
         attempts.action_id,
         attempts.approval_id,
         actions.exact_preview
       FROM effect_attempts attempts
       JOIN action_proposals actions
         ON actions.account_id = attempts.account_id
        AND actions.id = attempts.action_id
       WHERE attempts.account_id = $1 AND attempts.id = $2
       FOR UPDATE OF attempts, actions`,
      [auth.accountId, attemptId],
    );
    const attempt = attemptResult.rows[0];
    if (!attempt) {
      throw new ApiError(
        404,
        "EFFECT_ATTEMPT_NOT_FOUND",
        "The effect attempt was not found.",
      );
    }
    if (attempt.status !== "unknown") {
      const existing = await loadEffectResult(
        client,
        auth.accountId,
        attemptId,
        true,
      );
      await completeIdempotency(client, idempotency, 200, existing);
      return { body: existing, replayed: true, status: 200 };
    }

    const observation = await observeDestination(
      client,
      auth.accountId,
      attemptId,
      attempt.exact_preview,
    );
    const nextStatus =
      observation.matchStatus === "matched"
        ? "verified"
        : observation.matchStatus === "mismatched"
          ? "failed"
          : "unknown";
    await client.query(
      `UPDATE effect_attempts
       SET status = $3,
           failure_code = $4,
           finished_at = now()
       WHERE account_id = $1 AND id = $2`,
      [
        auth.accountId,
        attemptId,
        nextStatus,
        nextStatus === "unknown"
          ? "DESTINATION_UNAVAILABLE"
          : nextStatus === "failed"
            ? "DESTINATION_READBACK_MISMATCH"
            : null,
      ],
    );
    await client.query(
      `UPDATE action_proposals
       SET status = $3, updated_at = now()
       WHERE account_id = $1 AND id = $2`,
      [
        auth.accountId,
        attempt.action_id,
        nextStatus === "verified"
          ? "completed"
          : nextStatus === "failed"
            ? "failed"
            : "unknown",
      ],
    );
    await insertOutcome(
      client,
      auth.accountId,
      attemptId,
      observation.observationId,
      nextStatus,
      nextStatus === "verified"
        ? "Reconciliation verified the labeled local simulated destination."
        : nextStatus === "failed"
          ? "Reconciliation observed a destination state that did not match the approved effect."
          : "Reconciliation could not observe the labeled local simulated destination.",
    );
    if (nextStatus === "verified") {
      await client.query(
        `UPDATE action_approvals
         SET status = 'consumed'
         WHERE account_id = $1 AND id = $2 AND status = 'active'`,
        [auth.accountId, attempt.approval_id],
      );
    }
    await appendAudit(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      `effect.reconciled_${nextStatus}`,
      "effect_attempt",
      attemptId,
      {
        action_id: attempt.action_id,
        destination_observed: observation.matchStatus !== "unavailable",
        simulated: true,
      },
    );
    const body = await loadEffectResult(
      client,
      auth.accountId,
      attemptId,
      false,
    );
    await completeIdempotency(client, idempotency, 200, body);
    return { body, replayed: false, status: 200 };
  });
}

async function buildEffectReversalPreview(
  client: DatabaseClient,
  accountId: string,
  originalAttemptId: string,
): Promise<EffectReversalPreview> {
  const originalResult = await client.query<{
    attempt_status: "verified" | "failed" | "unknown";
    exact_preview: SimulatedEffectPreview;
    destination_version: number | null;
    match_status: "matched" | "mismatched" | "unavailable" | null;
  }>(
    `SELECT
       attempts.status AS attempt_status,
       actions.exact_preview,
       observations.destination_version,
       observations.match_status
     FROM effect_attempts attempts
     JOIN action_proposals actions
       ON actions.account_id = attempts.account_id
      AND actions.id = attempts.action_id
     LEFT JOIN LATERAL (
       SELECT destination_version, match_status
       FROM effect_observations
       WHERE account_id = attempts.account_id
         AND attempt_id = attempts.id
       ORDER BY observed_at DESC, id DESC
       LIMIT 1
     ) observations ON true
     WHERE attempts.account_id = $1 AND attempts.id = $2`,
    [accountId, originalAttemptId],
  );
  const original = originalResult.rows[0];
  if (!original) {
    throw new ApiError(
      404,
      "EFFECT_ATTEMPT_NOT_FOUND",
      "The effect attempt was not found.",
    );
  }

  const destinationResult = await client.query<{
    state: unknown;
    version: number;
  }>(
    `SELECT state, version
     FROM simulated_destinations
     WHERE account_id = $1 AND destination_key = $2`,
    [accountId, original.exact_preview.target.destination_key],
  );
  const destination = destinationResult.rows[0];
  const verifiedReversal = await client.query<{ id: string }>(
    `SELECT id
     FROM effect_reversal_attempts
     WHERE account_id = $1
       AND original_attempt_id = $2
       AND status = 'verified'
     ORDER BY attempt_number DESC
     LIMIT 1`,
    [accountId, originalAttemptId],
  );

  const blockers: EffectReversalPreview["blockers"] = [];
  if (
    original.attempt_status !== "verified" ||
    original.match_status !== "matched"
  ) {
    blockers.push({
      code: "effect_not_verified",
      message:
        "Only an effect with matching destination readback can be reversed.",
    });
  }
  if (original.exact_preview.expected_destination_version !== 0) {
    blockers.push({
      code: "prior_state_not_reversible",
      message:
        "This effect replaced prior destination state that the current adapter cannot restore safely.",
    });
  }
  if (verifiedReversal.rows[0]) {
    blockers.push({
      code: "reversal_already_verified",
      message: "This effect was already reversed and verified.",
    });
  } else if (
    !destination ||
    destination.version !== original.destination_version ||
    stableStringify(destination.state) !==
      stableStringify(original.exact_preview.change)
  ) {
    blockers.push({
      code: "destination_changed",
      message:
        "The destination changed after the verified effect. Review the current destination instead of deleting it automatically.",
    });
  }

  const exact = {
    original_attempt_id: originalAttemptId,
    simulated: true as const,
    capability: SIMULATED_REVERSAL_CAPABILITY,
    adapter: "local_deterministic" as const,
    target: original.exact_preview.target,
    current_effect: original.exact_preview.change,
    reversal: {
      kind: "remove_attention" as const,
      title: original.exact_preview.change.title,
    },
    expected_destination_version:
      destination?.version ?? original.destination_version ?? 1,
  };
  return {
    ...exact,
    preview_digest: digestValue(exact),
    blockers,
    reversal_available: blockers.length === 0,
  };
}

export async function previewEffectReversal(
  pool: Pool,
  auth: AuthContext,
  originalAttemptId: string,
): Promise<EffectReversalPreview> {
  return buildEffectReversalPreview(
    pool,
    auth.accountId,
    originalAttemptId,
  );
}

function mapEffectReversalApproval(
  row: EffectReversalApprovalRow,
): EffectReversalApprovalResponse {
  return {
    id: row.id,
    original_attempt_id: row.original_attempt_id,
    exact_preview: row.exact_preview,
    exact_preview_digest: row.exact_preview_digest,
    status: row.status,
    reason: row.reason,
    approved_by_user_id: row.approved_by_user_id,
    granted_at: row.granted_at.toISOString(),
    expires_at: row.expires_at.toISOString(),
  };
}

async function loadEffectReversalResult(
  client: DatabaseClient,
  accountId: string,
  reversalAttemptId: string,
  reused: boolean,
): Promise<EffectReversalResultResponse> {
  const result = await client.query<EffectReversalResultRow>(
    `SELECT
       attempts.id AS reversal_attempt_id,
       attempts.original_attempt_id,
       attempts.status AS attempt_status,
       observations.id AS observation_id,
       observations.destination_key,
       observations.destination_version,
       observations.match_status,
       observations.observed_at,
       outcomes.id AS outcome_id,
       outcomes.status AS outcome_status,
       outcomes.summary,
       outcomes.created_at AS outcome_created_at
     FROM effect_reversal_attempts attempts
     LEFT JOIN LATERAL (
       SELECT *
       FROM effect_reversal_observations
       WHERE account_id = attempts.account_id
         AND reversal_attempt_id = attempts.id
       ORDER BY observed_at DESC, id DESC
       LIMIT 1
     ) observations ON true
     LEFT JOIN LATERAL (
       SELECT *
       FROM effect_reversal_outcomes
       WHERE account_id = attempts.account_id
         AND reversal_attempt_id = attempts.id
       ORDER BY created_at DESC, id DESC
       LIMIT 1
     ) outcomes ON true
     WHERE attempts.account_id = $1 AND attempts.id = $2`,
    [accountId, reversalAttemptId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ApiError(
      404,
      "EFFECT_REVERSAL_ATTEMPT_NOT_FOUND",
      "The effect reversal attempt was not found.",
    );
  }
  return {
    reversal_attempt_id: row.reversal_attempt_id,
    original_attempt_id: row.original_attempt_id,
    attempt_status: row.attempt_status,
    simulated: true,
    reused,
    observation:
      row.observation_id &&
      row.destination_key &&
      row.match_status &&
      row.observed_at
        ? {
            id: row.observation_id,
            destination_key: row.destination_key,
            destination_version: row.destination_version,
            match_status: row.match_status,
            observed_at: row.observed_at.toISOString(),
          }
        : null,
    outcome:
      row.outcome_id &&
      row.outcome_status &&
      row.summary &&
      row.outcome_created_at
        ? {
            id: row.outcome_id,
            status: row.outcome_status,
            summary: row.summary,
            created_at: row.outcome_created_at.toISOString(),
          }
        : null,
  };
}

export async function loadEffectReversalSnapshot(
  client: DatabaseClient,
  accountId: string,
  originalAttemptId: string,
): Promise<EffectReversalSnapshot> {
  const [approvalResult, attemptResult] = await Promise.all([
    client.query<EffectReversalApprovalRow>(
      `SELECT
         id, original_attempt_id, exact_preview, exact_preview_digest,
         status, reason, approved_by_user_id, granted_at, expires_at
       FROM effect_reversal_approvals
       WHERE account_id = $1 AND original_attempt_id = $2
       ORDER BY granted_at DESC, id DESC
       LIMIT 1`,
      [accountId, originalAttemptId],
    ),
    client.query<{ id: string; status: EffectReversalResultResponse["attempt_status"] }>(
      `SELECT id, status
       FROM effect_reversal_attempts
       WHERE account_id = $1 AND original_attempt_id = $2
       ORDER BY attempt_number DESC, started_at DESC
       LIMIT 1`,
      [accountId, originalAttemptId],
    ),
  ]);
  const approvalRow = approvalResult.rows[0];
  const attemptRow = attemptResult.rows[0];
  const latestApproval = approvalRow
    ? mapEffectReversalApproval(approvalRow)
    : null;
  const latestAttempt = attemptRow
    ? await loadEffectReversalResult(
        client,
        accountId,
        attemptRow.id,
        false,
      )
    : null;
  const status: EffectReversalSnapshot["status"] = latestAttempt
    ? latestAttempt.attempt_status
    : latestApproval?.status === "active" &&
        new Date(latestApproval.expires_at).getTime() > Date.now()
      ? "approved"
      : latestApproval
        ? "stale"
        : "available";
  return {
    status,
    latest_approval: latestApproval,
    latest_attempt: latestAttempt,
  };
}

export async function approveEffectReversal(
  pool: Pool,
  auth: AuthContext,
  originalAttemptId: string,
  request: ApproveEffectReversalRequest,
): Promise<MutationResult<EffectReversalApprovalResponse>> {
  return inTransaction(pool, async (client) => {
    const idempotency = await claimIdempotency(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      `approve_effect_reversal:${originalAttemptId}`,
      request.idempotency_key,
      request,
    );
    if (idempotency.replay) {
      return {
        body: idempotency.replay.body as EffectReversalApprovalResponse,
        replayed: true,
        status: idempotency.replay.status,
      };
    }
    await client.query(
      `UPDATE effect_reversal_approvals
       SET status = 'stale'
       WHERE account_id = $1
         AND original_attempt_id = $2
         AND status = 'active'
         AND expires_at <= now()`,
      [auth.accountId, originalAttemptId],
    );
    const currentApproval = await client.query<{ id: string }>(
      `SELECT id
       FROM effect_reversal_approvals
       WHERE account_id = $1
         AND original_attempt_id = $2
         AND status = 'active'
       FOR UPDATE`,
      [auth.accountId, originalAttemptId],
    );
    if (currentApproval.rows[0]) {
      throw new ApiError(
        409,
        "EFFECT_REVERSAL_APPROVAL_EXISTS",
        "A current reversal approval already exists.",
      );
    }
    const preview = await buildEffectReversalPreview(
      client,
      auth.accountId,
      originalAttemptId,
    );
    if (!preview.reversal_available) {
      throw new ApiError(
        409,
        "EFFECT_REVERSAL_BLOCKED",
        "The current destination cannot be reversed automatically.",
        { blockers: preview.blockers },
      );
    }
    if (
      preview.expected_destination_version !==
        request.expected_destination_version ||
      preview.preview_digest !== request.expected_preview_digest
    ) {
      throw new ApiError(
        409,
        "EFFECT_REVERSAL_PREVIEW_STALE",
        "The destination changed after the reversal preview.",
        { current_preview: preview },
      );
    }
    const id = randomUUID();
    const grantedAt = new Date();
    const expiresAt = new Date(grantedAt.getTime() + 15 * 60 * 1000);
    await client.query(
      `INSERT INTO effect_reversal_approvals(
         id, account_id, original_attempt_id, approved_by_user_id,
         exact_preview, exact_preview_digest, reason, status,
         granted_at, expires_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $9)`,
      [
        id,
        auth.accountId,
        originalAttemptId,
        auth.userId,
        preview,
        preview.preview_digest,
        request.reason,
        grantedAt,
        expiresAt,
      ],
    );
    const body: EffectReversalApprovalResponse = {
      id,
      original_attempt_id: originalAttemptId,
      exact_preview: preview,
      exact_preview_digest: preview.preview_digest,
      status: "active",
      reason: request.reason,
      approved_by_user_id: auth.userId,
      granted_at: grantedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    };
    await appendAudit(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "effect_reversal.approved",
      "effect_attempt",
      originalAttemptId,
      {
        approval_id: id,
        destination_key: preview.target.destination_key,
        destination_version: preview.expected_destination_version,
        reason: request.reason,
        simulated: true,
      },
    );
    await completeIdempotency(client, idempotency, 201, body);
    return { body, replayed: false, status: 201 };
  });
}

async function insertEffectReversalObservation(
  client: PoolClient,
  accountId: string,
  reversalAttemptId: string,
  destinationKey: string,
  destination: { state: unknown; version: number } | undefined,
  matchStatus: "matched_absent" | "still_present" | "unavailable",
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO effect_reversal_observations(
       id, account_id, reversal_attempt_id, destination_key,
       destination_version, observed_state, match_status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      accountId,
      reversalAttemptId,
      destinationKey,
      destination?.version ?? null,
      destination?.state ?? null,
      matchStatus,
    ],
  );
  return id;
}

async function insertEffectReversalOutcome(
  client: PoolClient,
  accountId: string,
  reversalAttemptId: string,
  observationId: string,
  status: "verified" | "failed" | "unknown",
  summary: string,
): Promise<void> {
  await client.query(
    `INSERT INTO effect_reversal_outcomes(
       id, account_id, reversal_attempt_id, observation_id, status, summary
     )
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      randomUUID(),
      accountId,
      reversalAttemptId,
      observationId,
      status,
      summary,
    ],
  );
}

export async function executeEffectReversal(
  pool: Pool,
  auth: AuthContext,
  originalAttemptId: string,
  request: ExecuteEffectReversalRequest,
): Promise<MutationResult<EffectReversalResultResponse>> {
  return inTransaction(pool, async (client) => {
    const idempotency = await claimIdempotency(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      `execute_effect_reversal:${originalAttemptId}`,
      request.idempotency_key,
      request,
    );
    if (idempotency.replay) {
      return {
        body: {
          ...(idempotency.replay.body as EffectReversalResultResponse),
          reused: true,
        },
        replayed: true,
        status: idempotency.replay.status,
      };
    }
    const originalResult = await client.query<{ status: string }>(
      `SELECT status
       FROM effect_attempts
       WHERE account_id = $1 AND id = $2
       FOR UPDATE`,
      [auth.accountId, originalAttemptId],
    );
    const original = originalResult.rows[0];
    if (!original) {
      throw new ApiError(
        404,
        "EFFECT_ATTEMPT_NOT_FOUND",
        "The effect attempt was not found.",
      );
    }
    const existing = await client.query<{ id: string }>(
      `SELECT id
       FROM effect_reversal_attempts
       WHERE account_id = $1
         AND original_attempt_id = $2
         AND status = 'verified'
       ORDER BY attempt_number DESC
       LIMIT 1`,
      [auth.accountId, originalAttemptId],
    );
    if (existing.rows[0]) {
      const body = await loadEffectReversalResult(
        client,
        auth.accountId,
        existing.rows[0].id,
        true,
      );
      await completeIdempotency(client, idempotency, 200, body);
      return { body, replayed: true, status: 200 };
    }
    if (original.status !== "verified") {
      throw new ApiError(
        409,
        "EFFECT_NOT_VERIFIED",
        "Only a verified effect can be reversed.",
      );
    }
    const approvalResult = await client.query<EffectReversalApprovalRow>(
      `SELECT
         id, original_attempt_id, exact_preview, exact_preview_digest,
         status, reason, approved_by_user_id, granted_at, expires_at
       FROM effect_reversal_approvals
       WHERE account_id = $1 AND id = $2 AND original_attempt_id = $3
       FOR UPDATE`,
      [auth.accountId, request.approval_id, originalAttemptId],
    );
    const approval = approvalResult.rows[0];
    if (!approval) {
      throw new ApiError(
        404,
        "EFFECT_REVERSAL_APPROVAL_NOT_FOUND",
        "The exact reversal approval was not found.",
      );
    }
    if (
      approval.status !== "active" ||
      approval.expires_at <= new Date() ||
      approval.approved_by_user_id !== auth.userId
    ) {
      throw new ApiError(
        409,
        "EFFECT_REVERSAL_APPROVAL_NOT_CURRENT",
        "The reversal approval is stale, expired, revoked, consumed, or belongs to another user.",
      );
    }
    const grantResult = await client.query<{ id: string }>(
      `SELECT id
       FROM capability_grants
       WHERE account_id = $1
         AND user_id = $2
         AND capability = $3
         AND status = 'active'
         AND expires_at > now()
       FOR UPDATE`,
      [auth.accountId, auth.userId, SIMULATED_REVERSAL_CAPABILITY],
    );
    const grant = grantResult.rows[0];
    if (!grant) {
      throw new ApiError(
        403,
        "EFFECT_REVERSAL_CAPABILITY_NOT_AUTHORIZED",
        "The local simulated reversal capability is not currently authorized.",
      );
    }
    const attemptNumberResult = await client.query<{ next_attempt: number }>(
      `SELECT (count(*) + 1)::integer AS next_attempt
       FROM effect_reversal_attempts
       WHERE account_id = $1 AND original_attempt_id = $2`,
      [auth.accountId, originalAttemptId],
    );
    const reversalAttemptId = randomUUID();
    await client.query(
      `INSERT INTO effect_reversal_attempts(
         id, account_id, original_attempt_id, approval_id,
         capability_grant_id, exact_preview_digest, adapter,
         attempt_number, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'local_deterministic', $7, 'running')`,
      [
        reversalAttemptId,
        auth.accountId,
        originalAttemptId,
        approval.id,
        grant.id,
        approval.exact_preview_digest,
        attemptNumberResult.rows[0]?.next_attempt ?? 1,
      ],
    );
    await appendAudit(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "effect_reversal.started",
      "effect_reversal_attempt",
      reversalAttemptId,
      {
        original_attempt_id: originalAttemptId,
        approval_id: approval.id,
        destination_key: approval.exact_preview.target.destination_key,
        simulated: true,
      },
    );

    const destinationResult = await client.query<{
      id: string;
      state: unknown;
      version: number;
    }>(
      `SELECT id, state, version
       FROM simulated_destinations
       WHERE account_id = $1 AND destination_key = $2
       FOR UPDATE`,
      [auth.accountId, approval.exact_preview.target.destination_key],
    );
    const destination = destinationResult.rows[0];
    const destinationMatches =
      destination?.version ===
        approval.exact_preview.expected_destination_version &&
      stableStringify(destination.state) ===
        stableStringify(approval.exact_preview.current_effect);

    let observationId: string;
    if (!destinationMatches) {
      observationId = await insertEffectReversalObservation(
        client,
        auth.accountId,
        reversalAttemptId,
        approval.exact_preview.target.destination_key,
        destination,
        destination ? "still_present" : "unavailable",
      );
      await client.query(
        `UPDATE effect_reversal_attempts
         SET status = 'failed',
             failure_code = 'REVERSAL_DESTINATION_CHANGED',
             finished_at = now()
         WHERE account_id = $1 AND id = $2`,
        [auth.accountId, reversalAttemptId],
      );
      await client.query(
        `UPDATE effect_reversal_approvals
         SET status = 'stale'
         WHERE account_id = $1 AND id = $2`,
        [auth.accountId, approval.id],
      );
      await insertEffectReversalOutcome(
        client,
        auth.accountId,
        reversalAttemptId,
        observationId,
        "failed",
        "The destination changed after reversal approval. Nothing was removed.",
      );
    } else {
      await client.query(
        `DELETE FROM simulated_destinations
         WHERE account_id = $1 AND id = $2 AND version = $3`,
        [auth.accountId, destination.id, destination.version],
      );
      observationId = await insertEffectReversalObservation(
        client,
        auth.accountId,
        reversalAttemptId,
        approval.exact_preview.target.destination_key,
        undefined,
        "matched_absent",
      );
      await client.query(
        `UPDATE effect_reversal_attempts
         SET status = 'verified', failure_code = NULL, finished_at = now()
         WHERE account_id = $1 AND id = $2`,
        [auth.accountId, reversalAttemptId],
      );
      await client.query(
        `UPDATE effect_reversal_approvals
         SET status = 'consumed'
         WHERE account_id = $1 AND id = $2`,
        [auth.accountId, approval.id],
      );
      await insertEffectReversalOutcome(
        client,
        auth.accountId,
        reversalAttemptId,
        observationId,
        "verified",
        "Reversal verified: the labeled local simulated attention item is absent.",
      );
    }

    const body = await loadEffectReversalResult(
      client,
      auth.accountId,
      reversalAttemptId,
      false,
    );
    await appendAudit(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      `effect_reversal.${body.attempt_status}`,
      "effect_reversal_attempt",
      reversalAttemptId,
      {
        original_attempt_id: originalAttemptId,
        destination_observed: body.observation !== null,
        original_effect_preserved_in_audit: true,
        simulated: true,
      },
    );
    await completeIdempotency(client, idempotency, 200, body);
    return { body, replayed: false, status: 200 };
  });
}

export async function revokeEffectReversalApproval(
  pool: Pool,
  auth: AuthContext,
  approvalId: string,
  request: RevokeApprovalRequest,
): Promise<MutationResult<{ id: string; status: "revoked" }>> {
  return inTransaction(pool, async (client) => {
    const idempotency = await claimIdempotency(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      `revoke_effect_reversal_approval:${approvalId}`,
      request.idempotency_key,
      request,
    );
    if (idempotency.replay) {
      return {
        body: idempotency.replay.body as { id: string; status: "revoked" },
        replayed: true,
        status: idempotency.replay.status,
      };
    }
    const result = await client.query<{ original_attempt_id: string }>(
      `UPDATE effect_reversal_approvals
       SET status = 'revoked',
           revoked_at = now(),
           revocation_reason = $4
       WHERE account_id = $1
         AND id = $2
         AND approved_by_user_id = $3
         AND status = 'active'
       RETURNING original_attempt_id`,
      [auth.accountId, approvalId, auth.userId, request.reason],
    );
    const approval = result.rows[0];
    if (!approval) {
      throw new ApiError(
        409,
        "EFFECT_REVERSAL_APPROVAL_NOT_CURRENT",
        "The reversal approval is not current or belongs to another user.",
      );
    }
    await appendAudit(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "effect_reversal.approval_revoked",
      "effect_attempt",
      approval.original_attempt_id,
      { approval_id: approvalId, reason: request.reason },
    );
    const body = { id: approvalId, status: "revoked" as const };
    await completeIdempotency(client, idempotency, 200, body);
    return { body, replayed: false, status: 200 };
  });
}

export async function revokeCapability(
  pool: Pool,
  auth: AuthContext,
  request: RevokeCapabilityRequest,
): Promise<MutationResult<{ capability: string; status: "revoked" }>> {
  return inTransaction(pool, async (client) => {
    const idempotency = await claimIdempotency(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "revoke_capability",
      request.idempotency_key,
      request,
    );
    if (idempotency.replay) {
      return {
        body: idempotency.replay.body as {
          capability: string;
          status: "revoked";
        },
        replayed: true,
        status: idempotency.replay.status,
      };
    }
    const result = await client.query<{ id: string }>(
      `UPDATE capability_grants
       SET status = 'revoked',
           version = version + 1,
           revoked_at = now(),
           revocation_reason = $4
       WHERE account_id = $1
         AND user_id = $2
         AND capability = $3
         AND status = 'active'
       RETURNING id`,
      [auth.accountId, auth.userId, request.capability, request.reason],
    );
    const grant = result.rows[0];
    if (!grant) {
      throw new ApiError(
        409,
        "CAPABILITY_NOT_ACTIVE",
        "The capability is not currently active.",
      );
    }
    await appendAudit(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "capability.revoked",
      "capability_grant",
      grant.id,
      { capability: request.capability, reason: request.reason },
    );
    const body = {
      capability: request.capability,
      status: "revoked" as const,
    };
    await completeIdempotency(client, idempotency, 200, body);
    return { body, replayed: false, status: 200 };
  });
}
