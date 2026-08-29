import { randomUUID } from "node:crypto";

import {
  AgentRunResponseSchema,
  AnalysisProposalResponseSchema,
  AppleLoginChallengeRequestSchema,
  AppleLoginChallengeResponseSchema,
  AppleLoginRequestSchema,
  ApproveActionRequestSchema,
  ApproveEffectReversalRequestSchema,
  ApprovalResponseSchema,
  AssertionDecisionRequestSchema,
  AssertionDecisionResponseSchema,
  CaptureResponseSchema,
  CaptureIdentityCorrectionRequestSchema,
  CaptureIdentityCorrectionResponseSchema,
  ChatTaskRequestSchema,
  ChatTaskReadbackSchema,
  ChatTaskResponseSchema,
  ChatMediaAssetSchema,
  ChatMediaDeleteResponseSchema,
  CreateChatMediaRequestSchema,
  CompileKnowledgeRequestSchema,
  CONTRACT_VERSION,
  CompletePursuitActionRequestSchema,
  CreatePursuitAgentRunRequestSchema,
  CreateCaptureRequestSchema,
  CreatePursuitRequestSchema,
  DeleteCaptureRequestSchema,
  DeleteCaptureResponseSchema,
  DeletionLineageResponseSchema,
  EffectResultResponseSchema,
  EffectReversalApprovalResponseSchema,
  EffectReversalPreviewSchema,
  EffectReversalResultResponseSchema,
  EvidenceFragmentReviewRequestSchema,
  EvidenceFragmentReviewResponseSchema,
  IdentityResolutionCaseSchema,
  IdentityResolutionDecisionRequestSchema,
  IdentityResolutionDecisionResponseSchema,
  ErrorResponseSchema,
  ExecuteActionRequestSchema,
  ExecuteEffectReversalRequestSchema,
  ReconcileEffectRequestSchema,
  ResourceCaptureRequestSchema,
  ResourceCaptureResponseSchema,
  RelationshipResourceDetailSchema,
  RelationshipResourceListResponseSchema,
  RelationshipAgentHistorySchema,
  RelationshipScopeSchema,
  RevokeApprovalRequestSchema,
  RevokeCapabilityRequestSchema,
  PersonDirectoryResponseSchema,
  PersonMergePreviewSchema,
  PersonMergeRequestSchema,
  PersonMergeResponseSchema,
  PersonMergeReversalPreviewSchema,
  PersonMergeReversalRequestSchema,
  PursuitProposalResponseSchema,
  PursuitProposalListResponseSchema,
  PursuitProposalReviewResponseSchema,
  PursuitDetailResponseSchema,
  PursuitListResponseSchema,
  PursuitMutationResponseSchema,
  PursuitOperationResponseSchema,
  PublicResearchRequestSchema,
  PublicResearchResponseSchema,
  KnowledgeSnapshotSchema,
  CurrentSessionResponseSchema,
  LogoutResponseSchema,
  PasswordLoginRequestSchema,
  PasswordRegistrationRequestSchema,
  ReviseActionRequestSchema,
  RevisePursuitRequestSchema,
  ReviewPursuitProposalRequestSchema,
  SessionResponseSchema,
  SimulatedLoginRequestSchema,
  SourceRetentionReceiptSchema,
  SourceAuthorizationDecisionRequestSchema,
  SourceAuthorizationDecisionResponseSchema,
  StagePursuitProposalRequestSchema,
  SubmitAnalysisProposalRequestSchema,
  SyncResponseSchema,
  TemporalStateResponseSchema,
  WorkspaceReviewResponseSchema,
  type ApproveActionRequest,
  type AppleLoginChallengeRequest,
  type AppleLoginRequest,
  type ApproveEffectReversalRequest,
  type AssertionDecisionRequest,
  type CreateCaptureRequest,
  type CreatePursuitRequest,
  type CompletePursuitActionRequest,
  type CaptureIdentityCorrectionRequest,
  type ChatTaskRequest,
  type CreateChatMediaRequest,
  type CompileKnowledgeRequest,
  type CreatePursuitAgentRunRequest,
  type DeleteCaptureRequest,
  type ExecuteActionRequest,
  type ExecuteEffectReversalRequest,
  type EvidenceFragmentReviewRequest,
  type IdentityResolutionDecisionRequest,
  type PersonMergeRequest,
  type PersonMergeReversalRequest,
  type PasswordLoginRequest,
  type PasswordRegistrationRequest,
  type ReconcileEffectRequest,
  type PublicResearchRequest,
  type ResourceCaptureRequest,
  type RevokeApprovalRequest,
  type RevokeCapabilityRequest,
  type ReviseActionRequest,
  type RevisePursuitRequest,
  type ReviewPursuitProposalRequest,
  type SimulatedLoginRequest,
  type SourceAuthorizationDecisionRequest,
  type StagePursuitProposalRequest,
  type SubmitAnalysisProposalRequest,
} from "@talent-signal/contracts";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import Fastify, { type FastifyInstance } from "fastify";
import { Type } from "@sinclair/typebox";
import type { Pool } from "pg";

import type { BackendConfig } from "./config.js";
import { ApiError } from "./lib/apiError.js";
import type { AuthContext } from "./modules/auth.js";
import {
  createPursuitAgentRun,
  getAgentRun,
} from "./modules/agentRuns.js";
import { getRelationshipAgentHistory } from "./modules/agentHistory.js";
import {
  approveAction,
  approveEffectReversal,
  executeAction,
  executeEffectReversal,
  previewEffectReversal,
  reconcileEffect,
  reviseAction,
  revokeApproval,
  revokeCapability,
  revokeEffectReversalApproval,
} from "./modules/actions.js";
import {
  type AppleTokenVerifying,
  createAppleLoginChallenge,
  createAppleSession,
  createAuthGuard,
  createPasswordSession,
  createSimulatedSession,
  currentSession,
  registerPasswordSession,
  revokeCurrentSession,
} from "./modules/auth.js";
import {
  createCapture,
  deleteCapture,
  getDeletionLineage,
  getCapture,
  getTemporalState,
} from "./modules/captures.js";
import { decideAssertion } from "./modules/decisions.js";
import { createChatTask, getChatTaskReadback } from "./modules/chat.js";
import {
  createEnvironmentChatAnswerProvider,
  type RemoteChatAnswerProviding,
} from "./modules/chatAnswerProvider.js";
import {
  CHAT_MEDIA_MAX_BYTES,
  createChatMediaAsset,
  deleteChatMediaAsset,
  getChatMediaContent,
  uploadChatMediaContent,
} from "./modules/chatMedia.js";
import {
  createChatMediaStorage,
  type ChatMediaStorage,
} from "./modules/chatMediaStorage.js";
import {
  decideIdentityResolutionCase,
  getIdentityResolutionCase,
} from "./modules/identityCases.js";
import { correctCaptureIdentity } from "./modules/identityCorrections.js";
import {
  mergePeople,
  previewPersonMerge,
  previewPersonMergeReversal,
  reversePersonMerge,
} from "./modules/personMerges.js";
import {
  decideCaptureSourceAuthorization,
  persistSourceAuthorizationCompilation,
} from "./modules/sourceAuthorization.js";
import { runSourceLifecycleSweep } from "./modules/sourceLifecycle.js";
import {
  getRelationshipScope,
  listPeople,
  searchPeople,
} from "./modules/people.js";
import {
  completePursuitAction,
  createPursuit,
  getPursuit,
  getPursuitOperation,
  listPursuits,
  revisePursuit,
} from "./modules/pursuits.js";
import {
  getPursuitProposal,
  listPursuitProposals,
  reviewPursuitProposal,
  stagePursuitProposal,
  type ProposalReviewConflict,
} from "./modules/pursuitProposals.js";
import { createResourceCapture } from "./modules/resourceIntake.js";
import {
  getLatestPublicResearchTask,
  runPublicResearch,
} from "./modules/research.js";
import {
  getRelationshipResource,
  listRelationshipResources,
  reviewEvidenceFragment,
} from "./modules/resources.js";
import {
  compileRelationshipWiki,
  getRelationshipWiki,
} from "./modules/wiki.js";
import { submitAnalysisProposal } from "./modules/proposals.js";
import { readSyncEvents } from "./modules/sync.js";
import {
  getSourceRetentionReceipt,
  getSourceRetentionReceiptByLocator,
} from "./modules/sourceRetention.js";
import { getWorkspaceReview } from "./modules/workspace.js";
import {
  EnvironmentDoubaoVoiceTranscriber,
  type VoiceTranscriptionServing,
  voiceTranscriptionLimits,
} from "./modules/voiceTranscription.js";

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
    fixture_case_id: Type.Optional(
      Type.String({
        minLength: 1,
        maxLength: 80,
        pattern: "^TS-[A-Z]+-[0-9]{2}$",
      }),
    ),
    capture_id: Type.Optional(Type.String({ format: "uuid" })),
  },
  { additionalProperties: false },
);
const SourceLocatorQuerySchema = Type.Object(
  {
    source_locator: Type.String({ minLength: 1, maxLength: 500 }),
  },
  { additionalProperties: false },
);
const PeopleQuerySchema = Type.Object(
  {
    query: Type.Optional(Type.String({ maxLength: 160 })),
  },
  { additionalProperties: false },
);
const PeopleSearchSchema = Type.Object(
  {
    query: Type.String({ minLength: 1, maxLength: 500 }),
  },
  { additionalProperties: false },
);
const PersonMergePreviewQuerySchema = Type.Object(
  {
    source_person_id: Type.String({ format: "uuid" }),
    target_person_id: Type.String({ format: "uuid" }),
  },
  { additionalProperties: false },
);
const PersonContextParamsSchema = Type.Object(
  {
    personId: Type.String({ format: "uuid" }),
    contextId: Type.String({ format: "uuid" }),
  },
  { additionalProperties: false },
);
const VoiceTranscriptionRequestSchema = Type.Object(
  {
    audio_base64: Type.String({
      minLength: 60,
      maxLength: voiceTranscriptionLimits.maxBase64Characters,
      pattern: "^[A-Za-z0-9+/]+={0,2}$",
    }),
    client_request_id: Type.String({ format: "uuid" }),
    mime_type: Type.Literal("audio/wav"),
  },
  { additionalProperties: false },
);
const VoiceTranscriptionResponseSchema = Type.Object(
  {
    audio_duration_ms: Type.Optional(Type.Number({ minimum: 0 })),
    client_request_id: Type.String({ format: "uuid" }),
    model: Type.String({ minLength: 1 }),
    provider: Type.Literal("doubao"),
    provider_request_id: Type.String({ format: "uuid" }),
    status: Type.Literal("draft"),
    temporary_audio_stored_by_talent_signal: Type.Literal(false),
    transcript: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export interface AppDependencies {
  appleTokenVerifier?: AppleTokenVerifying;
  config: BackendConfig;
  pool: Pool;
  voiceTranscriber?: VoiceTranscriptionServing;
  chatMediaStorage?: ChatMediaStorage;
  remoteChatProvider?: RemoteChatAnswerProviding | null;
}

export async function buildApp(
  dependencies: AppDependencies,
): Promise<FastifyInstance> {
  const { appleTokenVerifier, config, pool } = dependencies;
  const remoteChatProvider = dependencies.remoteChatProvider === undefined
    ? createEnvironmentChatAnswerProvider()
    : dependencies.remoteChatProvider;
  const voiceTranscriber =
    dependencies.voiceTranscriber ?? new EnvironmentDoubaoVoiceTranscriber();
  const chatMediaStorage =
    dependencies.chatMediaStorage ?? createChatMediaStorage(config);
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      redact: {
        paths: [
          "req.headers.authorization",
          "req.body.password",
          "req.body.audio_base64",
          "headers.authorization",
          "body.password",
          "body.audio_base64",
          "access_token",
          "password_scrypt",
        ],
        censor: "[redacted]",
      },
    },
    requestIdHeader: "x-request-id",
    genReqId: () => randomUUID(),
    bodyLimit: 2 * 1024 * 1024,
  });

  app.addContentTypeParser(
    /^image\//,
    { parseAs: "buffer", bodyLimit: CHAT_MEDIA_MAX_BYTES },
    (_request, body, done) => done(null, body),
  );

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
  await app.register(rateLimit, {
    global: false,
    max: 60,
    timeWindow: "1 minute",
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
    if ((error as { statusCode?: number }).statusCode === 429) {
      void reply.status(429).send({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Retry after the current window.",
          request_id: request.id,
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
  app.get(
    "/health/ready",
    {
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute",
        },
      },
    },
    async (_request, reply) => {
      try {
        const result = await pool.query<{ version: string }>(
          `SELECT version
           FROM schema_migrations
           WHERE version = '031_chat_media_assets'`,
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
    },
  );
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

  app.post<{ Body: PasswordLoginRequest }>(
    "/v1/auth/password/login",
    {
      config: {
        rateLimit: {
          max: 12,
          timeWindow: "1 minute",
        },
      },
      schema: {
        tags: ["auth"],
        body: PasswordLoginRequestSchema,
        response: {
          200: SessionResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) => createPasswordSession(pool, config, request.body),
  );

  app.post<{ Body: PasswordRegistrationRequest }>(
    "/v1/auth/password/register",
    {
      config: {
        rateLimit: {
          max: 6,
          timeWindow: "1 hour",
        },
      },
      schema: {
        tags: ["auth"],
        body: PasswordRegistrationRequestSchema,
        response: {
          201: SessionResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(await registerPasswordSession(pool, config, request.body)),
  );

  app.post<{ Body: AppleLoginChallengeRequest }>(
    "/v1/auth/apple/challenges",
    {
      schema: {
        tags: ["auth"],
        body: AppleLoginChallengeRequestSchema,
        response: {
          201: AppleLoginChallengeResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(await createAppleLoginChallenge(pool, config, request.body)),
  );

  app.post<{ Body: AppleLoginRequest }>(
    "/v1/auth/apple",
    {
      schema: {
        tags: ["auth"],
        body: AppleLoginRequestSchema,
        response: {
          200: SessionResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) =>
      createAppleSession(
        pool,
        config,
        request.body,
        appleTokenVerifier,
      ),
  );

  const authenticate = createAuthGuard(pool);
  const security = [{ bearerSession: [] }];

  app.get(
    "/v1/auth/session",
    {
      preHandler: authenticate,
      schema: {
        tags: ["auth"],
        security,
        response: {
          200: CurrentSessionResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) => currentSession(pool, request.auth),
  );

  app.post(
    "/v1/auth/logout",
    {
      preHandler: authenticate,
      schema: {
        tags: ["auth"],
        security,
        response: {
          200: LogoutResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) => revokeCurrentSession(pool, request.auth),
  );

  app.post<{
    Body: {
      audio_base64: string;
      client_request_id: string;
      mime_type: "audio/wav";
    };
  }>(
    "/v1/voice-transcriptions",
    {
      bodyLimit: 3_800_000,
      config: {
        rateLimit: {
          max: 12,
          timeWindow: "1 minute",
        },
      },
      preHandler: authenticate,
      schema: {
        tags: ["voice", "agent"],
        security,
        body: VoiceTranscriptionRequestSchema,
        response: {
          200: VoiceTranscriptionResponseSchema,
          "4xx": ErrorResponseSchema,
          "5xx": ErrorResponseSchema,
        },
      },
    },
    async (request) =>
      voiceTranscriber.transcribe({
        audioBase64: request.body.audio_base64,
        clientRequestId: request.body.client_request_id,
        mimeType: request.body.mime_type,
      }),
  );

  app.get(
    "/v1/pursuits",
    {
      preHandler: authenticate,
      schema: {
        tags: ["pursuits"],
        security,
        response: {
          200: PursuitListResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) => listPursuits(pool, request.auth),
  );

  app.post<{ Body: CreatePursuitRequest }>(
    "/v1/pursuits",
    {
      preHandler: authenticate,
      schema: {
        tags: ["pursuits"],
        security,
        body: CreatePursuitRequestSchema,
        response: {
          201: PursuitMutationResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await createPursuit(pool, request.auth, request.body);
      return reply
        .header("idempotent-replayed", result.replayed)
        .status(result.status)
        .send(result.body);
    },
  );

  app.get<{ Params: { id: string } }>(
    "/v1/pursuits/:id",
    {
      preHandler: authenticate,
      schema: {
        tags: ["pursuits"],
        security,
        params: IdParamsSchema,
        response: {
          200: PursuitDetailResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) => getPursuit(pool, request.auth, request.params.id),
  );

  app.post<{
    Params: { id: string };
    Body: CreatePursuitAgentRunRequest;
  }>(
    "/v1/pursuits/:id/agent-runs",
    {
      preHandler: authenticate,
      schema: {
        tags: ["pursuits", "agent"],
        security,
        params: IdParamsSchema,
        body: CreatePursuitAgentRunRequestSchema,
        response: {
          201: AgentRunResponseSchema,
          "4xx": ErrorResponseSchema,
          "5xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await createPursuitAgentRun(
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
    "/v1/agent-runs/:id",
    {
      preHandler: authenticate,
      schema: {
        tags: ["agent"],
        security,
        params: IdParamsSchema,
        response: {
          200: AgentRunResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) => getAgentRun(pool, request.auth, request.params.id),
  );

  app.get(
    "/v1/pursuit-proposals",
    {
      preHandler: authenticate,
      schema: {
        tags: ["pursuits", "review"],
        security,
        response: {
          200: PursuitProposalListResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) => listPursuitProposals(pool, request.auth),
  );

  app.post<{
    Params: { id: string };
    Body: RevisePursuitRequest;
  }>(
    "/v1/pursuits/:id/revisions",
    {
      preHandler: authenticate,
      schema: {
        tags: ["pursuits"],
        security,
        params: IdParamsSchema,
        body: RevisePursuitRequestSchema,
        response: {
          200: PursuitMutationResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await revisePursuit(
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
    Params: { pursuitId: string; actionId: string };
    Body: CompletePursuitActionRequest;
  }>(
    "/v1/pursuits/:pursuitId/actions/:actionId/completions",
    {
      preHandler: authenticate,
      schema: {
        tags: ["pursuits", "actions"],
        security,
        params: Type.Object(
          {
            pursuitId: Type.String({ format: "uuid" }),
            actionId: Type.String({ format: "uuid" }),
          },
          { additionalProperties: false },
        ),
        body: CompletePursuitActionRequestSchema,
        response: {
          200: PursuitMutationResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await completePursuitAction(
        pool,
        request.auth,
        request.params.pursuitId,
        request.params.actionId,
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
    Body: StagePursuitProposalRequest;
  }>(
    "/v1/pursuits/:id/proposals",
    {
      preHandler: authenticate,
      schema: {
        tags: ["pursuits", "review"],
        security,
        params: IdParamsSchema,
        body: StagePursuitProposalRequestSchema,
        response: {
          201: PursuitProposalResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await stagePursuitProposal(
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
    "/v1/pursuit-proposals/:id",
    {
      preHandler: authenticate,
      schema: {
        tags: ["pursuits", "review"],
        security,
        params: IdParamsSchema,
        response: {
          200: PursuitProposalResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) =>
      getPursuitProposal(pool, request.auth, request.params.id),
  );

  app.post<{
    Params: { id: string };
    Body: ReviewPursuitProposalRequest;
  }>(
    "/v1/pursuit-proposals/:id/reviews",
    {
      preHandler: authenticate,
      schema: {
        tags: ["pursuits", "review"],
        security,
        params: IdParamsSchema,
        body: ReviewPursuitProposalRequestSchema,
        response: {
          200: PursuitProposalReviewResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await reviewPursuitProposal(
        pool,
        request.auth,
        request.params.id,
        request.body,
      );
      reply.header("idempotent-replayed", result.replayed);
      if (result.status === 409) {
        const conflict = result.body as ProposalReviewConflict;
        throw new ApiError(
          409,
          "PURSUIT_PROPOSAL_REVIEW_CONFLICT",
          "The Pursuit changed; review the current revision before applying this Proposal.",
          conflict,
        );
      }
      return reply.status(result.status).send(result.body);
    },
  );

  app.get<{ Params: { id: string } }>(
    "/v1/operations/:id",
    {
      preHandler: authenticate,
      schema: {
        tags: ["operations"],
        security,
        params: IdParamsSchema,
        response: {
          200: PursuitOperationResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) =>
      getPursuitOperation(pool, request.auth, request.params.id),
  );

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

  app.post<{ Body: ResourceCaptureRequest }>(
    "/v1/resource-captures",
    {
      preHandler: authenticate,
      schema: {
        tags: ["resources"],
        security,
        body: ResourceCaptureRequestSchema,
        response: {
          201: ResourceCaptureResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await createResourceCapture(
        pool,
        request.auth,
        request.body,
      );
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

  app.get<{ Querystring: { query?: string } }>(
    "/v1/people",
    {
      preHandler: authenticate,
      schema: {
        tags: ["people"],
        security,
        querystring: PeopleQuerySchema,
        response: {
          200: PersonDirectoryResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) => listPeople(pool, request.auth, request.query.query),
  );

  app.post<{ Body: { query: string } }>(
    "/v1/people/search",
    {
      preHandler: authenticate,
      schema: {
        tags: ["people"],
        security,
        body: PeopleSearchSchema,
        response: {
          200: PersonDirectoryResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) =>
      searchPeople(pool, request.auth, request.body.query),
  );

  app.get<{
    Params: { personId: string; contextId: string };
  }>(
    "/v1/people/:personId/contexts/:contextId",
    {
      preHandler: authenticate,
      schema: {
        tags: ["people"],
        security,
        params: PersonContextParamsSchema,
        response: {
          200: RelationshipScopeSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) =>
      getRelationshipScope(
        pool,
        request.auth,
        request.params.personId,
        request.params.contextId,
      ),
  );

  app.get<{
    Params: { personId: string; contextId: string };
  }>(
    "/v1/people/:personId/contexts/:contextId/resources",
    {
      preHandler: authenticate,
      schema: {
        tags: ["resources"],
        security,
        params: PersonContextParamsSchema,
        response: {
          200: RelationshipResourceListResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) =>
      listRelationshipResources(
        pool,
        request.auth,
        request.params.personId,
        request.params.contextId,
      ),
  );

  app.get<{
    Params: { personId: string; contextId: string };
  }>(
    "/v1/people/:personId/contexts/:contextId/agent-history",
    {
      preHandler: authenticate,
      schema: {
        tags: ["people", "agents"],
        security,
        params: PersonContextParamsSchema,
        response: {
          200: RelationshipAgentHistorySchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) =>
      getRelationshipAgentHistory(
        pool,
        request.auth,
        request.params.personId,
        request.params.contextId,
      ),
  );

  app.get<{ Params: { id: string } }>(
    "/v1/resources/:id",
    {
      preHandler: authenticate,
      schema: {
        tags: ["resources"],
        security,
        params: IdParamsSchema,
        response: {
          200: RelationshipResourceDetailSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) =>
      getRelationshipResource(pool, request.auth, request.params.id),
  );

  app.post<{
    Params: { id: string };
    Body: EvidenceFragmentReviewRequest;
  }>(
    "/v1/evidence-fragments/:id/reviews",
    {
      preHandler: authenticate,
      schema: {
        tags: ["resources"],
        security,
        params: IdParamsSchema,
        body: EvidenceFragmentReviewRequestSchema,
        response: {
          201: EvidenceFragmentReviewResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await reviewEvidenceFragment(
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
    "/v1/identity-resolution-cases/:id",
    {
      preHandler: authenticate,
      schema: {
        tags: ["identity"],
        security,
        params: IdParamsSchema,
        response: {
          200: IdentityResolutionCaseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) =>
      getIdentityResolutionCase(
        pool,
        request.auth,
        request.params.id,
      ),
  );

  app.post<{
    Params: { id: string };
    Body: IdentityResolutionDecisionRequest;
  }>(
    "/v1/identity-resolution-cases/:id/decisions",
    {
      preHandler: authenticate,
      schema: {
        tags: ["identity"],
        security,
        params: IdParamsSchema,
        body: IdentityResolutionDecisionRequestSchema,
        response: {
          201: IdentityResolutionDecisionResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await decideIdentityResolutionCase(
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
    Body: CaptureIdentityCorrectionRequest;
  }>(
    "/v1/captures/:id/identity-corrections",
    {
      preHandler: authenticate,
      schema: {
        tags: ["identity"],
        security,
        params: IdParamsSchema,
        body: CaptureIdentityCorrectionRequestSchema,
        response: {
          201: CaptureIdentityCorrectionResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await correctCaptureIdentity(
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

  app.get<{
    Querystring: {
      source_person_id: string;
      target_person_id: string;
    };
  }>(
    "/v1/person-merges/preview",
    {
      preHandler: authenticate,
      schema: {
        tags: ["identity"],
        security,
        querystring: PersonMergePreviewQuerySchema,
        response: {
          200: PersonMergePreviewSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) =>
      previewPersonMerge(
        pool,
        request.auth,
        request.query.source_person_id,
        request.query.target_person_id,
      ),
  );

  app.post<{ Body: PersonMergeRequest }>(
    "/v1/person-merges",
    {
      preHandler: authenticate,
      schema: {
        tags: ["identity"],
        security,
        body: PersonMergeRequestSchema,
        response: {
          201: PersonMergeResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await mergePeople(pool, request.auth, request.body);
      return reply
        .header("idempotent-replayed", result.replayed)
        .status(result.status)
        .send(result.body);
    },
  );

  app.get<{ Params: { id: string } }>(
    "/v1/person-merges/:id/reversal",
    {
      preHandler: authenticate,
      schema: {
        tags: ["identity"],
        security,
        params: IdParamsSchema,
        response: {
          200: PersonMergeReversalPreviewSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) =>
      previewPersonMergeReversal(
        pool,
        request.auth,
        request.params.id,
      ),
  );

  app.post<{
    Params: { id: string };
    Body: PersonMergeReversalRequest;
  }>(
    "/v1/person-merges/:id/reversal",
    {
      preHandler: authenticate,
      schema: {
        tags: ["identity"],
        security,
        params: IdParamsSchema,
        body: PersonMergeReversalRequestSchema,
        response: {
          201: PersonMergeResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await reversePersonMerge(
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
    Body: SourceAuthorizationDecisionRequest;
  }>(
    "/v1/captures/:id/source-authorization-decisions",
    {
      preHandler: authenticate,
      config: {
        rateLimit: {
          max: 12,
          timeWindow: "1 minute",
        },
      },
      schema: {
        tags: ["resources"],
        security,
        params: IdParamsSchema,
        body: SourceAuthorizationDecisionRequestSchema,
        response: {
          201: SourceAuthorizationDecisionResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await decideCaptureSourceAuthorization(
        pool,
        request.auth,
        request.params.id,
        request.body,
      );
      let body = result.body;
      if (!body.compilation && !body.compilation_error) {
        try {
          const compilation = await compileRelationshipWiki(
            pool,
            request.auth,
            body.person_id,
            body.relationship_context_id,
            {
              idempotency_key:
                `source-authorization-${body.decision_id}`,
              objective:
                body.decision === "revoke"
                  ? "Rebuild the relationship Wiki without evidence whose source authorization was revoked."
                  : "Rebuild the relationship Wiki after restoring the source as reviewable evidence without restoring prior conclusions or actions.",
            },
          );
          body = {
            ...body,
            compilation: {
              snapshot_id: compilation.body.id,
              status: compilation.body.status,
              verdict: compilation.body.quality.verdict,
              block_count: compilation.body.blocks.length,
            },
          };
        } catch (error) {
          body = {
            ...body,
            compilation_error:
              error instanceof Error
                ? error.message.slice(0, 500)
                : "Relationship Wiki recompilation failed.",
          };
        }
        await persistSourceAuthorizationCompilation(
          pool,
          result.idempotencyRecordId,
          body,
        );
      }
      return reply
        .header("idempotent-replayed", result.replayed)
        .status(result.status)
        .send(body);
    },
  );

  app.post<{ Body: PublicResearchRequest }>(
    "/v1/research-tasks",
    {
      preHandler: authenticate,
      schema: {
        tags: ["research"],
        security,
        body: PublicResearchRequestSchema,
        response: {
          201: PublicResearchResponseSchema,
          202: PublicResearchResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await runPublicResearch(
        pool,
        request.auth,
        request.body,
      );
      return reply
        .header("idempotent-replayed", result.replayed)
        .status(result.status)
        .send(result.body);
    },
  );

  app.get<{
    Querystring: { seed_resource_id: string };
  }>(
    "/v1/research-tasks/latest",
    {
      preHandler: authenticate,
      schema: {
        tags: ["research"],
        security,
        querystring: Type.Object(
          {
            seed_resource_id: Type.String({ format: "uuid" }),
          },
          { additionalProperties: false },
        ),
        response: {
          200: Type.Union([
            PublicResearchResponseSchema,
            Type.Null(),
          ]),
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) =>
      getLatestPublicResearchTask(
        pool,
        request.auth,
        request.query.seed_resource_id,
      ),
  );

  app.post<{
    Params: { personId: string; contextId: string };
    Body: CompileKnowledgeRequest;
  }>(
    "/v1/people/:personId/contexts/:contextId/wiki-compilations",
    {
      preHandler: authenticate,
      schema: {
        tags: ["wiki"],
        security,
        params: PersonContextParamsSchema,
        body: CompileKnowledgeRequestSchema,
        response: {
          201: KnowledgeSnapshotSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await compileRelationshipWiki(
        pool,
        request.auth,
        request.params.personId,
        request.params.contextId,
        request.body,
      );
      return reply
        .header("idempotent-replayed", result.replayed)
        .status(result.status)
        .send(result.body);
    },
  );

  app.get<{
    Params: { personId: string; contextId: string };
  }>(
    "/v1/people/:personId/contexts/:contextId/wiki",
    {
      preHandler: authenticate,
      schema: {
        tags: ["wiki"],
        security,
        params: PersonContextParamsSchema,
        response: {
          200: KnowledgeSnapshotSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) =>
      getRelationshipWiki(
        pool,
        request.auth,
        request.params.personId,
        request.params.contextId,
      ),
  );

  app.post<{ Body: CreateChatMediaRequest }>(
    "/v1/chat/media",
    {
      preHandler: authenticate,
      schema: {
        tags: ["chat"],
        security,
        body: CreateChatMediaRequestSchema,
        response: {
          201: ChatMediaAssetSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await createChatMediaAsset(
            pool,
            request.auth,
            chatMediaStorage,
            request.body,
          ),
        ),
  );

  app.put<{ Body: Buffer; Params: { id: string } }>(
    "/v1/chat/media/:id/content",
    {
      bodyLimit: CHAT_MEDIA_MAX_BYTES,
      preHandler: authenticate,
      schema: {
        tags: ["chat"],
        security,
        params: IdParamsSchema,
        response: {
          200: ChatMediaAssetSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) =>
      uploadChatMediaContent(
        pool,
        request.auth,
        chatMediaStorage,
        request.params.id,
        request.body,
        request.headers["content-type"]?.split(";", 1)[0]?.toLowerCase() ?? "",
      ),
  );

  app.get<{ Params: { id: string } }>(
    "/v1/chat/media/:id/content",
    {
      preHandler: authenticate,
      schema: {
        tags: ["chat"],
        security,
        params: IdParamsSchema,
        response: { "4xx": ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const stored = await getChatMediaContent(
        pool,
        request.auth,
        chatMediaStorage,
        request.params.id,
      );
      return reply
        .header("Cache-Control", "private, max-age=300")
        .header("Content-Disposition", "inline")
        .header("X-Content-Type-Options", "nosniff")
        .type(stored.contentType)
        .send(Buffer.from(stored.body));
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/v1/chat/media/:id",
    {
      preHandler: authenticate,
      schema: {
        tags: ["chat"],
        security,
        params: IdParamsSchema,
        response: {
          200: ChatMediaDeleteResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) =>
      deleteChatMediaAsset(
        pool,
        request.auth,
        chatMediaStorage,
        request.params.id,
      ),
  );

  app.post<{ Body: ChatTaskRequest }>(
    "/v1/chat/tasks",
    {
      preHandler: authenticate,
      schema: {
        tags: ["chat"],
        security,
        body: ChatTaskRequestSchema,
        response: {
          201: ChatTaskResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await createChatTask(
        pool,
        request.auth,
        request.body,
        remoteChatProvider,
        chatMediaStorage,
      );
      return reply
        .header("idempotent-replayed", result.replayed)
        .status(result.status)
        .send(result.body);
    },
  );

  app.get<{ Params: { id: string } }>(
    "/v1/chat/tasks/:id/readback",
    {
      preHandler: authenticate,
      schema: {
        tags: ["chat"],
        security,
        params: IdParamsSchema,
        response: {
          200: ChatTaskReadbackSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) =>
      getChatTaskReadback(pool, request.auth, request.params.id),
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

  app.get<{
    Querystring: { fixture_case_id?: string; capture_id?: string };
  }>(
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
    async (request) => {
      const { capture_id: captureId, fixture_case_id: fixtureCaseId } =
        request.query;
      if (Boolean(captureId) === Boolean(fixtureCaseId)) {
        throw new ApiError(
          400,
          "WORKSPACE_LOOKUP_INVALID",
          "Provide exactly one capture_id or fixture_case_id.",
        );
      }
      return getWorkspaceReview(
        pool,
        request.auth,
        captureId
          ? { captureId }
          : { fixtureCaseId: fixtureCaseId as string },
      );
    },
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

  app.get<{ Params: { id: string } }>(
    "/v1/effect-attempts/:id/reversal",
    {
      preHandler: authenticate,
      schema: {
        tags: ["effects"],
        security,
        params: IdParamsSchema,
        response: {
          200: EffectReversalPreviewSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) =>
      previewEffectReversal(pool, request.auth, request.params.id),
  );

  app.post<{
    Params: { id: string };
    Body: ApproveEffectReversalRequest;
  }>(
    "/v1/effect-attempts/:id/reversal-approvals",
    {
      preHandler: authenticate,
      schema: {
        tags: ["effects"],
        security,
        params: IdParamsSchema,
        body: ApproveEffectReversalRequestSchema,
        response: {
          201: EffectReversalApprovalResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await approveEffectReversal(
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
    Body: ExecuteEffectReversalRequest;
  }>(
    "/v1/effect-attempts/:id/reversal-executions",
    {
      preHandler: authenticate,
      schema: {
        tags: ["effects"],
        security,
        params: IdParamsSchema,
        body: ExecuteEffectReversalRequestSchema,
        response: {
          200: EffectReversalResultResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await executeEffectReversal(
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
    "/v1/effect-reversal-approvals/:id/revocation",
    {
      preHandler: authenticate,
      schema: {
        tags: ["effects"],
        security,
        params: IdParamsSchema,
        body: RevokeApprovalRequestSchema,
        response: { "4xx": ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const result = await revokeEffectReversalApproval(
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
    void runSourceLifecycleSweep(pool).catch((error: unknown) => {
      app.log.error(
        { err: error },
        "Source lifecycle sweep failed",
      );
    });
  }, config.retentionSweepIntervalMs);
  retentionSweep.unref();
  app.addHook("onClose", async () => {
    clearInterval(retentionSweep);
  });

  return app;
}
