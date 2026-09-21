import { Type } from "@sinclair/typebox";
import {
  CONTRACT_VERSION,
  MemoryCommitRequestSchema,
  MemoryDismissRequestSchema,
  MemoryItemMutationRequestSchema,
  MemoryOpenReviewRequestSchema,
  MemoryProposalRebaseRequestSchema,
  MemoryProposalStageRequestSchema,
  MemoryReviewDraftRequestSchema,
  MemoryUndoRequestSchema,
  type MemoryCommitRequest,
  type MemoryDismissRequest,
  type MemoryItemMutationRequest,
  type MemoryOpenReviewRequest,
  type MemoryProposalRebaseRequest,
  type MemoryProposalStageRequest,
  type MemoryReviewDraftRequest,
  type MemorySurface,
  type MemoryUndoRequest,
} from "@talent-signal/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { Pool } from "pg";

import { inTransaction } from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import { claimIdempotency, completeIdempotency } from "../lib/idempotency.js";
import {
  commitMemoryReview,
  dismissMemoryReview,
  listMemoryProposals,
  mutateMemoryItem,
  openMemoryReview,
  readMemoryOperation,
  readMemoryReview,
  rebaseMemoryProposal,
  recallMemories,
  regenerateMemoryProposal,
  resolveSessionSourceAuthority,
  saveMemoryReviewDraft,
  stageMemoryProposal,
  undoMemoryCommit,
  type MemoryProposalRegenerator,
  type MemoryRegenerationImageLoader,
} from "./memoryReview.js";

const proposalParams = Type.Object({ proposalId: Type.String({ format: "uuid" }) });
const reviewParams = Type.Object({ reviewScopeId: Type.String({ format: "uuid" }) });
const commitParams = Type.Object({ commitId: Type.String({ format: "uuid" }) });
const operationParams = Type.Object({ operationKey: Type.String({ format: "uuid" }) });
const itemParams = Type.Object({ itemId: Type.String({ format: "uuid" }) });
const credentialQuery = Type.Object({
  credential: Type.Optional(Type.String({ minLength: 16, maxLength: 200 })),
});
const listQuery = Type.Object({
  purpose: Type.Optional(
    Type.Union([
      Type.Literal("chat"),
      Type.Literal("people"),
      Type.Literal("relationship"),
    ]),
  ),
  person_id: Type.Optional(Type.String({ format: "uuid" })),
  relationship_context_id: Type.Optional(Type.String({ format: "uuid" })),
});
const recallQuery = Type.Object({
  surface: Type.Union([
    Type.Literal("chat"),
    Type.Literal("people"),
    Type.Literal("relationship"),
  ]),
  person_id: Type.Optional(Type.String({ format: "uuid" })),
  relationship_context_id: Type.Optional(Type.String({ format: "uuid" })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
});

/**
 * Authenticated Memory review + recall routes. Additive to the versioned
 * product contract; old native clients are not required to call them.
 */
export function registerMemoryReviewRoutes(
  app: FastifyInstance,
  pool: Pool,
  authenticate: preHandlerHookHandler,
  regenerator: MemoryProposalRegenerator | null = null,
  loadImage: MemoryRegenerationImageLoader | null = null,
) {
  const security = [{ bearerSession: [] }];

  app.get<{
    Querystring: {
      purpose?: MemorySurface;
      person_id?: string;
      relationship_context_id?: string;
    };
  }>(
    "/v1/memory/proposals",
    { preHandler: authenticate, schema: { tags: ["memory"], security, querystring: listQuery } },
    async (request) =>
      listMemoryProposals(
        pool,
        request.auth,
        request.query.purpose ?? null,
        request.query.person_id ?? null,
        request.query.relationship_context_id ?? null,
      ),
  );

  app.post<{ Body: unknown }>("/v1/memory/proposals", {
    preHandler: authenticate,
    schema: { tags: ["memory"], security, body: MemoryProposalStageRequestSchema },
  }, async (request, reply) => {
    const parsed = request.body as MemoryProposalStageRequest;
    return inTransaction(pool, async (client) => {
      const idempotency = await claimIdempotency(
        client,
        { accountId: request.auth.accountId, actorUserId: request.auth.userId },
        "stage_memory_proposal",
        parsed.idempotency_key,
        parsed,
      );
      if (idempotency.replay) {
        return reply.status(200).send(idempotency.replay.body);
      }
      const authority = await resolveSessionSourceAuthority(
        client,
        request.auth,
        parsed.session_id ?? null,
        parsed.source_message_id ?? null,
      );
      // Host task identity is never chosen by a public caller.
      const staged = await stageMemoryProposal(
        client,
        request.auth,
        { ...parsed, source_task_id: null },
        authority,
      );
      if (!staged) {
        throw new ApiError(
          409,
          "MEMORY_NO_MATERIAL_CHANGE",
          "There is no non-duplicate, grounded change to propose.",
        );
      }
      const body = {
        contract_version: CONTRACT_VERSION,
        replayed: staged.replayed,
        proposal: staged.proposal,
      };
      await completeIdempotency(client, idempotency, 201, body);
      return reply
        .header("idempotent-replayed", staged.replayed)
        .status(staged.replayed ? 200 : 201)
        .send(body);
    });
  });

  app.post<{ Params: { proposalId: string }; Body: unknown }>(
    "/v1/memory/proposals/:proposalId/reviews",
    {
      preHandler: authenticate,
      schema: {
        tags: ["memory"],
        security,
        params: proposalParams,
        body: MemoryOpenReviewRequestSchema,
      },
    },
    async (request) =>
      openMemoryReview(
        pool,
        request.auth,
        request.params.proposalId,
        request.body as MemoryOpenReviewRequest,
      ),
  );

  app.post<{ Params: { proposalId: string }; Body: unknown }>(
    "/v1/memory/proposals/:proposalId/rebases",
    {
      preHandler: authenticate,
      schema: {
        tags: ["memory"],
        security,
        params: proposalParams,
        body: MemoryProposalRebaseRequestSchema,
      },
    },
    async (request, reply) => {
      const parsed = request.body as MemoryProposalRebaseRequest;
      const useRegeneration = Boolean(regenerator)
        && parsed.contact_decision !== "none";
      if (!useRegeneration) {
        return inTransaction(pool, async (client) => {
          const idempotency = await claimIdempotency(
            client,
            { accountId: request.auth.accountId, actorUserId: request.auth.userId },
            "rebase_memory_proposal",
            parsed.idempotency_key,
            { proposal_id: request.params.proposalId, ...parsed },
          );
          if (idempotency.replay) {
            return reply.status(200).send(idempotency.replay.body);
          }
          const result = await rebaseMemoryProposal(
            client,
            request.auth,
            request.params.proposalId,
            parsed,
          );
          const body = {
            contract_version: CONTRACT_VERSION,
            replayed: result.replayed,
            proposal: result.proposal,
            review_credential: result.reviewCredential,
          };
          await completeIdempotency(client, idempotency, 200, body);
          return reply.status(200).send(body);
        });
      }
      // The bounded proposer runs outside any SQL transaction; only the final
      // version-guarded write is transactional.
      const claim = await inTransaction(pool, async (client) => {
        const idempotency = await claimIdempotency(
          client,
          { accountId: request.auth.accountId, actorUserId: request.auth.userId },
          "rebase_memory_proposal",
          parsed.idempotency_key,
          { proposal_id: request.params.proposalId, ...parsed },
        );
        return idempotency.replay
          ? { replay: idempotency.replay }
          : { claimId: idempotency.id };
      });
      if ("replay" in claim && claim.replay) {
        return reply.status(200).send(claim.replay.body);
      }
      const result = await regenerateMemoryProposal(
        pool,
        request.auth,
        request.params.proposalId,
        parsed,
        regenerator!,
        loadImage ?? undefined,
      );
      const body = {
        contract_version: CONTRACT_VERSION,
        replayed: result.replayed,
        proposal: result.proposal,
        review_credential: result.reviewCredential,
      };
      if ("claimId" in claim && claim.claimId) {
        await inTransaction(pool, async (client) => {
          await completeIdempotency(
            client,
            { id: claim.claimId, replay: null },
            200,
            body,
          );
        });
      }
      return reply.status(200).send(body);
    },
  );

  app.post<{ Params: { reviewScopeId: string }; Querystring: { credential?: string }; Body: unknown }>(
    "/v1/memory/reviews/:reviewScopeId/dismissals",
    {
      preHandler: authenticate,
      schema: {
        tags: ["memory"],
        security,
        params: reviewParams,
        querystring: credentialQuery,
        body: MemoryDismissRequestSchema,
      },
    },
    async (request, reply) => {
      const result = await dismissMemoryReview(
        pool,
        request.auth,
        request.params.reviewScopeId,
        request.query.credential ?? null,
        request.body as MemoryDismissRequest,
      );
      return reply
        .header("idempotent-replayed", result.replayed)
        .status(200)
        .send(result);
    },
  );

  app.get<{ Params: { reviewScopeId: string }; Querystring: { credential?: string } }>(
    "/v1/memory/reviews/:reviewScopeId",
    { preHandler: authenticate, schema: { tags: ["memory"], security, params: reviewParams, querystring: credentialQuery } },
    async (request) =>
      readMemoryReview(
        pool,
        request.auth,
        request.params.reviewScopeId,
        request.query.credential ?? null,
      ),
  );

  app.put<{
    Params: { reviewScopeId: string };
    Querystring: { credential?: string };
    Body: unknown;
  }>(
    "/v1/memory/reviews/:reviewScopeId/draft",
    {
      preHandler: authenticate,
      schema: {
        tags: ["memory"],
        security,
        params: reviewParams,
        querystring: credentialQuery,
        body: MemoryReviewDraftRequestSchema,
      },
    },
    async (request) =>
      saveMemoryReviewDraft(
        pool,
        request.auth,
        request.params.reviewScopeId,
        request.query.credential ?? null,
        request.body as MemoryReviewDraftRequest,
      ),
  );

  app.post<{
    Params: { reviewScopeId: string };
    Querystring: { credential?: string };
    Body: unknown;
  }>(
    "/v1/memory/reviews/:reviewScopeId/commits",
    {
      preHandler: authenticate,
      schema: {
        tags: ["memory"],
        security,
        params: reviewParams,
        querystring: credentialQuery,
        body: MemoryCommitRequestSchema,
      },
    },
    async (request, reply) => {
      const result = await commitMemoryReview(
        pool,
        request.auth,
        request.params.reviewScopeId,
        request.query.credential ?? null,
        request.body as MemoryCommitRequest,
      );
      return reply
        .header("idempotent-replayed", result.replayed)
        .status(result.status)
        .send(result.body);
    },
  );

  app.get<{ Params: { operationKey: string } }>(
    "/v1/memory/operations/:operationKey",
    { preHandler: authenticate, schema: { tags: ["memory"], security, params: operationParams } },
    async (request) =>
      readMemoryOperation(pool, request.auth, request.params.operationKey),
  );

  app.post<{ Params: { commitId: string }; Body: unknown }>(
    "/v1/memory/commits/:commitId/undo",
    {
      preHandler: authenticate,
      schema: {
        tags: ["memory"],
        security,
        params: commitParams,
        body: MemoryUndoRequestSchema,
      },
    },
    async (request, reply) => {
      const result = await undoMemoryCommit(
        pool,
        request.auth,
        request.params.commitId,
        request.body as MemoryUndoRequest,
      );
      return reply.status(200).send(result);
    },
  );

  app.get<{
    Querystring: {
      surface: MemorySurface;
      person_id?: string;
      relationship_context_id?: string;
      limit?: number;
    };
  }>(
    "/v1/memory/items",
    { preHandler: authenticate, schema: { tags: ["memory"], security, querystring: recallQuery } },
    async (request) =>
      recallMemories(pool, request.auth, {
        surface: request.query.surface,
        person_id: request.query.person_id ?? null,
        relationship_context_id: request.query.relationship_context_id ?? null,
        ...(request.query.limit ? { limit: request.query.limit } : {}),
      }),
  );

  app.post<{ Params: { itemId: string }; Body: unknown }>(
    "/v1/memory/items/:itemId/mutations",
    {
      preHandler: authenticate,
      schema: {
        tags: ["memory"],
        security,
        params: itemParams,
        body: MemoryItemMutationRequestSchema,
      },
    },
    async (request, reply) => {
      const result = await mutateMemoryItem(
        pool,
        request.auth,
        request.params.itemId,
        request.body as MemoryItemMutationRequest,
      );
      return reply
        .header("idempotent-replayed", result.replayed)
        .status(200)
        .send(result);
    },
  );
}
