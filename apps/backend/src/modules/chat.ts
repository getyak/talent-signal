import { randomUUID } from "node:crypto";

import type {
  ChatCitation,
  ChatResponseBlock,
  ChatTaskRequest,
  ChatTaskReadback,
  ChatTaskResponse,
  KnowledgeBlock,
} from "@talent-signal/contracts";
import { CONTRACT_VERSION } from "@talent-signal/contracts";
import type { Pool } from "pg";

import { inTransaction } from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import { appendAudit } from "../lib/audit.js";
import {
  claimIdempotency,
  completeIdempotency,
} from "../lib/idempotency.js";
import type { AuthContext } from "./auth.js";
import type {
  RemoteChatAnswerProviding,
  RemoteChatAnswerResult,
  RemoteChatContextBlock,
} from "./chatAnswerProvider.js";
import {
  bindChatMediaToManifest,
  getChatMediaContent,
  listManifestChatMedia,
} from "./chatMedia.js";
import type { ChatMediaStorage } from "./chatMediaStorage.js";
import type { PersonResearchAgentProviding } from "./personResearchAgentClient.js";
import {
  personResearchRunID,
  runPersonResearchChatIngress,
} from "./personResearchChatIngress.js";
import {
  appendTelemetrySpan,
  assertTelemetryContext,
  telemetrySpanId,
} from "./telemetry.js";
import { loadSnapshot } from "./wiki.js";

const CHAT_POLICY_VERSION = "chat-context.v2";

export interface ChatTaskMutationResult {
  body: ChatTaskResponse;
  replayed: boolean;
  status: number;
}

export interface ChatActiveAttention {
  pursuit_id: string;
  action_id: string;
  action_title: string;
  action_status: string;
  due_at: Date | null;
  owner_display_name: string;
  pursuit_title: string;
  gap_title: string | null;
  gap_close_condition: string | null;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function compactUtcTimestamp(value: Date): string {
  return value
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, " UTC");
}

function citations(blocks: KnowledgeBlock[]): string[] {
  return unique(
    blocks.flatMap((item) =>
      item.dependencies
        .filter(
          (itemDependency) =>
            itemDependency.type === "evidence_fragment",
        )
        .map((itemDependency) => itemDependency.id),
    ),
  );
}

function remoteContextBlock(block: KnowledgeBlock): RemoteChatContextBlock {
  return {
    block_id: block.id,
    block_key: block.block_key,
    type: block.type,
    status: block.status,
    headline: block.content.headline.slice(0, 1_000),
    summary: (block.content.summary ?? "").slice(0, 1_500),
    items: block.content.items.slice(0, 8).map((item) => item.slice(0, 500)),
    evidence_fragment_ids: citations([block]),
  };
}

function remoteAnswerBlock(answer: RemoteChatAnswerResult): ChatResponseBlock {
  return {
    id: randomUUID(),
    kind: answer.kind,
    title: `Zhipu AI · ${answer.title}`.slice(0, 240),
    body: answer.body,
    status:
      answer.kind === "question_set"
        ? "proposed"
        : answer.kind === "clarification"
          ? "needs_review"
          : "informational",
    citation_dependency_ids: answer.citation_ids,
    requires_user_decision: answer.kind === "clarification",
  };
}

function remoteFailureBlock(
  title: string,
  body: string,
): ChatResponseBlock {
  return {
    id: randomUUID(),
    kind: "failure_recovery",
    title,
    body,
    status: "failed",
    citation_dependency_ids: [],
    requires_user_decision: false,
  };
}

function insertAfterPersonBrief(
  blocks: ChatResponseBlock[],
  block: ChatResponseBlock,
): ChatResponseBlock[] {
  if (blocks.length >= 20) return blocks;
  const personBriefIndex = blocks.findIndex((item) => item.kind === "person_brief");
  const insertionIndex = personBriefIndex < 0 ? 0 : personBriefIndex + 1;
  return [
    ...blocks.slice(0, insertionIndex),
    block,
    ...blocks.slice(insertionIndex),
  ];
}

export interface ChatManifestRow {
  id: string;
  task_id: string;
  subject_id: string;
  assignment_id: string;
  knowledge_snapshot_id: string;
  manifest_status: ChatTaskReadback["manifest_status"];
  snapshot_status: ChatTaskReadback["snapshot_status"];
  authorization_scope: string;
  created_at: Date;
}

export interface ChatCitationRow {
  id: string;
  person_id: string | null;
  relationship_context_id: string | null;
  inclusion_reason: string;
  resource_id: string;
  source_name: string;
  observed_at: Date;
  source_timezone: string | null;
  capture_version: number;
  fragment_kind: ChatCitation["fragment_kind"];
  sequence: number;
  exact_excerpt: string | null;
  locator: ChatCitation["locator"];
  attributed_actor: ChatCitation["attribution"]["actor_kind"];
  attribution_status: ChatCitation["attribution"]["status"];
  review_status: ChatCitation["review_status"];
  parser_name: string;
  parser_version: string;
  content_hash: string;
  fragment_created_at: Date;
  last_review_id: string | null;
  last_reviewed_at: Date | null;
  last_reviewed_by: string | null;
  fragment_status: "active" | "purged" | "deleted";
  resource_status: string;
  capture_status: "active" | "deleted";
  source_access_state: "available" | "purged" | "deleted" | null;
  authorization_state: "authorized" | "revoked" | "expired" | null;
  authorization_expires_at: Date | null;
}

export function citationAvailability(
  manifest: ChatManifestRow,
  citation: ChatCitationRow,
): Pick<ChatCitation, "availability" | "unavailable_reason"> {
  if (
    manifest.manifest_status !== "active" ||
    manifest.snapshot_status !== "published"
  ) {
    return {
      availability: "superseded",
      unavailable_reason:
        "The Chat context has been superseded; compile a fresh relationship view before relying on this source.",
    };
  }
  if (
    citation.person_id !== manifest.subject_id ||
    citation.relationship_context_id !== manifest.assignment_id
  ) {
    return {
      availability: "unauthorized",
      unavailable_reason:
        "The cited source does not belong to this person and relationship context.",
    };
  }
  if (
    citation.review_status !== "reviewed" ||
    citation.attribution_status !== "confirmed" ||
    citation.exact_excerpt === null ||
    citation.exact_excerpt.trim().length === 0
  ) {
    return {
      availability: "superseded",
      unavailable_reason:
        "The cited source is not currently reviewed, attribution-confirmed, and inspectable.",
    };
  }
  if (
    citation.fragment_status !== "active" ||
    citation.resource_status === "deleted" ||
    citation.capture_status !== "active" ||
    citation.source_access_state === "deleted"
  ) {
    return {
      availability: "deleted",
      unavailable_reason: "The cited source is no longer available.",
    };
  }
  const authorizationExpired =
    citation.authorization_expires_at !== null &&
    citation.authorization_expires_at <= new Date();
  if (
    citation.source_access_state === null ||
    citation.authorization_state !== "authorized" ||
    authorizationExpired
  ) {
    return {
      availability: "unauthorized",
      unavailable_reason:
        "The cited source is outside its current access or authorization scope.",
    };
  }
  return { availability: "available", unavailable_reason: null };
}

export async function getChatTaskReadback(
  pool: Pool,
  auth: AuthContext,
  taskId: string,
): Promise<ChatTaskReadback> {
  const manifestResult = await pool.query<ChatManifestRow>(
    `SELECT
       manifests.id,
       manifests.task_id,
       manifests.subject_id,
       manifests.assignment_id,
       manifests.knowledge_snapshot_id,
       manifests.status AS manifest_status,
       snapshots.status AS snapshot_status,
       manifests.authorization_scope,
       manifests.created_at
     FROM context_manifests manifests
     JOIN knowledge_snapshots snapshots
       ON snapshots.account_id = manifests.account_id
      AND snapshots.id = manifests.knowledge_snapshot_id
     WHERE manifests.account_id = $1
       AND manifests.task_id = $2`,
    [auth.accountId, taskId],
  );
  const manifest = manifestResult.rows[0];
  if (!manifest || !manifest.assignment_id) {
    throw new ApiError(
      404,
      "CHAT_TASK_READBACK_NOT_FOUND",
      "The account-scoped Chat task context was not found.",
    );
  }

  const citationResult = await pool.query<ChatCitationRow>(
    `SELECT
       fragments.id,
       captures.subject_id AS person_id,
       captures.assignment_id AS relationship_context_id,
       manifest_evidence.inclusion_reason,
       resources.id AS resource_id,
       resources.display_name AS source_name,
       resources.observed_at,
       resources.source_timezone,
       captures.version AS capture_version,
       fragments.fragment_kind,
       fragments.sequence,
       fragments.text_content AS exact_excerpt,
       fragments.locator,
       fragments.attributed_actor,
       fragments.attribution_status,
       fragments.review_status,
       fragments.parser_name,
       fragments.parser_version,
       fragments.content_hash,
       fragments.created_at AS fragment_created_at,
       latest_review.review_id AS last_review_id,
       latest_review.decided_at AS last_reviewed_at,
       latest_review.display_name AS last_reviewed_by,
       fragments.status AS fragment_status,
       resources.processing_state AS resource_status,
       captures.status AS capture_status,
       retention.source_access_state,
       CASE
         WHEN retention.authorization_state = 'authorized'
          AND retention.authorization_expires_at IS NOT NULL
          AND retention.authorization_expires_at <= now()
         THEN 'expired'
         ELSE retention.authorization_state
       END AS authorization_state,
       retention.authorization_expires_at
     FROM context_manifest_evidence manifest_evidence
     JOIN evidence_fragments fragments
       ON fragments.account_id = manifest_evidence.account_id
      AND fragments.id = manifest_evidence.evidence_fragment_id
     JOIN source_resources resources
       ON resources.account_id = fragments.account_id
      AND resources.id = fragments.resource_id
     JOIN captures
       ON captures.account_id = resources.account_id
      AND captures.id = resources.capture_id
     LEFT JOIN source_retention_receipts retention
       ON retention.account_id = captures.account_id
      AND retention.capture_id = captures.id
     LEFT JOIN LATERAL (
       SELECT reviews.id AS review_id, reviews.decided_at, users.display_name
       FROM evidence_fragment_reviews reviews
       JOIN users
         ON users.account_id = reviews.account_id
        AND users.id = reviews.decided_by_user_id
       WHERE reviews.account_id = fragments.account_id
         AND reviews.fragment_id = fragments.id
       ORDER BY reviews.review_revision DESC
       LIMIT 1
     ) latest_review ON true
     WHERE manifest_evidence.account_id = $1
       AND manifest_evidence.manifest_id = $2
     ORDER BY resources.observed_at DESC, fragments.sequence, fragments.id`,
    [auth.accountId, manifest.id],
  );

  const readbackCitations: ChatCitation[] = citationResult.rows.map(
    (citation) => {
      const availability = citationAvailability(manifest, citation);
      const canExposeSource = availability.availability === "available";
      return {
        id: citation.id,
        dependency_type: "evidence_fragment",
        person_id: citation.person_id,
        relationship_context_id: citation.relationship_context_id,
        inclusion_reason: citation.inclusion_reason,
        authorization_scope:
          citation.person_id && citation.relationship_context_id
            ? `person:${citation.person_id}:relationship-context:${citation.relationship_context_id}`
            : "unresolved-source-scope",
        ...availability,
        resource_id: citation.resource_id,
        source_name: citation.source_name,
        observed_at: citation.observed_at.toISOString(),
        source_timezone: citation.source_timezone,
        capture_version: citation.capture_version,
        fragment_kind: citation.fragment_kind,
        sequence: citation.sequence,
        exact_excerpt: canExposeSource ? citation.exact_excerpt : null,
        locator: canExposeSource ? citation.locator : null,
        attribution: {
          actor_kind: citation.attributed_actor,
          status: citation.attribution_status,
        },
        review_status: citation.review_status,
        parser: {
          name: citation.parser_name,
          version: citation.parser_version,
        },
        content_hash: citation.content_hash,
        fragment_created_at: citation.fragment_created_at.toISOString(),
        last_review_id: citation.last_review_id,
        last_reviewed_at:
          citation.last_reviewed_at?.toISOString() ?? null,
        last_reviewed_by: citation.last_reviewed_by,
      };
    },
  );
  if (
    readbackCitations.some(
      (citation) => citation.availability !== "available",
    )
  ) {
    throw new ApiError(
      409,
      "CHAT_CITED_EVIDENCE_UNAVAILABLE",
      "The Chat readback stopped because one governed source is no longer reviewed, scope-bound, inspectable, or authorized.",
    );
  }

  return {
    contract_version: CONTRACT_VERSION,
    account_id: auth.accountId,
    task_id: manifest.task_id,
    context_manifest_id: manifest.id,
    knowledge_snapshot_id: manifest.knowledge_snapshot_id,
    person_id: manifest.subject_id,
    relationship_context_id: manifest.assignment_id,
    manifest_status: manifest.manifest_status,
    snapshot_status: manifest.snapshot_status,
    authorization_scope: manifest.authorization_scope,
    citations: readbackCitations,
    media: await listManifestChatMedia(pool, auth.accountId, manifest.id),
    created_at: manifest.created_at.toISOString(),
  };
}

function boundedBody(lines: string[]): string {
  const body = lines.filter(Boolean).join("\n");
  return body.length <= 7_800
    ? body
    : `${body.slice(0, 7_799).trimEnd()}…`;
}

const RELATIVE_TIME_PATTERN =
  /\b(today|tomorrow|yesterday|tonight|next|this|last)\s+(morning|afternoon|evening|night|week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)?\b/i;

function hasUnresolvedRelativeTime(block: KnowledgeBlock): boolean {
  return block.block_key.startsWith("fact.") &&
    block.status === "confirmed" &&
    RELATIVE_TIME_PATTERN.test(block.content.headline);
}

function briefBody(blocks: KnowledgeBlock[]): string {
  return boundedBody(
    blocks
      .filter(
        (item) =>
          item.block_key.startsWith("fact.") &&
          item.status === "confirmed" &&
          !hasUnresolvedRelativeTime(item),
      )
      .map((item) => item.content.headline),
  );
}

export function responseBlocks(
  blocks: KnowledgeBlock[],
  activeAttention: ChatActiveAttention | null = null,
): ChatResponseBlock[] {
  const identity = blocks.find((item) => item.type === "identity_context");
  if (!identity) {
    throw new ApiError(
      409,
      "CHAT_CONTEXT_IDENTITY_MISSING",
      "The active Wiki does not contain one identity-context block.",
    );
  }
  const contextBlocks = blocks.filter(
    (item) =>
      !["identity_context", "next_action", "no_action"].includes(item.type),
  );
  const currentFactBlocks = contextBlocks.filter(
    (item) =>
      item.block_key.startsWith("fact.") &&
      item.status === "confirmed" &&
      !hasUnresolvedRelativeTime(item),
  );
  const relativeTimeFacts = contextBlocks.filter(hasUnresolvedRelativeTime);
  const answer: ChatResponseBlock[] = [
    {
      id: randomUUID(),
      kind: "person_brief",
      title: identity.content.headline,
      body:
        briefBody(blocks) ||
        "No additional reviewed relationship state is ready for this task.",
      // This block contains only confirmed, non-relative facts. Review state
      // for other context belongs on its own visible block; otherwise one
      // unrelated proposal makes a confirmed claim look uncertain.
      status: "confirmed",
      citation_dependency_ids: citations([
        identity,
        ...currentFactBlocks,
      ]),
      requires_user_decision: false,
    },
  ];

  const conflicts = blocks.filter((item) => item.type === "conflict");
  if (conflicts.length > 0) {
    answer.push({
      id: randomUUID(),
      kind: "conflict_review",
      title: "Resolve before relying on this point",
      body: conflicts.map((item) => item.content.headline).join("\n"),
      status: "needs_review",
      citation_dependency_ids: citations(conflicts),
      requires_user_decision: true,
    });
  }

  const factReview = contextBlocks.filter(
    (item) =>
      (
        item.type === "open_question" &&
        !item.block_key.startsWith("research.stale.")
      ) ||
      item.block_key.startsWith("resource.resume.") ||
      item.block_key.startsWith("resource.document.") ||
      item.block_key.startsWith("resource.contact-record."),
  );
  if (factReview.length > 0) {
    answer.push({
      id: randomUUID(),
      kind: "fact_review",
      title: "Review proposed facts before relying on them",
      body: boundedBody(
        factReview.map((item) => item.content.headline),
      ),
      status: "needs_review",
      citation_dependency_ids: citations(factReview),
      requires_user_decision: true,
    });
  }

  if (relativeTimeFacts.length > 0) {
    answer.push({
      id: randomUUID(),
      kind: "fact_review",
      title: "Clarify relative timing before relying on it",
      body: boundedBody([
        ...relativeTimeFacts.map((item) => item.content.headline),
        "Confirm one explicit calendar date and timezone.",
      ]),
      status: "needs_review",
      citation_dependency_ids: citations(relativeTimeFacts),
      requires_user_decision: true,
    });
  }

  const researchSeeds = contextBlocks.filter((item) =>
    item.block_key.startsWith("resource.public-url."),
  );
  const sourcedResearch = contextBlocks.filter(
    (item) => item.type === "sourced_research",
  );
  const staleResearch = contextBlocks.filter((item) =>
    item.block_key.startsWith("research.stale."),
  );
  if (sourcedResearch.length > 0) {
    answer.push({
      id: randomUUID(),
      kind: "research_status",
      title: "Public research is ready for evidence review",
      body: boundedBody(
        sourcedResearch.map((item) => item.content.headline),
      ),
      status: "needs_review",
      citation_dependency_ids: citations(sourcedResearch),
      requires_user_decision: true,
    });
  } else if (staleResearch.length > 0) {
    answer.push({
      id: randomUUID(),
      kind: "research_status",
      title: "Public research is stale and needs refresh",
      body: boundedBody(
        staleResearch.map((item) => item.content.headline),
      ),
      status: "needs_review",
      citation_dependency_ids: citations(staleResearch),
      requires_user_decision: true,
    });
  } else if (researchSeeds.length > 0) {
    answer.push({
      id: randomUUID(),
      kind: "research_status",
      title: "Research seed saved; no research has run",
      body: boundedBody(
        researchSeeds.map((item) => item.content.headline),
      ),
      status: "proposed",
      citation_dependency_ids: citations(researchSeeds),
      requires_user_decision: true,
    });
  }

  const sourceReceipts = contextBlocks.filter(
    (item) =>
      item.block_key.startsWith("resource.personal-note.") ||
      item.block_key.startsWith("resource.conversation."),
  );
  const alreadyAttachedCitationIDs = new Set(
    answer.flatMap((item) => item.citation_dependency_ids),
  );
  const unattachedSourceReceipts = sourceReceipts.filter((item) => {
    const dependencyIDs = citations([item]);
    return dependencyIDs.length === 0 || dependencyIDs.some(
      (id) => !alreadyAttachedCitationIDs.has(id),
    );
  });
  if (unattachedSourceReceipts.length > 0) {
    answer.push({
      id: randomUUID(),
      kind: "source_receipt",
      title: "Governed source material is attached",
      body: boundedBody(
        unattachedSourceReceipts.map((item) => item.content.headline),
      ),
      status: unattachedSourceReceipts.some((item) => item.status === "proposed")
        ? "needs_review"
        : "confirmed",
      citation_dependency_ids: citations(unattachedSourceReceipts),
      requires_user_decision: unattachedSourceReceipts.some(
        (item) => item.status === "proposed",
      ),
    });
  }

  const nextAction = blocks.find((item) => item.type === "next_action");
  const noAction = blocks.find((item) => item.type === "no_action");
  if (activeAttention) {
    answer.push({
      id: randomUUID(),
      kind: "active_action",
      title: "Existing owned next move",
      body: boundedBody([
        activeAttention.action_title,
        `Owner: ${activeAttention.owner_display_name}`,
        activeAttention.due_at
          ? `Due: ${compactUtcTimestamp(activeAttention.due_at)}`
          : "Due: not set",
        activeAttention.gap_title
          ? `Open gap: ${activeAttention.gap_title}`
          : "",
        activeAttention.gap_close_condition
          ? `Close when: ${activeAttention.gap_close_condition}`
          : "",
        "Existing work only · no new action or external effect.",
      ]),
      status: "confirmed",
      citation_dependency_ids: [],
      requires_user_decision: false,
      target_ref: {
        type: "pursuit_action",
        pursuit_id: activeAttention.pursuit_id,
        action_id: activeAttention.action_id,
      },
    });
  } else if (nextAction) {
    answer.push({
      id: randomUUID(),
      kind: "action_proposal",
      title: "Proposed next move",
      body: [
        nextAction.content.headline,
        nextAction.content.summary,
        ...nextAction.content.items,
      ]
        .filter(Boolean)
        .join("\n"),
      status: "proposed",
      citation_dependency_ids: citations([nextAction]),
      requires_user_decision: true,
    });
  } else if (noAction) {
    answer.push({
      id: randomUUID(),
      kind: "no_action",
      title: "No action",
      body: [
        noAction.content.headline,
        noAction.content.summary,
        ...noAction.content.items,
      ]
        .filter(Boolean)
        .join("\n"),
      status: "confirmed",
      citation_dependency_ids: citations([noAction]),
      requires_user_decision: false,
    });
  } else {
    throw new ApiError(
      409,
      "CHAT_ATTENTION_DECISION_MISSING",
      "The active Wiki has neither one next action nor one no-action result.",
    );
  }
  return answer;
}

async function loadActiveAttention(
  client: Pick<Pool, "query">,
  accountId: string,
  personId: string,
  relationshipContextId: string,
): Promise<ChatActiveAttention | null> {
  const result = await client.query<ChatActiveAttention>(
    `SELECT
       pursuits.id AS pursuit_id,
       actions.id AS action_id,
       actions.title AS action_title,
       actions.status AS action_status,
       actions.due_at,
       owners.display_name AS owner_display_name,
       pursuits.title AS pursuit_title,
       open_gap.title AS gap_title,
       open_gap.close_condition AS gap_close_condition
     FROM pursuit_roles roles
     JOIN pursuits
       ON pursuits.account_id = roles.account_id
      AND pursuits.id = roles.pursuit_id
     JOIN pursuit_actions actions
       ON actions.account_id = pursuits.account_id
      AND actions.pursuit_id = pursuits.id
     JOIN users owners
       ON owners.account_id = actions.account_id
      AND owners.id = actions.owner_user_id
     LEFT JOIN LATERAL (
       SELECT gaps.title, gaps.close_condition
       FROM pursuit_gaps gaps
       WHERE gaps.account_id = pursuits.account_id
         AND gaps.pursuit_id = pursuits.id
         AND gaps.status = 'open'
       ORDER BY gaps.display_order, gaps.created_at, gaps.id
       LIMIT 1
     ) open_gap ON true
     WHERE roles.account_id = $1
       AND roles.person_id = $2
       AND roles.status <> 'removed'
       AND pursuits.status IN ('draft', 'active', 'paused')
       AND actions.status NOT IN ('completed', 'cancelled')
       AND EXISTS (
         SELECT 1
         FROM pursuit_role_evidence role_evidence
         JOIN evidence_fragments fragments
           ON fragments.account_id = role_evidence.account_id
          AND fragments.id = role_evidence.evidence_fragment_id
         JOIN source_resources resources
           ON resources.account_id = fragments.account_id
          AND resources.id = fragments.resource_id
         JOIN captures
           ON captures.account_id = resources.account_id
          AND captures.id = resources.capture_id
         WHERE role_evidence.account_id = roles.account_id
           AND role_evidence.role_id = roles.id
           AND captures.subject_id = $2
           AND captures.assignment_id = $3
       )
     ORDER BY actions.due_at ASC NULLS LAST, actions.created_at, actions.id
     LIMIT 1`,
    [accountId, personId, relationshipContextId],
  );
  return result.rows[0] ?? null;
}

export async function createChatTask(
  pool: Pool,
  auth: AuthContext,
  request: ChatTaskRequest,
  remoteChatProvider: RemoteChatAnswerProviding | null = null,
  chatMediaStorage: ChatMediaStorage | null = null,
  personResearchProvider: PersonResearchAgentProviding | null = null,
): Promise<ChatTaskMutationResult> {
  const chatStartedAt = new Date().toISOString();
  return inTransaction(pool, async (client) => {
    const idempotency = await claimIdempotency(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "create_chat_task",
      request.idempotency_key,
      request,
    );
    if (idempotency.replay) {
      const replay = idempotency.replay.body as ChatTaskResponse;
      if (
        !replay ||
        typeof replay !== "object" ||
        !("context_manifest_id" in replay)
      ) {
        throw new ApiError(
          409,
          "IDEMPOTENCY_STATE_UNAVAILABLE",
          "The prior Chat task could not be resolved.",
        );
      }
      return {
        body: replay,
        replayed: true,
        status: idempotency.replay.status,
      };
    }
    if (request.telemetry) {
      await assertTelemetryContext(client, auth, request.telemetry);
    }

    const snapshot = await loadSnapshot(
      client,
      auth.accountId,
      request.person_id,
      request.relationship_context_id,
    );
    if (snapshot.status !== "published" || snapshot.quality.verdict !== "gold") {
      throw new ApiError(
        409,
        "CHAT_WIKI_NOT_READY",
        "Chat can only assemble task context from an active gold Wiki snapshot.",
      );
    }
    const prioritizedBlocks = [
      ...snapshot.blocks.filter(
        (item) => item.type === "identity_context",
      ),
      ...snapshot.blocks.filter(
        (item) =>
          item.type === "next_action" ||
          item.type === "no_action" ||
          item.type === "current_dependency",
      ),
      ...snapshot.blocks.filter((item) => item.type === "conflict"),
      ...snapshot.blocks,
    ];
    const selectedBlocks = prioritizedBlocks
      .filter(
        (item, index, items) =>
          items.findIndex((candidate) => candidate.id === item.id) ===
          index,
      )
      .slice(0, 20);
    const taskId = randomUUID();
    const manifestId = randomUUID();
    const authorizationScope =
      `person:${request.person_id}:relationship-context:${request.relationship_context_id}`;
    const evidenceFragmentIds = unique(
      selectedBlocks.flatMap((item) =>
        item.dependencies
          .filter(
            (itemDependency) =>
              itemDependency.type === "evidence_fragment",
          )
          .map((itemDependency) => itemDependency.id),
      ),
    );
    const createdAt = new Date();
    const mediaIds = request.media_ids ?? [];

    await client.query(
      `INSERT INTO context_manifests(
         id, account_id, task_id, subject_id, assignment_id,
         knowledge_snapshot_id, objective, authorization_scope, policy_version
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        manifestId,
        auth.accountId,
        taskId,
        request.person_id,
        request.relationship_context_id,
        snapshot.id,
        request.objective,
        authorizationScope,
        CHAT_POLICY_VERSION,
      ],
    );
    for (const item of selectedBlocks) {
      await client.query(
        `INSERT INTO context_manifest_blocks(
           account_id, manifest_id, block_id, inclusion_reason
         )
         VALUES ($1, $2, $3, $4)`,
        [
          auth.accountId,
          manifestId,
          item.id,
          `Included ${item.type} for the recruiter-stated task objective.`,
        ],
      );
    }
    for (const evidenceFragmentId of evidenceFragmentIds) {
      await client.query(
        `INSERT INTO context_manifest_evidence(
           account_id, manifest_id, evidence_fragment_id, inclusion_reason
         )
         VALUES ($1, $2, $3, $4)`,
        [
          auth.accountId,
          manifestId,
          evidenceFragmentId,
          "Included because a selected Wiki block depends on this governed fragment; any pending review remains visible in the block status.",
        ],
      );
    }
    const media = await bindChatMediaToManifest(
      client,
      auth.accountId,
      request.person_id,
      request.relationship_context_id,
      manifestId,
      mediaIds,
    );

    const activeAttention = await loadActiveAttention(
      client,
      auth.accountId,
      request.person_id,
      request.relationship_context_id,
    );
    let blocks = responseBlocks(selectedBlocks, activeAttention);
    let remoteChatStatus:
      | "disabled"
      | "completed"
      | "fallback"
      | "media_not_sent" = "disabled";
    let remoteChatResult: RemoteChatAnswerResult | null = null;
    let remoteStartedAt: string | null = null;
    let remoteEndedAt: string | null = null;
    let remoteFailed = false;
    if (
      remoteChatProvider &&
      (mediaIds.length === 0 ||
        (remoteChatProvider.supportsImageInput && chatMediaStorage))
    ) {
      try {
        remoteStartedAt = new Date().toISOString();
        const images = mediaIds.length === 0 || !chatMediaStorage
          ? []
          : await Promise.all(media.map(async (item) => {
              const stored = await getChatMediaContent(
                client,
                auth,
                chatMediaStorage,
                item.id,
              );
              return {
                file_name: item.file_name,
                media_type: item.media_type,
                data: stored.body,
              };
            }));
        remoteChatResult = await remoteChatProvider.answer({
          objective: request.objective,
          context_blocks: selectedBlocks.map(remoteContextBlock),
          allowed_citation_ids: evidenceFragmentIds,
          images,
        });
        remoteEndedAt = new Date().toISOString();
        const nextBlocks = insertAfterPersonBrief(
          blocks,
          remoteAnswerBlock(remoteChatResult),
        );
        remoteChatStatus = nextBlocks === blocks ? "fallback" : "completed";
        blocks = nextBlocks;
      } catch {
        remoteEndedAt = new Date().toISOString();
        remoteFailed = true;
        remoteChatStatus = "fallback";
        blocks = insertAfterPersonBrief(
          blocks,
          remoteFailureBlock(
            "AI answer unavailable",
            "Zhipu AI did not complete this turn. The governed relationship summary remains available below; ask again to retry. No action was taken.",
          ),
        );
      }
    } else if (remoteChatProvider && mediaIds.length > 0) {
      remoteChatStatus = "media_not_sent";
      blocks = insertAfterPersonBrief(
        blocks,
        remoteFailureBlock(
          "Attachments were not sent to remote AI",
          "This turn uses the governed relationship summary only. Talent Signal did not send the attached images to Zhipu AI, and no action was taken.",
        ),
      );
    }
    const personResearch = await runPersonResearchChatIngress({
      provider: personResearchProvider,
      media,
      loadMedia: async (mediaID) => {
        if (!chatMediaStorage) {
          throw new Error("Chat media storage is unavailable.");
        }
        return (await getChatMediaContent(
          client,
          auth,
          chatMediaStorage,
          mediaID,
        )).body;
      },
      runID: personResearchRunID(auth.accountId, request.idempotency_key),
      objective: request.objective,
    });
    const personResearchStatus = personResearch.status;
    if (personResearch.block) {
      blocks = insertAfterPersonBrief(blocks, personResearch.block);
    }
    const action = blocks.find((item) => item.kind === "action_proposal");
    const noAction = blocks.find((item) => item.kind === "no_action");
    const clarification = blocks.find((item) => item.kind === "clarification");
    const response: ChatTaskResponse = {
      contract_version: CONTRACT_VERSION,
      task_id: taskId,
      context_manifest_id: manifestId,
      knowledge_snapshot_id: snapshot.id,
      disposition: action
        ? "propose_action"
        : clarification
          ? "clarify"
        : noAction
          ? "no_action"
          : "answer",
      blocks,
      media,
      ...(request.telemetry ? { telemetry: request.telemetry } : {}),
      created_at: createdAt.toISOString(),
    };
    if (request.telemetry) {
      const taskSpanID = telemetrySpanId(
        request.telemetry.trace_id,
        `chat-task:${taskId}`,
      );
      await appendTelemetrySpan(client, auth, request.telemetry, {
        key: `chat-task:${taskId}`,
        name: "chat.task assemble_relationship_brief",
        kind: "internal",
        status: "ok",
        startedAt: chatStartedAt,
        endedAt: new Date().toISOString(),
        attributes: {
          "ts.chat.task_id": taskId,
          "ts.chat.manifest_id": manifestId,
          "ts.chat.disposition": response.disposition,
          "ts.chat.evidence_count": evidenceFragmentIds.length,
          "ts.chat.media_count": media.length,
          "ts.chat.remote_status": remoteChatStatus,
          "ts.chat.person_research_status": personResearchStatus,
        },
      });
      if (remoteStartedAt && remoteEndedAt && remoteChatProvider) {
        await appendTelemetrySpan(client, auth, request.telemetry, {
          key: `chat-model:${taskId}`,
          parentSpanID: taskSpanID,
          name: `model.chat ${remoteChatResult?.model ?? "configured-provider"}`,
          kind: "client",
          status: remoteFailed ? "error" : "ok",
          startedAt: remoteStartedAt,
          endedAt: remoteEndedAt,
          attributes: {
            "gen_ai.provider.name":
              remoteChatResult?.provider_id ?? "configured-provider",
            "gen_ai.request.model": remoteChatResult?.model ?? "unknown",
            "gen_ai.usage.input_tokens": remoteChatResult?.input_tokens ?? 0,
            "gen_ai.usage.output_tokens": remoteChatResult?.output_tokens ?? 0,
            "ts.reasoning.capture_status": "unavailable",
            ...(remoteFailed ? { "error.type": "provider_failure" } : {}),
          },
        });
      }
    }
    await appendAudit(
      client,
      { accountId: auth.accountId, actorUserId: auth.userId },
      "chat_task.assembled",
      "context_manifest",
      manifestId,
      {
        task_id: taskId,
        person_id: request.person_id,
        relationship_context_id: request.relationship_context_id,
        knowledge_snapshot_id: snapshot.id,
        included_block_count: selectedBlocks.length,
        included_evidence_count: evidenceFragmentIds.length,
        included_media_count: media.length,
        disposition: response.disposition,
        remote_chat_status: remoteChatStatus,
        remote_chat_provider_id: remoteChatResult?.provider_id ?? null,
        remote_chat_model: remoteChatResult?.model ?? null,
        remote_chat_provider_request_id:
          remoteChatResult?.provider_request_id ?? null,
        remote_chat_input_tokens: remoteChatResult?.input_tokens ?? 0,
        remote_chat_output_tokens: remoteChatResult?.output_tokens ?? 0,
      },
    );
    await completeIdempotency(client, idempotency, 201, response);
    return {
      body: response,
      replayed: false,
      status: 201,
    };
  });
}
