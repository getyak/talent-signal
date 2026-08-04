import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import { ApiError } from "./apiError.js";
import { digestValue } from "./hash.js";

export interface IdempotencyContext {
  accountId: string;
  actorUserId: string;
}

export interface IdempotencyClaim {
  id: string;
  replay: { status: number; body: unknown } | null;
}

export async function claimIdempotency(
  client: PoolClient,
  context: IdempotencyContext,
  operationScope: string,
  idempotencyKey: string,
  request: unknown,
): Promise<IdempotencyClaim> {
  const id = randomUUID();
  const requestHash = digestValue(request);
  const inserted = await client.query(
    `INSERT INTO idempotency_records(
       id, account_id, actor_user_id, operation_scope, idempotency_key,
       request_hash, status
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'processing')
     ON CONFLICT (account_id, actor_user_id, operation_scope, idempotency_key)
     DO NOTHING`,
    [
      id,
      context.accountId,
      context.actorUserId,
      operationScope,
      idempotencyKey,
      requestHash,
    ],
  );

  if (inserted.rowCount === 1) {
    return { id, replay: null };
  }

  const existing = await client.query<{
    id: string;
    request_hash: string;
    status: string;
    response_status: number | null;
    response_body: unknown;
  }>(
    `SELECT id, request_hash, status, response_status, response_body
     FROM idempotency_records
     WHERE account_id = $1
       AND actor_user_id = $2
       AND operation_scope = $3
       AND idempotency_key = $4
     FOR UPDATE`,
    [
      context.accountId,
      context.actorUserId,
      operationScope,
      idempotencyKey,
    ],
  );
  const record = existing.rows[0];
  if (!record) {
    throw new ApiError(
      409,
      "IDEMPOTENCY_STATE_UNAVAILABLE",
      "The idempotency record could not be resolved.",
    );
  }
  if (record.request_hash !== requestHash) {
    throw new ApiError(
      409,
      "IDEMPOTENCY_KEY_REUSED",
      "This idempotency key was already used for a different request.",
    );
  }
  if (
    record.status !== "completed" ||
    record.response_status === null ||
    record.response_body === null
  ) {
    throw new ApiError(
      409,
      "IDEMPOTENCY_REQUEST_IN_PROGRESS",
      "The matching request is still in progress.",
    );
  }
  return {
    id: record.id,
    replay: {
      status: record.response_status,
      body: record.response_body,
    },
  };
}

export async function completeIdempotency(
  client: PoolClient,
  claim: IdempotencyClaim,
  status: number,
  body: unknown,
): Promise<void> {
  await client.query(
    `UPDATE idempotency_records
     SET status = 'completed',
         response_status = $2,
         response_body = $3,
         completed_at = now()
     WHERE id = $1`,
    [claim.id, status, body],
  );
}
