import { randomUUID } from "node:crypto";

import {
  AnalysisProposalResponseSchema,
  ApproveActionRequestSchema,
  ApprovalResponseSchema,
  AssertionDecisionRequestSchema,
  AssertionDecisionResponseSchema,
  CaptureResponseSchema,
  CONTRACT_VERSION,
  CreateCaptureRequestSchema,
  DeleteCaptureRequestSchema,
  DeleteCaptureResponseSchema,
  DeletionLineageResponseSchema,
  EffectResultResponseSchema,
  ErrorResponseSchema,
  ExecuteActionRequestSchema,
  ReconcileEffectRequestSchema,
  RevokeApprovalRequestSchema,
  RevokeCapabilityRequestSchema,
  ReviseActionRequestSchema,
  SessionResponseSchema,
  SimulatedLoginRequestSchema,
  SourceRetentionReceiptSchema,
  SubmitAnalysisProposalRequestSchema,
  SyncResponseSchema,
  TemporalStateResponseSchema,
  WorkspaceReviewResponseSchema,
  type ApproveActionRequest,
  type AssertionDecisionRequest,
  type CreateCaptureRequest,
  type DeleteCaptureRequest,
  type ExecuteActionRequest,
  type ReconcileEffectRequest,
  type RevokeApprovalRequest,
  type RevokeCapabilityRequest,
  type ReviseActionRequest,
  type SimulatedLoginRequest,
  type SubmitAnalysisProposalRequest,
} from "@talent-signal/contracts";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import Fastify, { type FastifyInstance } from "fastify";
import { Type } from "@sinclair/typebox";
import type { Pool } from "pg";

import type { BackendConfig } from "./config.js";
import { ApiError } from "./lib/apiError.js";
import type { AuthContext } from "./modules/auth.js";
import {
  approveAction,
  executeAction,
  reconcileEffect,
  reviseAction,
  revokeApproval,
  revokeCapability,
} from "./modules/actions.js";
import {
  createAuthGuard,
  createSimulatedSession,
} from "./modules/auth.js";
import {
  createCapture,
  deleteCapture,
  getDeletionLineage,
  getCapture,
  getTemporalState,
} from "./modules/captures.js";
import { decideAssertion } from "./modules/decisions.js";
import { submitAnalysisProposal } from "./modules/proposals.js";
import { readSyncEvents } from "./modules/sync.js";
import {
  getSourceRetentionReceipt,
  getSourceRetentionReceiptByLocator,
  sweepDueSourceRetention,
} from "./modules/sourceRetention.js";
import { getWorkspaceReview } from "./modules/workspace.js";

const IdParamsSchema = Type.Object(
  { id: Type.String({ format: "uuid" }) },
  { additionalProperties: false },
);
const SyncQuerySchema = Type.Object(
  {
    after: Type.Optional(
      Type.String({ pattern: "^[0-9]+$", default: "0" }),
    ),
  },
  { additionalProperties: false },
);
const StateQuerySchema = Type.Object(
  { assignment_id: Type.String({ format: "uuid" }) },
  { additionalProperties: false },
);
const WorkspaceReviewQuerySchema = Type.Object(
  {
    fixture_case_id: Type.String({
      minLength: 1,
      maxLength: 80,
      pattern: "^TS-[A-Z]+-[0-9]{2}$",
    }),
  },
  { additionalProperties: false },
);
const SourceLocatorQuerySchema = Type.Object(
  {
    source_locator: Type.String({ minLength: 1, maxLength: 500 }),
  },
  { additionalProperties: false },
);

export interface AppDependencies {
  config: BackendConfig;
  pool: Pool;
}

export async function buildApp(
  dependencies: AppDependencies,
): Promise<FastifyInstance> {
  const { config, pool } = dependencies;
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      redact: {
        paths: [
          "req.headers.authorization",
          "headers.authorization",
          "access_token",
        ],
        censor: "[redacted]",
      },
    },
    requestIdHeader: "x-request-id",
    genReqId: () => randomUUID(),
    bodyLimit: 2 * 1024 * 1024,
  });

  app.decorateRequest("auth", null as unknown as AuthContext);
  await app.register(cors, {
    credentials: false,
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
  });
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Talent Signal Local Shared Authority API",
        description:
          "Account-scoped localhost contract. All effects are labeled deterministic simulations.",
        version: CONTRACT_VERSION,
      },
      servers: [{ url: `http://localhost:${config.port}` }],
      components: {
        securitySchemes: {
          bearerSession: {
            type: "http",
            scheme: "bearer",
          },
        },
      },
    },
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      void reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          request_id: request.id,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      });
      return;
    }
    const validation = (error as { validation?: unknown }).validation;
    if (validation) {
      void reply.status(400).send({
        error: {
          code: "REQUEST_VALIDATION_FAILED",
          message: "The request does not match the versioned contract.",
          request_id: request.id,
          details: validation,
        },
      });
      return;
    }
    request.log.error(
      { err: error },
      "Unhandled control-plane request failure",
    );
    void reply.status(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "The request could not be completed.",
        request_id: request.id,
      },
    });
  });

  app.get("/health/live", async () => ({
    status: "ok",
    service: "talent-signal-backend",
  }));
  app.get("/health/ready", async (_request, reply) => {
    try {
      const result = await pool.query<{ version: string }>(
        `SELECT version
         FROM schema_migrations
         WHERE version = '002_source_retention'`,
      );
      if (!result.rows[0]) {
        throw new Error("migration unavailable");
      }
      return {
        status: "ready",
        database: "ready",
        migration: result.rows[0].version,
      };
    } catch {
      return reply.status(503).send({
        status: "not_ready",
        database: "unavailable",
      });
    }
  });
  app.get("/v1/meta", async () => ({
    contract_version: CONTRACT_VERSION,
    authority: "account_scoped_backend",
    effect_adapters: [
      {
        id: "local_deterministic",
        simulated: true,
        production_write: false,
      },
    ],
  }));
  app.get("/v1/openapi.json", async () => app.swagger());

  app.post<{ Body: SimulatedLoginRequest }>(
    "/v1/auth/simulated-login",
    {
      schema: {
        tags: ["auth"],
        body: SimulatedLoginRequestSchema,
        response: {
          200: SessionResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) =>
      createSimulatedSession(pool, config, request.body),
  );

  const authenticate = createAuthGuard(pool);
  const security = [{ bearerSession: [] }];

  app.post<{ Body: CreateCaptureRequest }>(
    "/v1/captures",
    {
      preHandler: authenticate,
      schema: {
        tags: ["captures"],
        security,
        body: CreateCaptureRequestSchema,
        response: {
          201: CaptureResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await createCapture(pool, request.auth, request.body);
      return reply
        .header("idempotent-replayed", result.replayed)
        .status(result.status)
        .send(result.body);
    },
  );

  app.get<{ Params: { id: string } }>(
    "/v1/captures/:id",
    {
      preHandler: authenticate,
      schema: {
        tags: ["captures"],
        security,
        params: IdParamsSchema,
        response: {
          200: CaptureResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) => getCapture(pool, request.auth, request.params.id),
  );

  app.get<{ Params: { id: string } }>(
    "/v1/captures/:id/retention",
    {
      preHandler: authenticate,
      schema: {
        tags: ["retention"],
        security,
        params: IdParamsSchema,
        response: {
          200: SourceRetentionReceiptSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) =>
      getSourceRetentionReceipt(pool, request.auth, request.params.id),
  );

  app.get<{ Querystring: { source_locator: string } }>(
    "/v1/source-retention-receipts",
    {
      preHandler: authenticate,
      schema: {
        tags: ["retention"],
        security,
        querystring: SourceLocatorQuerySchema,
        response: {
          200: SourceRetentionReceiptSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) =>
      getSourceRetentionReceiptByLocator(
        pool,
        request.auth,
        request.query.source_locator,
      ),
  );

  app.get<{ Querystring: { assignment_id: string } }>(
    "/v1/state",
    {
      preHandler: authenticate,
      schema: {
        tags: ["review"],
        security,
        querystring: StateQuerySchema,
        response: {
          200: TemporalStateResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) =>
      getTemporalState(pool, request.auth, request.query.assignment_id),
  );

  app.get<{ Querystring: { fixture_case_id: string } }>(
    "/v1/workspace-review",
    {
      preHandler: authenticate,
      schema: {
        tags: ["review"],
        security,
        querystring: WorkspaceReviewQuerySchema,
        response: {
          200: WorkspaceReviewResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) =>
      getWorkspaceReview(
        pool,
        request.auth,
        request.query.fixture_case_id,
      ),
  );

  app.post<{
    Params: { id: string };
    Body: SubmitAnalysisProposalRequest;
  }>(
    "/v1/captures/:id/analysis-proposals",
    {
      preHandler: authenticate,
      schema: {
        tags: ["review"],
        security,
        params: IdParamsSchema,
        body: SubmitAnalysisProposalRequestSchema,
        response: {
          201: AnalysisProposalResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await submitAnalysisProposal(
        pool,
        request.auth,
        request.params.id,
        request.body,
      );
      return reply
        .header("idempotent-replayed", result.replayed)
        .status(result.status)
        .send(result.body);
    },
  );

  app.post<{
    Params: { id: string };
    Body: AssertionDecisionRequest;
  }>(
    "/v1/assertions/:id/decisions",
    {
      preHandler: authenticate,
      schema: {
        tags: ["review"],
        security,
        params: IdParamsSchema,
        body: AssertionDecisionRequestSchema,
        response: {
          201: AssertionDecisionResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await decideAssertion(
        pool,
        request.auth,
        request.params.id,
        request.body,
      );
      return reply
        .header("idempotent-replayed", result.replayed)
        .status(result.status)
        .send(result.body);
    },
  );

  app.post<{ Params: { id: string }; Body: ReviseActionRequest }>(
    "/v1/actions/:id/revisions",
    {
      preHandler: authenticate,
      schema: {
        tags: ["actions"],
        security,
        params: IdParamsSchema,
        body: ReviseActionRequestSchema,
        response: { "4xx": ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const result = await reviseAction(
        pool,
        request.auth,
        request.params.id,
        request.body,
      );
      return reply
        .header("idempotent-replayed", result.replayed)
        .status(result.status)
        .send(result.body);
    },
  );

  app.post<{ Params: { id: string }; Body: ApproveActionRequest }>(
    "/v1/actions/:id/approvals",
    {
      preHandler: authenticate,
      schema: {
        tags: ["actions"],
        security,
        params: IdParamsSchema,
        body: ApproveActionRequestSchema,
        response: {
          201: ApprovalResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await approveAction(
        pool,
        request.auth,
        request.params.id,
        request.body,
      );
      return reply
        .header("idempotent-replayed", result.replayed)
        .status(result.status)
        .send(result.body);
    },
  );

  app.post<{ Params: { id: string }; Body: RevokeApprovalRequest }>(
    "/v1/approvals/:id/revocation",
    {
      preHandler: authenticate,
      schema: {
        tags: ["actions"],
        security,
        params: IdParamsSchema,
        body: RevokeApprovalRequestSchema,
        response: { "4xx": ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const result = await revokeApproval(
        pool,
        request.auth,
        request.params.id,
        request.body,
      );
      return reply
        .header("idempotent-replayed", result.replayed)
        .status(result.status)
        .send(result.body);
    },
  );

  app.post<{ Params: { id: string }; Body: ExecuteActionRequest }>(
    "/v1/actions/:id/executions",
    {
      preHandler: authenticate,
      schema: {
        tags: ["effects"],
        security,
        params: IdParamsSchema,
        body: ExecuteActionRequestSchema,
        response: {
          200: EffectResultResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await executeAction(
        pool,
        request.auth,
        request.params.id,
        request.body,
      );
      return reply
        .header("idempotent-replayed", result.replayed)
        .status(result.status)
        .send(result.body);
    },
  );

  app.post<{ Params: { id: string }; Body: ReconcileEffectRequest }>(
    "/v1/effect-attempts/:id/reconcile",
    {
      preHandler: authenticate,
      schema: {
        tags: ["effects"],
        security,
        params: IdParamsSchema,
        body: ReconcileEffectRequestSchema,
        response: {
          200: EffectResultResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await reconcileEffect(
        pool,
        request.auth,
        request.params.id,
        request.body,
      );
      return reply
        .header("idempotent-replayed", result.replayed)
        .status(result.status)
        .send(result.body);
    },
  );

  app.post<{ Body: RevokeCapabilityRequest }>(
    "/v1/authorizations/revocation",
    {
      preHandler: authenticate,
      schema: {
        tags: ["effects"],
        security,
        body: RevokeCapabilityRequestSchema,
        response: { "4xx": ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const result = await revokeCapability(pool, request.auth, request.body);
      return reply
        .header("idempotent-replayed", result.replayed)
        .status(result.status)
        .send(result.body);
    },
  );

  app.post<{ Params: { id: string }; Body: DeleteCaptureRequest }>(
    "/v1/captures/:id/deletion",
    {
      preHandler: authenticate,
      schema: {
        tags: ["deletion"],
        security,
        params: IdParamsSchema,
        body: DeleteCaptureRequestSchema,
        response: {
          200: DeleteCaptureResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await deleteCapture(
        pool,
        request.auth,
        request.params.id,
        request.body,
      );
      return reply
        .header("idempotent-replayed", result.replayed)
        .status(result.status)
        .send(result.body);
    },
  );

  app.get<{ Params: { id: string } }>(
    "/v1/deletions/:id/lineage",
    {
      preHandler: authenticate,
      schema: {
        tags: ["deletion"],
        security,
        params: IdParamsSchema,
        response: {
          200: DeletionLineageResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) =>
      getDeletionLineage(pool, request.auth, request.params.id),
  );

  app.get<{ Querystring: { after?: string } }>(
    "/v1/sync",
    {
      preHandler: authenticate,
      schema: {
        tags: ["sync"],
        security,
        querystring: SyncQuerySchema,
        response: {
          200: SyncResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) =>
      readSyncEvents(
        pool,
        request.auth,
        Number.parseInt(request.query.after ?? "0", 10),
      ),
  );

  const retentionSweep = setInterval(() => {
    void sweepDueSourceRetention(pool).catch((error: unknown) => {
      app.log.error({ err: error }, "Source-retention sweep failed");
    });
  }, config.retentionSweepIntervalMs);
  retentionSweep.unref();
  app.addHook("onClose", async () => {
    clearInterval(retentionSweep);
  });

  return app;
}
