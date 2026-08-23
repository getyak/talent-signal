import { randomUUID } from "node:crypto";

import type {
  ChatResponseBlock,
  ChatTaskRequest,
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
import { loadSnapshot } from "./wiki.js";

const CHAT_POLICY_VERSION = "chat-context.v1";

export interface ChatTaskMutationResult {
  body: ChatTaskResponse;
  replayed: boolean;
  status: number;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function citations(blocks: KnowledgeBlock[]): string[] {
  return unique(
    blocks.flatMap((item) =>
      item.dependencies.map((itemDependency) => itemDependency.id),
    ),
  );
}

function boundedBody(lines: string[]): string {
  const body = lines.filter(Boolean).join("\n");
  return body.length <= 7_800
    ? body
    : `${body.slice(0, 7_799).trimEnd()}…`;
}

function briefBody(blocks: KnowledgeBlock[]): string {
  return boundedBody(
    blocks
      .filter(
        (item) =>
          item.block_key.startsWith("fact.") &&
          item.status === "confirmed",
      )
      .map((item) => item.content.headline),
  );
}

export function responseBlocks(
  blocks: KnowledgeBlock[],
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
      item.status === "confirmed",
  );
  const proposedContext = contextBlocks.some((item) =>
    ["proposed", "contested"].includes(item.status),
  );
  const answer: ChatResponseBlock[] = [
    {
      id: randomUUID(),
      kind: "person_brief",
      title: identity.content.headline,
      body:
        briefBody(blocks) ||
        "No additional reviewed relationship state is ready for this task.",
      status: proposedContext ? "needs_review" : "confirmed",
      citation_dependency_ids: citations([
        identity,
        ...currentFactBlocks,
      ]),
      requires_user_decision: proposedContext,
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
  if (sourceReceipts.length > 0) {
    answer.push({
      id: randomUUID(),
      kind: "source_receipt",
      title: "Governed source material is attached",
      body: boundedBody(
        sourceReceipts.map((item) => item.content.headline),
      ),
      status: sourceReceipts.some((item) => item.status === "proposed")
        ? "needs_review"
        : "confirmed",
      citation_dependency_ids: citations(sourceReceipts),
      requires_user_decision: sourceReceipts.some(
        (item) => item.status === "proposed",
      ),
    });
  }

  const nextAction = blocks.find((item) => item.type === "next_action");
  const noAction = blocks.find((item) => item.type === "no_action");
  if (nextAction) {
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
      body: noAction.content.headline,
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

export async function createChatTask(
  pool: Pool,
  auth: AuthContext,
  request: ChatTaskRequest,
): Promise<ChatTaskMutationResult> {
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

    const blocks = responseBlocks(selectedBlocks);
    const action = blocks.find((item) => item.kind === "action_proposal");
    const noAction = blocks.find((item) => item.kind === "no_action");
    const response: ChatTaskResponse = {
      contract_version: CONTRACT_VERSION,
      task_id: taskId,
      context_manifest_id: manifestId,
      knowledge_snapshot_id: snapshot.id,
      disposition: action
        ? "propose_action"
        : noAction
          ? "no_action"
          : "answer",
      blocks,
      created_at: createdAt.toISOString(),
    };
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
        disposition: response.disposition,
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
