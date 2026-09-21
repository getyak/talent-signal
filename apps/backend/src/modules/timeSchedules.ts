import {
  CONTRACT_VERSION,
  type TimeScheduleDeleteRequest,
  type TimeScheduleMutationRequest,
  type TimeScheduleRecord,
  type TimeScheduleResponse,
} from "@talent-signal/contracts";
import type { Pool } from "pg";

import { inTransaction, type DatabaseClient } from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import { appendAudit } from "../lib/audit.js";
import { digestValue } from "../lib/hash.js";
import type { AuthContext } from "./auth.js";
import { isValidTimeZone } from "./timeWorkspaceShared.js";

const ALLOWED_REMINDERS = new Set([0, 5, 15, 30, 60]);
const MAX_SCHEDULE_MS = 7 * 86_400_000;

type TimeScheduleStatus = TimeScheduleRecord["status"];

interface ScheduleRow {
  account_id: string;
  id: string;
  created_by_user_id: string;
  title: string | null;
  note: string | null;
  kind: "meeting" | "reminder" | null;
  person_id: string | null;
  starts_at: Date | null;
  ends_at: Date | null;
  time_zone: string | null;
  all_day: boolean;
  status: TimeScheduleStatus;
  reminder_minutes: number | null;
  external_effect: "none";
  revision: number;
  last_operation_id: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  person_label: string | null;
}

interface OperationRow {
  schedule_id: string;
  operation: "create" | "update" | "delete";
  request_hash: string;
  resulting_revision: number;
}

const SCHEDULE_SELECT = `SELECT schedule.*, person.display_label AS person_label
  FROM time_schedules schedule
  LEFT JOIN subjects person
    ON person.account_id = schedule.account_id
   AND person.status = 'active'
   AND person.id = schedule.person_id
  WHERE schedule.account_id=$1 AND schedule.id=$2
    AND schedule.created_by_user_id=$3`;

function notFound(): ApiError {
  return new ApiError(
    404,
    "TIME_SCHEDULE_NOT_FOUND",
    "The schedule is not available in this account and user scope.",
  );
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string }).code === "23505";
}

function recordSchedule(row: ScheduleRow): TimeScheduleRecord {
  const base = {
    id: row.id,
    revision: row.revision,
    last_operation_id: row.last_operation_id,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    status: row.status,
    all_day: row.all_day,
    authority: "user_authored" as const,
    external_effect: "none" as const,
  };
  if (row.status === "deleted") {
    return {
      ...base,
      content_available: false,
      title: null,
      note: null,
      kind: null,
      person_id: null,
      person_label: null,
      starts_at: null,
      ends_at: null,
      time_zone: null,
      reminder_minutes: null,
    };
  }
  const personBound = row.person_id !== null && row.person_label !== null;
  return {
    ...base,
    content_available: true,
    title: row.title!,
    note: row.note!,
    kind: row.kind!,
    person_id: personBound ? row.person_id : null,
    person_label: personBound ? row.person_label : null,
    starts_at: row.starts_at!.toISOString(),
    ends_at: row.ends_at!.toISOString(),
    time_zone: row.time_zone!,
    reminder_minutes: row.reminder_minutes,
  };
}

function localParts(value: string, timeZone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(value));
  return Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [
      part.type,
      part.value,
    ]),
  );
}

export function isLocalMidnight(value: string, timeZone: string): boolean {
  const parts = localParts(value, timeZone);
  return (
    parts.hour === "00" && parts.minute === "00" && parts.second === "00"
  );
}

export interface NormalizedScheduleInput {
  title: string;
  note: string;
  kind: "meeting" | "reminder";
  person_id: string | null;
  starts_at: string;
  ends_at: string;
  time_zone: string;
  all_day: boolean;
  status: "planned" | "completed" | "cancelled";
  reminder_minutes: number | null;
}

/** Strict server-side validation of a schedule mutation payload. */
export function normalizeScheduleInput(
  request: TimeScheduleMutationRequest,
): NormalizedScheduleInput {
  const title = request.title.trim();
  if (!title) {
    throw new ApiError(
      400,
      "TIME_SCHEDULE_INVALID",
      "A schedule title is required.",
    );
  }
  const startMs = Date.parse(request.starts_at);
  const endMs = Date.parse(request.ends_at);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new ApiError(
      400,
      "TIME_SCHEDULE_INVALID",
      "The schedule interval must have a start before its end.",
    );
  }
  if (endMs - startMs > MAX_SCHEDULE_MS) {
    throw new ApiError(
      400,
      "TIME_SCHEDULE_INVALID",
      "A schedule interval may span at most seven days.",
    );
  }
  if (!isValidTimeZone(request.time_zone)) {
    throw new ApiError(
      400,
      "TIME_SCHEDULE_INVALID",
      "The schedule must use a valid IANA time zone.",
    );
  }
  const startsAt = new Date(startMs).toISOString();
  const endsAt = new Date(endMs).toISOString();
  if (
    request.all_day &&
    (!isLocalMidnight(startsAt, request.time_zone) ||
      !isLocalMidnight(endsAt, request.time_zone))
  ) {
    throw new ApiError(
      400,
      "TIME_SCHEDULE_INVALID",
      "An all-day schedule must start and end at local midnight.",
    );
  }
  if (
    request.reminder_minutes !== null &&
    !ALLOWED_REMINDERS.has(request.reminder_minutes)
  ) {
    throw new ApiError(
      400,
      "TIME_SCHEDULE_INVALID",
      "The reminder interval is not supported.",
    );
  }
  if (request.status === "completed" && startMs > Date.now()) {
    throw new ApiError(
      400,
      "TIME_SCHEDULE_INVALID",
      "A future schedule cannot be marked completed; only a human review can complete it.",
    );
  }
  return {
    title,
    note: request.note,
    kind: request.kind,
    person_id: request.person_id,
    starts_at: startsAt,
    ends_at: endsAt,
    time_zone: request.time_zone,
    all_day: request.all_day,
    status: request.status,
    reminder_minutes: request.reminder_minutes,
  };
}

async function readSchedule(
  client: DatabaseClient,
  auth: AuthContext,
  scheduleID: string,
  lock = false,
): Promise<ScheduleRow | null> {
  return (
    await client.query<ScheduleRow>(
      `${SCHEDULE_SELECT}${lock ? " FOR UPDATE OF schedule" : ""}`,
      [auth.accountId, scheduleID, auth.userId],
    )
  ).rows[0] ?? null;
}

async function lockScheduleIdentity(
  client: DatabaseClient,
  auth: AuthContext,
  scheduleID: string,
): Promise<void> {
  // Serialize every mutation of one schedule identity before the
  // per-operation idempotency lock. Two different idempotency keys competing
  // for the same client UUID can no longer both observe "no row" and race the
  // unique insert.
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    `time-schedule:${auth.accountId}:${scheduleID}`,
  ]);
}

async function assertPersonActive(
  client: DatabaseClient,
  auth: AuthContext,
  personID: string | null,
): Promise<void> {
  if (!personID) return;
  // FOR SHARE keeps the selected Person row alive until this transaction
  // commits, so a concurrent status change to deleted cannot commit between
  // validation and the schedule write.
  const found = await client.query(
    `SELECT 1 FROM subjects
     WHERE account_id=$1 AND id=$2 AND status='active'
     FOR SHARE`,
    [auth.accountId, personID],
  );
  if (!found.rowCount) {
    throw new ApiError(
      400,
      "TIME_SCHEDULE_PERSON_UNAVAILABLE",
      "The selected Person is not active in this account.",
    );
  }
}

async function replayOperation(
  client: DatabaseClient,
  auth: AuthContext,
  input: {
    scheduleID: string;
    idempotencyKey: string;
    operation: OperationRow["operation"];
    requestHash: string;
  },
): Promise<TimeScheduleResponse | null> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    `${auth.accountId}:${auth.userId}:${input.idempotencyKey}`,
  ]);
  const operation = (
    await client.query<OperationRow>(
      `SELECT schedule_id,operation,request_hash,resulting_revision
       FROM time_schedule_operations
       WHERE account_id=$1 AND actor_user_id=$2 AND idempotency_key=$3`,
      [auth.accountId, auth.userId, input.idempotencyKey],
    )
  ).rows[0];
  if (!operation) return null;
  if (
    operation.schedule_id !== input.scheduleID ||
    operation.operation !== input.operation ||
    operation.request_hash !== input.requestHash
  ) {
    throw new ApiError(
      409,
      "TIME_SCHEDULE_INTENT_CONFLICT",
      "This operation identity belongs to a different schedule intent.",
    );
  }
  const row = await readSchedule(client, auth, input.scheduleID);
  if (!row) throw notFound();
  return { contract_version: CONTRACT_VERSION, schedule: recordSchedule(row) };
}

async function recordOperation(
  client: DatabaseClient,
  auth: AuthContext,
  input: {
    scheduleID: string;
    idempotencyKey: string;
    operation: OperationRow["operation"];
    requestHash: string;
    resultingRevision: number;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO time_schedule_operations(
       account_id,actor_user_id,idempotency_key,schedule_id,operation,
       request_hash,resulting_revision
     ) VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [
      auth.accountId,
      auth.userId,
      input.idempotencyKey,
      input.scheduleID,
      input.operation,
      input.requestHash,
      input.resultingRevision,
    ],
  );
}

export async function getTimeSchedule(
  pool: Pool | DatabaseClient,
  auth: AuthContext,
  id: string,
): Promise<TimeScheduleResponse> {
  const row = await readSchedule(pool, auth, id.toLowerCase());
  if (!row) throw notFound();
  return { contract_version: CONTRACT_VERSION, schedule: recordSchedule(row) };
}

export async function putTimeSchedule(
  pool: Pool,
  auth: AuthContext,
  id: string,
  request: TimeScheduleMutationRequest,
): Promise<TimeScheduleResponse> {
  const scheduleID = id.toLowerCase();
  const idempotencyKey = request.idempotency_key.toLowerCase();
  const input = normalizeScheduleInput(request);
  const operation = request.expected_revision === 0 ? "create" : "update";
  if (operation === "create" && input.status === "cancelled") {
    throw new ApiError(
      400,
      "TIME_SCHEDULE_INVALID",
      "A new schedule cannot be created already cancelled.",
    );
  }
  const requestHash = digestValue({
    operation,
    id: scheduleID,
    expected_revision: request.expected_revision,
    input,
  });
  return inTransaction(pool, async (client) => {
    await lockScheduleIdentity(client, auth, scheduleID);
    const replay = await replayOperation(client, auth, {
      scheduleID,
      idempotencyKey,
      operation,
      requestHash,
    });
    if (replay) return replay;
    await assertPersonActive(client, auth, input.person_id);
    if (operation === "create") {
      if (await readSchedule(client, auth, scheduleID, true)) {
        throw new ApiError(
          409,
          "TIME_SCHEDULE_ALREADY_EXISTS",
          "A schedule already exists for this identity; read it before editing.",
        );
      }
      try {
        await client.query(
          `INSERT INTO time_schedules(
             account_id,id,created_by_user_id,title,note,kind,person_id,
             starts_at,ends_at,time_zone,all_day,status,reminder_minutes,
             external_effect,revision,last_operation_id
           ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'none',1,$14)`,
          [
            auth.accountId,
            scheduleID,
            auth.userId,
            input.title,
            input.note,
            input.kind,
            input.person_id,
            input.starts_at,
            input.ends_at,
            input.time_zone,
            input.all_day,
            input.status,
            input.reminder_minutes,
            idempotencyKey,
          ],
        );
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ApiError(
            409,
            "TIME_SCHEDULE_ALREADY_EXISTS",
            "A schedule already exists for this identity; read it before editing.",
          );
        }
        throw error;
      }
      const inserted = await readSchedule(client, auth, scheduleID, true);
      if (!inserted) throw notFound();
      await appendAudit(
        client,
        { accountId: auth.accountId, actorUserId: auth.userId },
        "time_schedule.created",
        "time_schedule",
        scheduleID,
        {
          external_effect: "none",
          status: inserted.status,
          revision: inserted.revision,
        },
      );
      await recordOperation(client, auth, {
        scheduleID,
        idempotencyKey,
        operation,
        requestHash,
        resultingRevision: inserted.revision,
      });
      return { contract_version: CONTRACT_VERSION, schedule: recordSchedule(inserted) };
    }
    const existing = await readSchedule(client, auth, scheduleID, true);
    if (!existing) throw notFound();
    if (existing.status === "deleted") {
      throw new ApiError(
        409,
        "TIME_SCHEDULE_DELETED",
        "This schedule was deleted and cannot be edited.",
      );
    }
    if (existing.revision !== request.expected_revision) {
      throw new ApiError(
        409,
        "TIME_SCHEDULE_REVISION_CONFLICT",
        "Read the current schedule before changing it.",
      );
    }
    await client.query(
      `UPDATE time_schedules SET
         title=$4,note=$5,kind=$6,person_id=$7,starts_at=$8,ends_at=$9,
         time_zone=$10,all_day=$11,status=$12,reminder_minutes=$13,
         revision=revision+1,last_operation_id=$14,updated_at=clock_timestamp()
       WHERE account_id=$1 AND id=$2 AND created_by_user_id=$3`,
      [
        auth.accountId,
        scheduleID,
        auth.userId,
        input.title,
        input.note,
        input.kind,
        input.person_id,
        input.starts_at,
        input.ends_at,
        input.time_zone,
        input.all_day,
        input.status,
        input.reminder_minutes,
        idempotencyKey,
      ],
    );
    const updated = await readSchedule(client, auth, scheduleID, true);
    if (!updated) throw notFound();
    await appendAudit(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "time_schedule.updated",
      "time_schedule",
      scheduleID,
      {
        external_effect: "none",
        status: updated.status,
        revision: updated.revision,
      },
    );
    await recordOperation(client, auth, {
      scheduleID,
      idempotencyKey,
      operation,
      requestHash,
      resultingRevision: updated.revision,
    });
    return { contract_version: CONTRACT_VERSION, schedule: recordSchedule(updated) };
  });
}

export async function deleteTimeSchedule(
  pool: Pool,
  auth: AuthContext,
  id: string,
  request: TimeScheduleDeleteRequest,
): Promise<TimeScheduleResponse> {
  const scheduleID = id.toLowerCase();
  const idempotencyKey = request.idempotency_key.toLowerCase();
  const requestHash = digestValue({
    operation: "delete",
    id: scheduleID,
    expected_revision: request.expected_revision,
    idempotency_key: idempotencyKey,
  });
  return inTransaction(pool, async (client) => {
    await lockScheduleIdentity(client, auth, scheduleID);
    const replay = await replayOperation(client, auth, {
      scheduleID,
      idempotencyKey,
      operation: "delete",
      requestHash,
    });
    if (replay) return replay;
    const existing = await readSchedule(client, auth, scheduleID, true);
    if (!existing) throw notFound();
    if (existing.status === "deleted") {
      throw new ApiError(
        409,
        "TIME_SCHEDULE_ALREADY_DELETED",
        "This schedule was already deleted.",
      );
    }
    if (existing.revision !== request.expected_revision) {
      throw new ApiError(
        409,
        "TIME_SCHEDULE_REVISION_CONFLICT",
        "Read the current schedule before deleting it.",
      );
    }
    await client.query(
      `UPDATE time_schedules SET
         title=NULL,note=NULL,kind=NULL,person_id=NULL,starts_at=NULL,
         ends_at=NULL,time_zone=NULL,reminder_minutes=NULL,
         status='deleted',deleted_at=clock_timestamp(),
         revision=revision+1,last_operation_id=$4,updated_at=clock_timestamp()
       WHERE account_id=$1 AND id=$2 AND created_by_user_id=$3`,
      [auth.accountId, scheduleID, auth.userId, idempotencyKey],
    );
    const deleted = await readSchedule(client, auth, scheduleID, true);
    if (!deleted) throw notFound();
    await appendAudit(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "time_schedule.deleted",
      "time_schedule",
      scheduleID,
      {
        external_effect: "none",
        disposition: "deleted",
        revision: deleted.revision,
      },
    );
    await recordOperation(client, auth, {
      scheduleID,
      idempotencyKey,
      operation: "delete",
      requestHash,
      resultingRevision: deleted.revision,
    });
    return { contract_version: CONTRACT_VERSION, schedule: recordSchedule(deleted) };
  });
}
