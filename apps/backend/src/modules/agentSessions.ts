import { sweepHarnessSessions } from "./harnessSessions.js";
import { FormatRegistry } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
  AgentSessionMutationRequestSchema,
  AgentSessionDeleteRequestSchema,
  CONTRACT_VERSION,
  type AgentSessionPayload,
  type AgentSessionRecord,
  type AgentSessionMutationRequest,
  type AgentSessionDeleteRequest,
  type AgentSessionListResponse,
} from "@talent-signal/contracts";
import type { Pool } from "pg";
import { inTransaction, type DatabaseClient } from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import { digestValue, sha256 } from "../lib/hash.js";
import type { AuthContext } from "./auth.js";
import {
  inheritedSessionChatSources,
  loadSessionScreenshotContexts,
  screenshotConversationText,
  type AgentSessionChatSource,
} from "./agentSessionSources.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!FormatRegistry.Has("uuid"))
  FormatRegistry.Set("uuid", (value) => UUID.test(value));
if (!FormatRegistry.Has("date-time"))
  FormatRegistry.Set(
    "date-time",
    (value) =>
      /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)),
  );
const DAY = 86_400_000;
function canonicalID(value: string): string {
  return UUID.test(value) ? value.toLowerCase() : value;
}
function sameID(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  return left == null || right == null
    ? left == null && right == null
    : canonicalID(left) === canonicalID(right);
}
function normalizeSessionIdentifiers(
  value: AgentSessionPayload,
): AgentSessionPayload {
  const payload = structuredClone(value);
  for (const key of [
    "id",
    "personID",
    "relationshipContextID",
    "identityResolutionCaseID",
    "originSessionID",
    "originTurnID",
  ] as const) {
    const current = payload[key];
    if (current != null) payload[key] = canonicalID(current);
  }
  if (payload.screenshotTaskIDs)
    payload.screenshotTaskIDs = payload.screenshotTaskIDs.map(canonicalID);
  if (payload.inheritedScreenshotTaskIDs)
    payload.inheritedScreenshotTaskIDs =
      payload.inheritedScreenshotTaskIDs.map(canonicalID);
  for (const turn of payload.turns) {
    turn.id = canonicalID(turn.id);
    for (const key of [
      "taskID",
      "contextManifestID",
      "knowledgeSnapshotID",
    ] as const)
      turn.response[key] = canonicalID(turn.response[key]);
    for (const media of turn.response.media ?? [])
      media.id = canonicalID(media.id);
  }
  for (const receipt of payload.contactReceipts ?? []) {
    for (const key of [
      "id",
      "captureID",
      "resourceID",
      "duplicateOfResourceID",
      "personID",
      "relationshipContextID",
      "resolutionCaseID",
    ] as const) {
      const current = receipt[key];
      if (current != null) receipt[key] = canonicalID(current);
    }
  }
  if (payload.contactProposal) {
    for (const key of ["sessionID", "sourceMessageID"] as const) {
      const current = payload.contactProposal[key];
      if (current != null) payload.contactProposal[key] = canonicalID(current);
    }
  }
  return payload;
}
interface Row {
  id: string;
  created_by_user_id: string;
  revision: number;
  payload: AgentSessionPayload | null;
  created_at: Date;
  updated_at: Date;
  expires_at: Date;
  deleted_at: Date | null;
  composer_draft_hash: string | null;
  composer_draft_started_at: Date | null;
}
const missing = () =>
  new ApiError(
    404,
    "AGENT_SESSION_NOT_FOUND",
    "The Session is not available in this account and user scope.",
  );
function record(row: Row): AgentSessionRecord {
  return {
    session_id: row.id,
    revision: row.revision,
    payload: row.payload ? normalizeSessionIdentifiers(row.payload) : null,
    updated_at: row.updated_at.toISOString(),
    expires_at: row.expires_at.toISOString(),
    deleted_at: row.deleted_at?.toISOString() ?? null,
    display_authority: "stale_unconfirmed",
  };
}
async function rowFor(
  client: DatabaseClient,
  auth: AuthContext,
  id: string,
): Promise<Row | null> {
  const row = (
    await client.query<Row>(
      "SELECT * FROM agent_sessions WHERE account_id=$1 AND id=$2",
      [auth.accountId, id],
    )
  ).rows[0];
  if (row && !sameID(row.created_by_user_id, auth.userId)) throw missing();
  return row ?? null;
}
export async function sweepAgentSessions(
  client: DatabaseClient,
  accountId?: string,
): Promise<void> {
  await sweepHarnessSessions(client, accountId);
  await client.query(
    `UPDATE agent_sessions SET payload=NULL,deleted_at=now(),updated_at=now(),revision=revision+1
    WHERE deleted_at IS NULL AND expires_at<=now() AND ($1::uuid IS NULL OR account_id=$1)`,
    [accountId ?? null],
  );
  await client.query(
    "SELECT retract_agent_session_tasks(account_id,payload) FROM agent_sessions WHERE deleted_at IS NULL AND ($1::uuid IS NULL OR account_id=$1)",
    [accountId ?? null],
  );
  await client.query(
    "SELECT retract_agent_session_chat_sources(account_id) FROM (SELECT DISTINCT account_id FROM agent_session_chat_sources WHERE $1::uuid IS NULL OR account_id=$1) owners",
    [accountId ?? null],
  );
  await client.query(
    "SELECT purge_agent_session_chat_tasks(account_id) FROM (SELECT DISTINCT account_id FROM agent_session_chat_tasks WHERE $1::uuid IS NULL OR account_id=$1) owners",
    [accountId ?? null],
  );
  await client.query(
    `UPDATE agent_sessions SET payload=redact_agent_session_payload(account_id,payload),updated_at=now(),revision=revision+1
    WHERE deleted_at IS NULL AND ($1::uuid IS NULL OR account_id=$1)
    AND payload IS DISTINCT FROM redact_agent_session_payload(account_id,payload)`,
    [accountId ?? null],
  );
}
export async function getAgentSession(
  client: DatabaseClient,
  auth: AuthContext,
  id: string,
): Promise<AgentSessionRecord> {
  await sweepAgentSessions(client, auth.accountId);
  const row = await rowFor(client, auth, id);
  if (!row) throw missing();
  return record(row);
}
export async function listAgentSessions(
  client: DatabaseClient,
  auth: AuthContext,
  after?: string,
  limit = 50,
): Promise<AgentSessionListResponse> {
  await sweepAgentSessions(client, auth.accountId);
  const rows = (
    await client.query<Row>(
      `SELECT * FROM agent_sessions WHERE account_id=$1 AND created_by_user_id=$2
    AND ($3::uuid IS NULL OR id>$3) ORDER BY id LIMIT $4`,
      [
        auth.accountId,
        auth.userId,
        after ?? null,
        Math.min(50, Math.max(1, limit)) + 1,
      ],
    )
  ).rows;
  const effectiveLimit = Math.min(50, Math.max(1, limit));
  const page = rows.slice(0, effectiveLimit);
  const complete = rows.length <= effectiveLimit;
  return {
    contract_version: CONTRACT_VERSION,
    sessions: page.map(record),
    complete,
    next_cursor: complete ? null : page.at(-1)!.id,
  };
}
function invalid(message: string): never {
  throw new ApiError(400, "AGENT_SESSION_INVALID", message);
}
function future(value: string): boolean {
  return Date.parse(value) > Date.now() + 5 * 60_000;
}
interface CanonicalSessionManifest {
  id: string;
  task_id: string;
  subject_id: string;
  assignment_id: string | null;
  knowledge_snapshot_id: string;
}
async function canonicalSessionManifests(
  client: DatabaseClient,
  auth: AuthContext,
  taskIDs: string[],
) {
  const rows = (
    await client.query<CanonicalSessionManifest>(
      "SELECT id,task_id,subject_id,assignment_id,knowledge_snapshot_id FROM context_manifests WHERE account_id=$1 AND task_id::text=ANY($2::text[])",
      [auth.accountId, taskIDs.map(canonicalID)],
    )
  ).rows;
  return new Map(rows.map((row) => [row.task_id, row]));
}
async function lockAgentSessionSources(
  client: DatabaseClient,
  auth: AuthContext,
  payload: AgentSessionPayload,
) {
  const taskIDs = [
    ...new Set(payload.turns.map((turn) => canonicalID(turn.response.taskID))),
  ];
  // Lock source authority before the Session row. An overlapping source transition
  // either commits first and is re-read, or waits and redacts the newly saved row.
  await client.query(
    `SELECT m.id FROM context_manifests m
    JOIN knowledge_snapshots s ON s.account_id=m.account_id AND s.id=m.knowledge_snapshot_id
    JOIN subjects p ON p.account_id=m.account_id AND p.id=m.subject_id
    JOIN assignments a ON a.account_id=m.account_id AND a.id=m.assignment_id
    WHERE m.account_id=$1 AND m.task_id::text=ANY($2::text[]) FOR SHARE OF m,s,p,a NOWAIT`,
    [auth.accountId, taskIDs.map(canonicalID)],
  );
  await client.query(
    `SELECT f.id FROM context_manifests m
    JOIN context_manifest_evidence me ON me.account_id=m.account_id AND me.manifest_id=m.id
    JOIN evidence_fragments f ON f.account_id=me.account_id AND f.id=me.evidence_fragment_id
    JOIN source_resources r ON r.account_id=f.account_id AND r.id=f.resource_id
    JOIN captures c ON c.account_id=r.account_id AND c.id=r.capture_id
    JOIN source_retention_receipts sr ON sr.account_id=c.account_id AND sr.capture_id=c.id
    WHERE m.account_id=$1 AND m.task_id::text=ANY($2::text[]) FOR SHARE OF me,f,r,c,sr NOWAIT`,
    [auth.accountId, taskIDs.map(canonicalID)],
  );
  const screenshotIDs = [
    ...new Set([...taskIDs, ...(payload.screenshotTaskIDs ?? [])]),
  ];
  await client.query(
    `SELECT id FROM screenshot_contact_tasks WHERE account_id=$1 AND created_by_user_id=$2
    AND id::text=ANY($3::text[]) FOR SHARE NOWAIT`,
    [auth.accountId, auth.userId, screenshotIDs],
  );
  await client.query(
    `SELECT c.id FROM screenshot_contact_tasks t
    JOIN captures c ON c.account_id=t.account_id AND c.id=t.capture_id
    JOIN source_retention_receipts sr ON sr.account_id=c.account_id AND sr.capture_id=c.id
    WHERE t.account_id=$1 AND t.created_by_user_id=$2 AND t.id::text=ANY($3::text[]) FOR SHARE OF c,sr NOWAIT`,
    [auth.accountId, auth.userId, screenshotIDs],
  );
}
function prepareComposerDraft(
  auth: AuthContext,
  id: string,
  payload: AgentSessionPayload,
  existing: Row | null,
) {
  if (payload.composerDraft == null) return null;
  const hash = sha256(
    `${auth.accountId.toLowerCase()}:${id.toLowerCase()}:${payload.composerDraft}`,
  );
  const started =
    existing?.composer_draft_hash === hash && existing.composer_draft_started_at
      ? existing.composer_draft_started_at
      : new Date(
          Math.min(
            Date.now(),
            Date.parse(
              payload.composerDraftUpdatedAt ?? new Date().toISOString(),
            ),
          ),
        );
  // The database retains this digest/clock even after expiration, fencing an
  // offline retry that attempts to give unchanged content a fresh deadline.
  payload.composerDraftUpdatedAt = started.toISOString();
  return { hash, startedAt: started };
}
async function validatePayload(
  client: DatabaseClient,
  auth: AuthContext,
  id: string,
  payload: AgentSessionPayload,
  previous: AgentSessionPayload | null,
) {
  if (payload.id.toLowerCase() !== id.toLowerCase())
    invalid("The Session ID must match its route.");
  if (
    future(payload.updatedAt) ||
    (payload.createdAt != null && future(payload.createdAt)) ||
    payload.turns.some((turn) => future(turn.createdAt))
  )
    invalid("Session timestamps cannot be in the future.");
  if (payload.composerDraftUpdatedAt && future(payload.composerDraftUpdatedAt))
    invalid("A composer draft cannot start in the future.");
  const screenshotAdmission = [
    payload.pendingScreenshotIdempotencyKey,
    payload.pendingScreenshotRequestIdentity,
    payload.pendingScreenshotCapturedAt,
  ];
  if (screenshotAdmission.some((value) => value != null)) {
    if (
      screenshotAdmission.some((value) => value == null) ||
      !payload.pendingObjective?.trim()
    ) {
      invalid(
        "Screenshot recovery requires its original key, hash, capture time, and objective.",
      );
    }
    if (future(payload.pendingScreenshotCapturedAt!)) {
      invalid("The original screenshot capture time cannot be in the future.");
    }
    if (
      previous?.pendingScreenshotIdempotencyKey &&
      (previous.pendingScreenshotIdempotencyKey !==
        payload.pendingScreenshotIdempotencyKey ||
        previous.pendingScreenshotRequestIdentity !==
          payload.pendingScreenshotRequestIdentity ||
        Date.parse(previous.pendingScreenshotCapturedAt!) !==
          Date.parse(payload.pendingScreenshotCapturedAt!) ||
        previous.pendingObjective !== payload.pendingObjective)
    ) {
      invalid(
        "An unresolved screenshot admission must keep its original request identity and capture time.",
      );
    }
  }
  if (
    new Set(payload.turns.map((turn) => turn.id.toLowerCase())).size !==
    payload.turns.length
  )
    invalid("Message IDs must be unique within a Session.");
  if (payload.scopeKind === "relationship") {
    if (
      !payload.personID ||
      !payload.relationshipContextID ||
      payload.identityResolutionCaseID
    )
      invalid("A relationship Session needs exactly one person and context.");
    const match = await client.query(
      `SELECT 1 FROM assignments a JOIN subjects s ON s.account_id=a.account_id AND s.id=a.subject_id
      WHERE a.account_id=$1 AND a.id=$2 AND a.subject_id=$3 AND a.status='active' AND s.status='active'`,
      [auth.accountId, payload.relationshipContextID, payload.personID],
    );
    if (!match.rowCount) throw missing();
  } else if (payload.scopeKind === "identity_review") {
    if (
      !payload.identityResolutionCaseID ||
      payload.personID ||
      payload.relationshipContextID
    )
      invalid("An identity-review Session needs exactly one case.");
    if (
      !(
        await client.query(
          "SELECT 1 FROM identity_resolution_cases WHERE account_id=$1 AND id=$2 AND status<>'deleted'",
          [auth.accountId, payload.identityResolutionCaseID],
        )
      ).rowCount
    )
      throw missing();
  } else if (
    payload.personID ||
    payload.relationshipContextID ||
    payload.identityResolutionCaseID
  )
    invalid("An unbound Session cannot claim a relationship scope.");
  if (previous) {
    if (
      previous.createdAt != null &&
      (payload.createdAt == null ||
        Date.parse(previous.createdAt) !== Date.parse(payload.createdAt))
    )
      invalid("The original Session creation time cannot change.");
    if (
      previous.scopeKind === "relationship" &&
      (payload.scopeKind !== previous.scopeKind ||
        !sameID(payload.personID, previous.personID) ||
        !sameID(payload.relationshipContextID, previous.relationshipContextID))
    )
      invalid(
        "An established relationship scope cannot be moved; start a new Session.",
      );
    if (
      !sameID(previous.originSessionID, payload.originSessionID) ||
      !sameID(previous.originTurnID, payload.originTurnID) ||
      previous.originKind !== payload.originKind
    )
      invalid("Fork provenance is immutable.");
    for (let index = 0; index < previous.turns.length; index++) {
      const before = previous.turns[index]!;
      const after = payload.turns[index];
      if (
        !after ||
        !sameID(after.id, before.id) ||
        after.objective !== before.objective ||
        after.createdAt !== before.createdAt ||
        !sameID(after.response.taskID, before.response.taskID) ||
        !sameID(
          after.response.contextManifestID,
          before.response.contextManifestID,
        )
      )
        invalid("Existing message identity and order must be preserved.");
    }
  }
  if (payload.originKind && !payload.originSessionID)
    invalid("Local lineage requires its original Session and message IDs.");
  if (Boolean(payload.originSessionID) !== Boolean(payload.originTurnID))
    invalid("Fork provenance requires its source Session and message.");
  if (payload.originSessionID && !previous) {
    if (payload.originSessionID.toLowerCase() === id.toLowerCase())
      invalid("A Session cannot fork itself.");
    const origin = await rowFor(client, auth, payload.originSessionID);
    if (
      !origin &&
      payload.originKind === "local" &&
      (
        await client.query("SELECT 1 FROM agent_sessions WHERE id=$1 LIMIT 1", [
          payload.originSessionID,
        ])
      ).rowCount
    )
      throw missing();
    if (origin?.deleted_at || (origin && origin.expires_at <= new Date()))
      throw missing();
    if (
      payload.originKind !== "local" &&
      (!origin?.payload ||
        !origin.payload.turns.some((t) => sameID(t.id, payload.originTurnID)))
    )
      throw missing();
  }
  const taskIDs = payload.screenshotTaskIDs ?? [];
  const inheritedIDs = payload.inheritedScreenshotTaskIDs ?? [];
  if (
    new Set(inheritedIDs).size !== inheritedIDs.length ||
    inheritedIDs.some((taskID) => !taskIDs.includes(taskID))
  )
    invalid(
      "Inherited screenshot references must be unique retained task references.",
    );
  if (
    previous?.inheritedScreenshotTaskIDs != null &&
    (payload.inheritedScreenshotTaskIDs == null ||
      previous.inheritedScreenshotTaskIDs.length !== inheritedIDs.length ||
      previous.inheritedScreenshotTaskIDs.some(
        (taskID) => !inheritedIDs.includes(canonicalID(taskID)),
      ))
  )
    invalid(
      "Inherited screenshot references cannot be promoted to live tasks.",
    );
  if (
    previous &&
    previous.inheritedScreenshotTaskIDs == null &&
    payload.inheritedScreenshotTaskIDs != null &&
    (previous.screenshotTaskIDs ?? []).some(
      (taskID) => !inheritedIDs.includes(canonicalID(taskID)),
    )
  )
    invalid(
      "Migrating inherited screenshot references must preserve every previous task reference.",
    );
  if (
    taskIDs.length &&
    (
      await client.query(
        "SELECT id FROM screenshot_contact_tasks WHERE account_id=$1 AND created_by_user_id=$2 AND id=ANY($3::uuid[])",
        [auth.accountId, auth.userId, taskIDs],
      )
    ).rowCount !== new Set(taskIDs).size
  )
    throw missing();
  for (const receipt of payload.contactReceipts ?? []) {
    if (
      !(
        await client.query(
          `SELECT 1 FROM source_resources r JOIN captures c ON c.account_id=r.account_id AND c.id=r.capture_id
      WHERE r.account_id=$1 AND r.id=$2 AND c.id=$3 AND c.created_by_user_id=$4`,
          [auth.accountId, receipt.resourceID, receipt.captureID, auth.userId],
        )
      ).rowCount
    )
      throw missing();
  }
  const manifests = await canonicalSessionManifests(
    client,
    auth,
    payload.turns.map((turn) => canonicalID(turn.response.taskID)),
  );
  const scopedResults = (
    await client.query<{ task_id: string }>(
      `SELECT response_body->>'task_id' AS task_id FROM idempotency_records
    WHERE account_id=$1 AND operation_scope='create_chat_task' AND response_body->>'task_id'=ANY($2::text[])`,
      [
        auth.accountId,
        payload.turns.map((turn) => canonicalID(turn.response.taskID)),
      ],
    )
  ).rows;
  for (const turn of payload.turns) {
    if (
      turn.response.disposition === "screenshot_processing" &&
      !taskIDs.includes(turn.response.taskID)
    )
      invalid(
        "A screenshot response must retain its canonical task reference.",
      );
    const manifest = manifests.get(canonicalID(turn.response.taskID));
    if (manifest) {
      if (
        manifest.id !== turn.response.contextManifestID.toLowerCase() ||
        manifest.subject_id !== payload.personID ||
        manifest.assignment_id !== payload.relationshipContextID ||
        manifest.knowledge_snapshot_id !==
          turn.response.knowledgeSnapshotID.toLowerCase()
      )
        throw missing();
    } else if (
      UUID.test(turn.response.contextManifestID) ||
      scopedResults.some((result) => result.task_id === turn.response.taskID)
    ) {
      throw missing();
    }
  }
  const draft = payload.contactProposal;
  if (draft) {
    if (draft.sessionID && draft.sessionID.toLowerCase() !== id.toLowerCase())
      invalid("A proposal belongs to its Session.");
    if (
      draft.sourceMessageID &&
      !payload.turns.some(
        (turn) =>
          turn.id.toLowerCase() === draft.sourceMessageID!.toLowerCase(),
      )
    )
      invalid("Proposal provenance must name a message in its Session.");
    const source = draft.sourceText ?? draft.draft.sourceNote;
    for (const evidence of [
      ...(draft.fieldEvidence ?? []),
      ...(draft.draft.fieldEvidence ?? []),
    ])
      if (
        !evidence.exactExcerpt.trim() ||
        !source.includes(evidence.exactExcerpt)
      )
        invalid("Proposal field evidence must be an exact source substring.");
    if (
      future(draft.updatedAt) ||
      (draft.expiresAt &&
        Date.parse(draft.expiresAt) > Date.parse(draft.updatedAt) + 7 * DAY)
    )
      invalid("Proposal retention cannot exceed seven days.");
  }
}
export async function mutateAgentSession(
  pool: Pool,
  auth: AuthContext,
  id: string,
  request: AgentSessionMutationRequest | AgentSessionDeleteRequest,
  deleted = false,
): Promise<AgentSessionRecord> {
  if (
    !Value.Check(
      deleted
        ? AgentSessionDeleteRequestSchema
        : AgentSessionMutationRequestSchema,
      request,
    )
  )
    invalid("The Session must match the bounded typed contract.");
  if (Buffer.byteLength(JSON.stringify(request)) > 240 * 1024)
    invalid("A Session cannot exceed 240 KiB.");
  request = {
    ...request,
    idempotency_key: canonicalID(request.idempotency_key),
  };
  if (!deleted)
    request = {
      ...request,
      payload: normalizeSessionIdentifiers(
        (request as AgentSessionMutationRequest).payload,
      ),
    };
  const hash = digestValue({ session_id: id.toLowerCase(), deleted, request });
  const performMutation = () =>
    inTransaction(pool, async (client) => {
      // Fail and release held locks before a reverse-ordered source transition can
      // form a deadlock. The complete database-only operation can safely retry.
      await client.query("SET LOCAL lock_timeout = '100ms'");
      // One writer per owner fences create races and cross-session idempotency-key reuse.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`${auth.accountId}:${auth.userId}:agent-sessions`],
      );
      await sweepAgentSessions(client, auth.accountId);
      const existing = await rowFor(client, auth, id);
      const operation = (
        await client.query<{ request_hash: string; session_id: string }>(
          "SELECT request_hash,session_id FROM agent_session_operations WHERE account_id=$1 AND actor_user_id=$2 AND idempotency_key=$3",
          [auth.accountId, auth.userId, request.idempotency_key],
        )
      ).rows[0];
      if (operation) {
        if (
          operation.request_hash !== hash ||
          operation.session_id !== id.toLowerCase()
        )
          throw new ApiError(
            409,
            "AGENT_SESSION_IDEMPOTENCY_CONFLICT",
            "This operation key already identifies a different Session intent.",
          );
        if (!existing) throw missing();
        return record(existing);
      }
      if (existing?.deleted_at)
        throw new ApiError(
          410,
          "AGENT_SESSION_DELETED",
          "This Session was deleted or expired and cannot be restored.",
          { session: record(existing) },
        );
      if ((existing?.revision ?? 0) !== request.expected_revision)
        throw new ApiError(
          409,
          "AGENT_SESSION_REVISION_CONFLICT",
          "The Session changed on another device. Merge with its current revision.",
          { session: existing ? record(existing) : null },
        );
      let payload: AgentSessionPayload | null = null;
      let composerMetadata: { hash: string; startedAt: Date } | null = null;
      let createdAt = existing?.created_at ?? new Date();
      if (!deleted) {
        payload = structuredClone(
          (request as AgentSessionMutationRequest).payload,
        );
        await lockAgentSessionSources(client, auth, payload);
        await validatePayload(
          client,
          auth,
          id,
          payload,
          existing?.payload ?? null,
        );
        if (!existing)
          createdAt = new Date(
            Math.min(
              Date.now(),
              Date.parse(payload.updatedAt),
              ...(payload.createdAt ? [Date.parse(payload.createdAt)] : []),
              ...payload.turns.map((turn) => Date.parse(turn.createdAt)),
            ),
          );
        if (createdAt.valueOf() + 30 * DAY <= Date.now())
          throw new ApiError(
            410,
            "AGENT_SESSION_EXPIRED",
            "This Session is older than the thirty-day retention period.",
          );
        composerMetadata = prepareComposerDraft(auth, id, payload, existing);
        await client.query("SELECT retract_agent_session_tasks($1,$2::jsonb)", [
          auth.accountId,
          JSON.stringify(payload),
        ]);
        payload = (
          await client.query<{ payload: AgentSessionPayload }>(
            "SELECT redact_agent_session_payload($1,$2::jsonb) AS payload",
            [auth.accountId, JSON.stringify(payload)],
          )
        ).rows[0]!.payload;
      }
      if (payload) {
        const bytes = (
          await client.query<{ bytes: number }>(
            "SELECT octet_length($1::jsonb::text) AS bytes",
            [JSON.stringify(payload)],
          )
        ).rows[0]!.bytes;
        if (bytes > 262144)
          invalid("The stored Session representation cannot exceed 256 KiB.");
      }
      const result = (
        await client.query<Row>(
          `INSERT INTO agent_sessions(account_id,id,created_by_user_id,revision,payload,created_at,expires_at,deleted_at,composer_draft_hash,composer_draft_started_at)
      VALUES ($1,$2,$3,1,$4::jsonb,$5,$6,CASE WHEN $7 THEN now() ELSE NULL END,$9,$10)
      ON CONFLICT (account_id,id) DO UPDATE SET revision=agent_sessions.revision+1,payload=EXCLUDED.payload,updated_at=now(),deleted_at=EXCLUDED.deleted_at,
        composer_draft_hash=COALESCE(EXCLUDED.composer_draft_hash,agent_sessions.composer_draft_hash),
        composer_draft_started_at=COALESCE(EXCLUDED.composer_draft_started_at,agent_sessions.composer_draft_started_at)
      WHERE agent_sessions.created_by_user_id=$3 AND agent_sessions.revision=$8 AND agent_sessions.deleted_at IS NULL
      RETURNING *`,
          [
            auth.accountId,
            id,
            auth.userId,
            payload ? JSON.stringify(payload) : null,
            createdAt,
            new Date(createdAt.valueOf() + 30 * DAY),
            deleted,
            request.expected_revision,
            composerMetadata?.hash ?? null,
            composerMetadata?.startedAt ?? null,
          ],
        )
      ).rows[0];
      if (!result) {
        const current = await rowFor(client, auth, id);
        throw new ApiError(
          current?.deleted_at ? 410 : 409,
          current?.deleted_at
            ? "AGENT_SESSION_DELETED"
            : "AGENT_SESSION_REVISION_CONFLICT",
          "The Session changed while this update was being checked.",
          { session: current ? record(current) : null },
        );
      }
      await client.query(
        `INSERT INTO agent_session_operations(account_id,session_id,actor_user_id,idempotency_key,request_hash,resulting_revision) VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          auth.accountId,
          id,
          auth.userId,
          request.idempotency_key,
          hash,
          result.revision,
        ],
      );
      return record(result);
    });
  for (let attempt = 0; ; attempt++) {
    try {
      return await performMutation();
    } catch (error) {
      const databaseError = error as { code?: string; table?: string };
      if (["55P03", "40P01", "40001"].includes(databaseError.code ?? "")) {
        if (attempt < 4) {
          await new Promise((resolve) =>
            setTimeout(resolve, 25 * 2 ** attempt),
          );
          continue;
        }
        throw new ApiError(
          409,
          "AGENT_SESSION_SOURCE_BUSY",
          "The Session source is changing. Retry the same update after it settles.",
        );
      }
      // Never expose PostgreSQL's rejected-row detail (which can contain private
      // payload text) if a database invariant rejects the final representation.
      if (
        databaseError.code === "23514" &&
        databaseError.table === "agent_sessions"
      )
        invalid("The stored Session does not match its bounded contract.");
      throw error;
    }
  }
}

export async function readAgentSessionConversation(
  client: DatabaseClient,
  auth: AuthContext,
  sessionId: string,
  scope: { personId: string | null; relationshipContextId: string | null },
): Promise<{
  /** Persistence truth, independent of whether old content is still admissible. */
  hasRecordedTurns: boolean;
  messages: Array<{
    message_id: string;
    role: "user" | "assistant";
    text: string;
  }>;
  sources?: AgentSessionChatSource[];
  unavailableScreenshotContext?: boolean;
}> {
  const row = await rowFor(client, auth, sessionId);
  if (!row) return { hasRecordedTurns: false, messages: [] };
  if (row.deleted_at || row.expires_at <= new Date())
    throw new ApiError(
      410,
      "AGENT_SESSION_DELETED",
      "This Session was deleted or expired.",
    );
  const payload = row.payload!;
  if (
    !sameID(payload.personID, scope.personId) ||
    !sameID(payload.relationshipContextID, scope.relationshipContextId)
  )
    throw new ApiError(
      409,
      "AGENT_SESSION_SCOPE_CHANGED",
      "Conversation history belongs to a different relationship scope.",
    );
  const turns = payload.turns.slice(-6);
  const bodies = (
    await client.query<{
      operation_scope: string;
      response_body: {
        task_id: string;
        blocks?: Array<{
          kind: string;
          body: string;
          citation_dependency_ids?: string[];
        }>;
        context_manifest_id?: string;
      };
    }>(
      `SELECT operation_scope,response_body FROM idempotency_records WHERE account_id=$1 AND actor_user_id=$2 AND status='completed'
    AND operation_scope IN ('create_chat_task','create_unscoped_chat_task') AND response_body->>'task_id'=ANY($3::text[])`,
      [
        auth.accountId,
        auth.userId,
        turns.map((t) => canonicalID(t.response.taskID)),
      ],
    )
  ).rows;
  const manifests = await canonicalSessionManifests(
    client,
    auth,
    turns.map((turn) => canonicalID(turn.response.taskID)),
  );
  const screenshotTasks = (
    await client.query<{ id: string }>(
      "SELECT id FROM screenshot_contact_tasks WHERE account_id=$1 AND id::text=ANY($2::text[])",
      [auth.accountId, turns.map((turn) => canonicalID(turn.response.taskID))],
    )
  ).rows;
  const screenshotContexts = await loadSessionScreenshotContexts(
    client,
    auth,
    turns.map((turn) => canonicalID(turn.response.taskID)),
  );
  const sourcesByMessage = new Map<string, AgentSessionChatSource[]>();
  let unavailableScreenshotContext = false;
  const messages: Array<{
    message_id: string;
    role: "user" | "assistant";
    text: string;
  }> = [];
  for (const turn of turns) {
    if (
      turn.response.disposition === "screenshot_processing" ||
      payload.screenshotTaskIDs?.includes(turn.response.taskID) ||
      screenshotTasks.some((task) => sameID(task.id, turn.response.taskID))
    ) {
      const source = screenshotContexts.find((item) =>
        sameID(item.id, turn.response.taskID),
      );
      if (
        !source ||
        (scope.personId != null &&
          source.subject_id != null &&
          (!sameID(source.subject_id, scope.personId) ||
            !sameID(source.assignment_id, scope.relationshipContextId)))
      ) {
        unavailableScreenshotContext = true;
        continue;
      }
      messages.push({
        message_id: turn.id,
        role: "user",
        text: turn.objective.slice(0, 2000),
      });
      if (source.summary || source.question || source.findings?.length) {
        messages.push({
          message_id: source.id,
          role: "assistant",
          text: screenshotConversationText(source, turn.id),
        });
        sourcesByMessage.set(source.id, [
          { taskID: source.id, fingerprint: source.fingerprint },
        ]);
      } else unavailableScreenshotContext = true;
      continue;
    }
    const inheritedSources = await inheritedSessionChatSources(
      client,
      auth,
      canonicalID(turn.response.taskID),
    );
    if (inheritedSources === null) {
      unavailableScreenshotContext = true;
      continue;
    }
    const manifest = manifests.get(canonicalID(turn.response.taskID));
    const canonicalResult = bodies.find((item) =>
      sameID(item.response_body.task_id, turn.response.taskID),
    );
    const scoped =
      manifest || canonicalResult?.operation_scope === "create_chat_task";
    if (scoped) {
      if (
        !manifest ||
        !sameID(manifest.subject_id, scope.personId) ||
        !sameID(manifest.assignment_id, scope.relationshipContextId)
      )
        continue;
      const available = (
        await client.query<{ available: boolean }>(
          "SELECT agent_session_task_available($1,$2,$3,$4) AS available",
          [
            auth.accountId,
            canonicalID(turn.response.taskID),
            scope.personId ? canonicalID(scope.personId) : null,
            scope.relationshipContextId
              ? canonicalID(scope.relationshipContextId)
              : null,
          ],
        )
      ).rows[0]?.available;
      if (!available) continue;
    }
    messages.push({
      message_id: turn.id,
      role: "user",
      text: turn.objective.slice(0, 2000),
    });
    const canonical = canonicalResult?.response_body;
    const text = (canonical?.blocks ?? [])
      .filter((block) =>
        ["answer", "clarification", "question_set"].includes(block.kind),
      )
      .map((block) => block.body)
      .join("\n")
      .slice(0, 2000);
    if (text)
      messages.push({
        message_id: turn.response.taskID,
        role: "assistant",
        text,
      });
    if (text && inheritedSources.length)
      sourcesByMessage.set(turn.response.taskID, inheritedSources);
  }
  let remaining = 12000;
  const boundedMessages = messages
    .reverse()
    .map((message) => {
      const text = message.text.slice(0, remaining);
      remaining -= text.length;
      return { ...message, text };
    })
    .filter((message) => message.text.length > 0)
    .reverse();
  const sources = [
    ...new Map(
      boundedMessages
        .flatMap((message) => sourcesByMessage.get(message.message_id) ?? [])
        .map((source) => [source.taskID, source]),
    ).values(),
  ];
  return {
    hasRecordedTurns: payload.turns.length > 0,
    messages: boundedMessages,
    ...(sources.length ? { sources } : {}),
    ...(unavailableScreenshotContext
      ? { unavailableScreenshotContext: true }
      : {}),
  };
}
