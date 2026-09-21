import { randomUUID } from "node:crypto";

import {
  CONTRACT_VERSION,
  type ConversationImageManifest,
  type ConversationQueueEntry,
  type ConversationQueueEntryStatus,
  type ConversationQueueSnapshot,
} from "@talent-signal/contracts";
import type { Pool, PoolClient } from "pg";

import { inTransaction, type DatabaseClient } from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import type { AuthContext } from "./auth.js";
import { assertSessionForChat } from "./agentSessionSources.js";
import { readConversationMessageImageManifests } from "./conversationMessageImages.js";
import { publishConversationQueueChanged } from "./conversationQueueLive.js";

export const CONVERSATION_QUEUE_MAX_ENTRIES = 50;
export const CONVERSATION_QUEUE_LEASE_MS = 90_000;
export const CONVERSATION_QUEUE_MAX_CONCURRENT_RUNS = 4;

const ACTIVE_STATUSES: ConversationQueueEntryStatus[] = [
  "queued",
  "running",
  "failed",
  "interrupted",
];

export interface ConversationQueueEntryRow {
  account_id: string;
  session_id: string;
  id: string;
  message_id: string;
  created_by_user_id: string;
  auth_session_id: string | null;
  sequence: string;
  status: ConversationQueueEntryStatus;
  content_state: "retained" | "scrubbed";
  objective: string | null;
  time_zone: string | null;
  idempotency_key: string;
  run_id: string | null;
  lease_owner: string | null;
  lease_generation: number;
  lease_expires_at: Date | null;
  attempt: number;
  revision: number;
  stage: string | null;
  cancel_requested: boolean;
  failure_code: string | null;
  images_hash: string | null;
  result: unknown;
  result_recorded_at: Date | null;
  lineage_recorded_at: Date | null;
  persisted_at: Date | null;
  claimed_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  expires_at: Date;
}

export interface ConversationQueueRunFence {
  accountId: string;
  sessionId: string;
  entryId: string;
  runId: string;
  leaseOwner: string;
  leaseGeneration: number;
}

export type ConversationQueueTerminalStatus =
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export class ConversationQueueLeaseLostError extends Error {
  constructor() {
    super("CONVERSATION_QUEUE_LEASE_LOST");
    this.name = "ConversationQueueLeaseLostError";
  }
}

export interface ClaimedConversationQueueEntry {
  accountId: string;
  sessionId: string;
  authSessionId: string | null;
  entryId: string;
  messageId: string;
  runId: string;
  objective: string;
  timeZone: string | null;
  createdByUserId: string;
  sequence: number;
  attempt: number;
  leaseOwner: string;
  leaseGeneration: number;
  hasResult: boolean;
  /** Original accepted timestamp; canonical user turns must preserve it. */
  acceptedAt: string;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function asNumber(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

function toEntry(
  row: ConversationQueueEntryRow,
  images: ConversationImageManifest[] | undefined,
): ConversationQueueEntry {
  return {
    queue_entry_id: row.id,
    message_id: row.message_id,
    sequence: asNumber(row.sequence),
    status: row.status,
    objective: row.objective ?? "",
    ...(images && images.length > 0 ? { images } : {}),
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
    revision: row.revision,
    run_id: row.run_id,
    stage: row.stage,
    cancel_requested: row.cancel_requested,
    failure_code: row.failure_code,
  };
}

export async function lockConversationQueueSession(
  client: PoolClient,
  sessionId: string,
): Promise<void> {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
    [`conversation-queue:${sessionId}`],
  );
}

export async function readConversationQueueState(
  client: DatabaseClient,
  accountId: string,
  sessionId: string,
): Promise<{ revision: number; paused: boolean }> {
  const row = (
    await client.query<{ revision: number; paused: boolean }>(
      "SELECT revision,paused FROM conversation_queue_state WHERE account_id=$1 AND session_id=$2",
      [accountId, sessionId],
    )
  ).rows[0];
  return { revision: row?.revision ?? 0, paused: row?.paused ?? false };
}

export async function bumpConversationQueueState(
  client: PoolClient,
  accountId: string,
  sessionId: string,
  options: { paused?: boolean } = {},
): Promise<number> {
  const row = (
    await client.query<{ revision: number }>(
      `UPDATE conversation_queue_state
       SET revision=revision+1, updated_at=now(),
           paused=COALESCE($3, paused)
       WHERE account_id=$1 AND session_id=$2
       RETURNING revision`,
      [accountId, sessionId, options.paused ?? null],
    )
  ).rows[0];
  return row?.revision ?? 0;
}

export async function allocateConversationQueueSequence(
  client: PoolClient,
  accountId: string,
  sessionId: string,
): Promise<{ sequence: number; revision: number }> {
  const row = (
    await client.query<{ sequence: string; revision: number }>(
      `INSERT INTO conversation_queue_state(account_id,session_id,revision,paused,next_sequence)
       VALUES($1,$2,1,false,2)
       ON CONFLICT (account_id,session_id) DO UPDATE
         SET next_sequence=conversation_queue_state.next_sequence+1,
             revision=conversation_queue_state.revision+1,
             updated_at=now()
       RETURNING next_sequence-1 AS sequence, revision`,
      [accountId, sessionId],
    )
  ).rows[0]!;
  return { sequence: asNumber(row.sequence), revision: row.revision };
}

/**
 * Every read frame rechecks the Session's current source validity, not merely
 * Session existence. A revoked screenshot source fences queued intentions and
 * any live observation before they can redisplay stale material.
 */
export async function assertConversationQueueContextCurrent(
  client: DatabaseClient,
  auth: AuthContext,
  sessionId: string,
): Promise<void> {
  const row = (
    await client.query<{ unavailable: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM jsonb_array_elements_text(COALESCE(payload->'screenshotTaskIDs','[]'::jsonb)) task
         WHERE NOT agent_session_screenshot_available($1, task)
       ) AS unavailable
       FROM agent_sessions
       WHERE account_id=$1 AND created_by_user_id=$2 AND id=$3 AND deleted_at IS NULL`,
      [auth.accountId, auth.userId, sessionId],
    )
  ).rows[0];
  if (row?.unavailable) {
    throw new ApiError(
      410,
      "CONVERSATION_QUEUE_CONTEXT_REVOKED",
      "A source for this conversation was withdrawn; queued work is fenced.",
    );
  }
}

export async function readConversationQueueSnapshot(
  client: DatabaseClient,
  auth: AuthContext,
  sessionId: string,
): Promise<ConversationQueueSnapshot> {
  await assertSessionForChat(client, auth, sessionId);
  await assertConversationQueueContextCurrent(client, auth, sessionId);
  const state = await readConversationQueueState(client, auth.accountId, sessionId);
  const rows = (
    await client.query<ConversationQueueEntryRow>(
      `SELECT * FROM conversation_queue_entries
       WHERE account_id=$1 AND session_id=$2 AND status = ANY($3::text[])
       ORDER BY sequence`,
      [auth.accountId, sessionId, ACTIVE_STATUSES],
    )
  ).rows;
  const manifests = await readConversationMessageImageManifests(
    client,
    auth.accountId,
    rows.map((row) => row.id),
  );
  const entries = rows.map((row) => toEntry(row, manifests.get(row.id)));
  return {
    contract_version: CONTRACT_VERSION,
    session_id: sessionId,
    revision: state.revision,
    paused: state.paused,
    active: entries.find((entry) => entry.status === "running") ?? null,
    queued: entries.filter((entry) => entry.status !== "running"),
    preview: null,
  };
}

export async function listRunnableConversationQueueSessions(
  pool: Pool,
): Promise<Array<{ accountId: string; sessionId: string }>> {
  const rows = (
    await pool.query<{ account_id: string; session_id: string }>(
      `SELECT s.account_id, s.session_id
       FROM conversation_queue_state s
       WHERE s.paused=false
         AND EXISTS (SELECT 1 FROM conversation_queue_entries e
           WHERE e.account_id=s.account_id AND e.session_id=s.session_id AND e.status='queued')
         AND NOT EXISTS (SELECT 1 FROM conversation_queue_entries e
           WHERE e.account_id=s.account_id AND e.session_id=s.session_id AND e.status='running')
       ORDER BY s.updated_at
       LIMIT 25`,
    )
  ).rows;
  return rows.map((row) => ({ accountId: row.account_id, sessionId: row.session_id }));
}

export async function claimNextConversationQueueEntry(
  pool: Pool,
  input: { accountId: string; sessionId: string; workerId: string },
): Promise<ClaimedConversationQueueEntry | null> {
  const claimed = await inTransaction(pool, async (client) => {
    await lockConversationQueueSession(client, input.sessionId);
    const state = await readConversationQueueState(client, input.accountId, input.sessionId);
    if (state.paused) return null;
    const running = (
      await client.query<{ id: string }>(
        "SELECT id FROM conversation_queue_entries WHERE account_id=$1 AND session_id=$2 AND status='running' LIMIT 1",
        [input.accountId, input.sessionId],
      )
    ).rows[0];
    if (running) return null;
    const next = (
      await client.query<ConversationQueueEntryRow>(
        `SELECT * FROM conversation_queue_entries
         WHERE account_id=$1 AND session_id=$2 AND status='queued'
         ORDER BY sequence LIMIT 1 FOR UPDATE SKIP LOCKED`,
        [input.accountId, input.sessionId],
      )
    ).rows[0];
    if (!next || next.objective === null) return null;
    const runId = randomUUID();
    const generation = next.lease_generation + 1;
    const updated = (
      await client.query<ConversationQueueEntryRow>(
        `UPDATE conversation_queue_entries
         SET status='running', run_id=$3, lease_owner=$4, lease_generation=$5,
             lease_expires_at=now()+($6::int * interval '1 millisecond'),
             attempt=attempt+1, revision=revision+1, claimed_at=now(), updated_at=now(), cancel_requested=false
         WHERE account_id=$1 AND id=$2 AND status='queued'
         RETURNING *`,
        [
          input.accountId,
          next.id,
          runId,
          input.workerId,
          generation,
          CONVERSATION_QUEUE_LEASE_MS,
        ],
      )
    ).rows[0];
    if (!updated || updated.objective === null) return null;
    await bumpConversationQueueState(client, input.accountId, input.sessionId);
    return {
      accountId: updated.account_id,
      sessionId: updated.session_id,
      authSessionId: updated.auth_session_id,
      entryId: updated.id,
      messageId: updated.message_id,
      runId,
      objective: updated.objective ?? "",
      timeZone: updated.time_zone,
      createdByUserId: updated.created_by_user_id,
      sequence: asNumber(updated.sequence),
      attempt: updated.attempt,
      leaseOwner: input.workerId,
      leaseGeneration: generation,
      hasResult: updated.result !== null,
      acceptedAt: updated.created_at.toISOString(),
    } satisfies ClaimedConversationQueueEntry;
  });
  if (claimed) publishConversationQueueChanged(claimed.accountId, claimed.sessionId);
  return claimed;
}

function fencePredicate(offset: number): string {
  // account, entry, run, leaseOwner, generation
  return `account_id=$${offset} AND id=$${offset + 1} AND run_id=$${offset + 2}
    AND lease_owner=$${offset + 3} AND lease_generation=$${offset + 4}
    AND status='running' AND lease_expires_at>now() AND cancel_requested=false`;
}

/** A user stop sets `cancel_requested`, so its terminal finalize must not require it to be false. */
function fencePredicateAllowCancel(offset: number): string {
  return `account_id=$${offset} AND id=$${offset + 1} AND run_id=$${offset + 2}
    AND lease_owner=$${offset + 3} AND lease_generation=$${offset + 4}
    AND status='running' AND lease_expires_at>now()`;
}

function fenceValues(fence: ConversationQueueRunFence): unknown[] {
  return [
    fence.accountId,
    fence.entryId,
    fence.runId,
    fence.leaseOwner,
    fence.leaseGeneration,
  ];
}

export async function refreshConversationQueueLease(
  pool: Pool,
  fence: ConversationQueueRunFence,
): Promise<{ cancelRequested: boolean } | null> {
  const row = (
    await pool.query<{ cancel_requested: boolean }>(
      `UPDATE conversation_queue_entries
       SET lease_expires_at=now()+($6::int * interval '1 millisecond'), updated_at=now()
       WHERE ${fencePredicateAllowCancel(1)}
       RETURNING cancel_requested`,
      [...fenceValues(fence), CONVERSATION_QUEUE_LEASE_MS],
    )
  ).rows[0];
  return row ? { cancelRequested: row.cancel_requested } : null;
}

export async function assertConversationQueueOwnedClaim(
  pool: Pool,
  fence: ConversationQueueRunFence,
  options: { allowCancelRequested?: boolean } = {},
): Promise<{ cancelRequested: boolean }> {
  const row = (
    await pool.query<{ cancel_requested: boolean }>(
      `SELECT cancel_requested FROM conversation_queue_entries
       WHERE ${fencePredicateAllowCancel(1)}
         AND ($6::boolean OR cancel_requested=false)
       FOR UPDATE`,
      [...fenceValues(fence), options.allowCancelRequested === true],
    )
  ).rows[0];
  if (!row) throw new ConversationQueueLeaseLostError();
  return { cancelRequested: row.cancel_requested };
}

export async function assertConversationQueueLiveClaim(
  pool: Pool,
  fence: ConversationQueueRunFence,
): Promise<void> {
  await assertConversationQueueOwnedClaim(pool, fence, { allowCancelRequested: false });
}

export async function recordConversationQueueResult(
  pool: Pool,
  fence: ConversationQueueRunFence,
  result: unknown,
): Promise<void> {
  const applied = await inTransaction(pool, async (client) => {
    const updated = await client.query(
      `UPDATE conversation_queue_entries
       SET result=$6::jsonb, result_recorded_at=now(), revision=revision+1, updated_at=now()
       WHERE ${fencePredicate(1)}
       RETURNING id`,
      [...fenceValues(fence), JSON.stringify(result)],
    );
    if (updated.rowCount !== 1) throw new ConversationQueueLeaseLostError();
    await bumpConversationQueueState(client, fence.accountId, fence.sessionId);
  });
  void applied;
  publishConversationQueueChanged(fence.accountId, fence.sessionId);
}

export async function readConversationQueueResult(
  pool: Pool,
  accountId: string,
  entryId: string,
): Promise<unknown | null> {
  const row = (
    await pool.query<{ result: unknown | null }>(
      "SELECT result FROM conversation_queue_entries WHERE account_id=$1 AND id=$2",
      [accountId, entryId],
    )
  ).rows[0];
  return row?.result ?? null;
}

/**
 * Finalize a run. `completed` requires an un-cancelled, still-live fence; if a
 * stop or refusal won the race the caller must finalize the truthful state
 * instead. Failed/interrupted states pause the queue; completion never clears a
 * concurrent pause.
 */
export async function finalizeConversationQueueEntry(
  pool: Pool,
  input: {
    fence: ConversationQueueRunFence;
    status: ConversationQueueTerminalStatus;
    failureCode?: string | null;
    keepResult?: boolean;
  },
): Promise<{ applied: boolean; effectiveStatus: ConversationQueueTerminalStatus | "running" }> {
  const { fence } = input;
  const outcome = await inTransaction(pool, async (client) => {
    const scrub = input.status === "completed" || input.status === "cancelled";
    const resultClause = input.keepResult ? "result=result" : "result=NULL, result_recorded_at=NULL";
    const objectiveClause = scrub ? "objective=NULL," : "";
    const predicate =
      input.status === "cancelled" ? fencePredicateAllowCancel(1) : fencePredicate(1);
    const updated = await client.query(
      `UPDATE conversation_queue_entries
       SET status=$6, content_state=$7, ${objectiveClause} stage=NULL, ${resultClause},
           lease_owner=NULL, lease_expires_at=NULL, cancel_requested=false,
           failure_code=$8, completed_at=now(), updated_at=now(), revision=revision+1
       WHERE ${predicate}
       RETURNING id`,
      [...fenceValues(fence), input.status, scrub ? "scrubbed" : "retained", input.failureCode ?? null],
    );
    if (updated.rowCount !== 1) {
      const current = (
        await client.query<{ status: ConversationQueueEntryStatus; cancel_requested: boolean }>(
          "SELECT status,cancel_requested FROM conversation_queue_entries WHERE account_id=$1 AND id=$2",
          [fence.accountId, fence.entryId],
        )
      ).rows[0];
      return {
        applied: false,
        effectiveStatus: (current?.status ?? "interrupted") as ConversationQueueTerminalStatus,
      };
    }
    await bumpConversationQueueState(client, fence.accountId, fence.sessionId, input.status === "completed" ? {} : { paused: true });
    return { applied: true, effectiveStatus: input.status };
  });
  publishConversationQueueChanged(fence.accountId, fence.sessionId);
  return outcome;
}

/**
 * A persistence failure after provider success keeps the reusable result. The
 * explicit retry or lease recovery must replay persistence, never the model.
 */
export async function markConversationQueuePersistencePending(
  pool: Pool,
  input: { fence: ConversationQueueRunFence; failureCode?: string },
): Promise<void> {
  const { fence } = input;
  await inTransaction(pool, async (client) => {
    const updated = await client.query(
      `UPDATE conversation_queue_entries
       SET status='failed', content_state='retained', stage=NULL, failure_code=$6,
           lease_owner=NULL, lease_expires_at=NULL, cancel_requested=false,
           completed_at=now(), updated_at=now(), revision=revision+1
       WHERE ${fencePredicate(1)} AND result IS NOT NULL
       RETURNING id`,
      [...fenceValues(fence), input.failureCode ?? "PERSISTENCE_PENDING"],
    );
    if (updated.rowCount !== 1) throw new ConversationQueueLeaseLostError();
    await bumpConversationQueueState(client, fence.accountId, fence.sessionId, { paused: true });
  });
  publishConversationQueueChanged(fence.accountId, fence.sessionId);
}

/**
 * Reclaim an entry whose lease actually expired, for recovery only. The run id
 * and stored result are preserved so persistence can replay without the model.
 */
export async function reclaimStaleConversationQueueEntry(
  pool: Pool,
  input: { accountId: string; sessionId: string; entryId: string; workerId: string },
): Promise<ClaimedConversationQueueEntry | null> {
  const claimed = await inTransaction(pool, async (client) => {
    await lockConversationQueueSession(client, input.sessionId);
    const updated = (
      await client.query<ConversationQueueEntryRow>(
        `UPDATE conversation_queue_entries
         SET lease_owner=$3, lease_generation=lease_generation+1,
             lease_expires_at=now()+($4::int * interval '1 millisecond'), updated_at=now()
         WHERE account_id=$1 AND id=$2 AND status='running'
           AND (lease_expires_at IS NULL OR lease_expires_at<=now())
         RETURNING *`,
        [input.accountId, input.entryId, input.workerId, CONVERSATION_QUEUE_LEASE_MS],
      )
    ).rows[0];
    if (!updated || updated.objective === null || !updated.run_id || !updated.lease_owner) return null;
    await bumpConversationQueueState(client, input.accountId, input.sessionId);
    return {
      accountId: updated.account_id,
      sessionId: updated.session_id,
      authSessionId: updated.auth_session_id,
      entryId: updated.id,
      messageId: updated.message_id,
      runId: updated.run_id,
      objective: updated.objective,
      timeZone: updated.time_zone,
      createdByUserId: updated.created_by_user_id,
      sequence: asNumber(updated.sequence),
      attempt: updated.attempt,
      leaseOwner: updated.lease_owner,
      leaseGeneration: updated.lease_generation,
      hasResult: updated.result !== null,
      acceptedAt: updated.created_at.toISOString(),
    } satisfies ClaimedConversationQueueEntry;
  });
  if (claimed) publishConversationQueueChanged(claimed.accountId, claimed.sessionId);
  return claimed;
}

export async function listStaleRunningConversationQueueEntries(
  pool: Pool,
): Promise<
  Array<{
    accountId: string;
    sessionId: string;
    entryId: string;
    messageId: string;
    runId: string | null;
    objective: string;
    createdByUserId: string;
    hasResult: boolean;
    failureCode: string | null;
  }>
> {
  const rows = (
    await pool.query<{
      account_id: string;
      session_id: string;
      id: string;
      message_id: string;
      run_id: string | null;
      objective: string | null;
      created_by_user_id: string;
      result: unknown;
      failure_code: string | null;
    }>(
      `SELECT account_id,session_id,id,message_id,run_id,objective,created_by_user_id,result,failure_code
       FROM conversation_queue_entries
       WHERE status='running' AND (lease_expires_at IS NULL OR lease_expires_at<=now())
       ORDER BY updated_at
       LIMIT 20`,
    )
  ).rows;
  return rows
    .filter((row) => row.objective !== null)
    .map((row) => ({
      accountId: row.account_id,
      sessionId: row.session_id,
      entryId: row.id,
      messageId: row.message_id,
      runId: row.run_id,
      objective: row.objective!,
      createdByUserId: row.created_by_user_id,
      hasResult: row.result !== null,
      failureCode: row.failure_code,
    }));
}

/**
 * Conservative recovery for a crashed run. Only an entry whose lease actually
 * expired is touched; a live worker's row is left alone.
 */
export async function markConversationQueueEntryInterrupted(
  pool: Pool,
  input: {
    accountId: string;
    sessionId: string;
    entryId: string;
    failureCode?: string;
  },
): Promise<void> {
  await inTransaction(pool, async (client) => {
    await client.query(
      `UPDATE conversation_queue_entries
       SET status='interrupted', content_state='retained', stage=NULL, result=NULL, result_recorded_at=NULL,
           lease_owner=NULL, lease_expires_at=NULL, cancel_requested=false, failure_code=$3,
           completed_at=now(), updated_at=now(), revision=revision+1
       WHERE account_id=$1 AND id=$2 AND status='running'
         AND (lease_expires_at IS NULL OR lease_expires_at<=now())`,
      [input.accountId, input.entryId, input.failureCode ?? "RUNNER_INTERRUPTED"],
    );
    await bumpConversationQueueState(client, input.accountId, input.sessionId, { paused: true });
  });
  publishConversationQueueChanged(input.accountId, input.sessionId);
}

export async function readConversationQueueEntryStatus(
  pool: Pool,
  accountId: string,
  entryId: string,
): Promise<{ status: ConversationQueueEntryStatus; failureCode: string | null } | null> {
  const row = (
    await pool.query<{ status: ConversationQueueEntryStatus; failure_code: string | null }>(
      "SELECT status,failure_code FROM conversation_queue_entries WHERE account_id=$1 AND id=$2",
      [accountId, entryId],
    )
  ).rows[0];
  return row ? { status: row.status, failureCode: row.failure_code } : null;
}

/**
 * Build the runner's authority from the stored owner. Membership is rechecked
 * at claim and commit; a removed user never inherits queue authority.
 */
export async function runnerAuthContext(
  client: DatabaseClient,
  input: { accountId: string; userId: string; authSessionId: string | null },
): Promise<AuthContext> {
  const row = (
    await client.query<{
      email: string;
      kind: AuthContext["userKind"];
      slug: string;
    }>(
      `SELECT u.email, u.kind, a.slug
       FROM users u JOIN accounts a ON a.id=u.account_id
       WHERE u.account_id=$1 AND u.id=$2 AND u.status='active'`,
      [input.accountId, input.userId],
    )
  ).rows[0];
  if (!row) {
    throw new ApiError(
      404,
      "CONVERSATION_QUEUE_OWNER_UNAVAILABLE",
      "The conversation owner is no longer available.",
    );
  }
  return {
    accountId: input.accountId,
    accountSlug: row.slug,
    userId: input.userId,
    userEmail: row.email,
    userKind: row.kind,
    sessionId: input.authSessionId ?? "conversation-queue-runner",
  };
}
