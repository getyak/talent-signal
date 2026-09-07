import { Type } from "@sinclair/typebox";
import {
  CONTRACT_VERSION, ErrorResponseSchema, FeedbackMutationSchema, FeedbackResponseSchema,
  FeedbackSourceResponseSchema, FeedbackRecordSchema, FeedbackObservationRequestSchema, FeedbackObservationResponseSchema,
  type FeedbackMutation, type FeedbackObservationRequest,
} from "@talent-signal/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { Pool } from "pg";
import { FeedbackService } from "./feedback.js";

export function registerFeedbackRoutes(app: FastifyInstance, pool: Pool, authenticate: preHandlerHookHandler): void {
  const service = new FeedbackService(pool);
  const noStore: preHandlerHookHandler = async (_request, reply) => { reply.header("cache-control", "no-store"); };
  const preHandler = [authenticate, noStore];
  const security = [{ bearerSession: [] }];
  const id = Type.String({ format: "uuid" });
  const params = Type.Object({ id }, { additionalProperties: false });
  const response = { 200: FeedbackResponseSchema, "4xx": ErrorResponseSchema };
  const turnParams = Type.Object({ sessionID: id, turnID: id }, { additionalProperties: false });
  app.get<{ Params: { sessionID: string; turnID: string } }>("/v1/agent-sessions/:sessionID/turns/:turnID/feedback-source", {
    preHandler, schema: { security, params: turnParams, response: { 200: FeedbackSourceResponseSchema, "4xx": ErrorResponseSchema } },
  }, async (request) => ({ contract_version: CONTRACT_VERSION, source: await service.source(request.auth, request.params.sessionID, request.params.turnID) }));
  app.get<{ Params: { sessionID: string; turnID: string } }>("/v1/agent-sessions/:sessionID/turns/:turnID/feedback", {
    preHandler, schema: { security, params: turnParams, response: { 200: Type.Object({ contract_version: Type.Literal(CONTRACT_VERSION),
      feedback: Type.Array(FeedbackRecordSchema) }, { additionalProperties: false }), "4xx": ErrorResponseSchema } },
  }, async (request) => ({ contract_version: CONTRACT_VERSION, feedback: await service.list(request.auth, request.params.sessionID, request.params.turnID) }));
  app.put<{ Params: { id: string }; Body: FeedbackMutation }>("/v1/feedback/:id", {
    preHandler, config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    schema: { security, params, body: FeedbackMutationSchema, response },
  }, async (request) => ({ contract_version: CONTRACT_VERSION, feedback: await service.mutate(request.auth, request.params.id, request.body) }));
  app.get<{ Params: { id: string } }>("/v1/feedback/:id", { preHandler, schema: { security, params, response } },
    async (request) => ({ contract_version: CONTRACT_VERSION, feedback: await service.read(request.auth, request.params.id) }));
  app.post<{ Params: { id: string }; Body: FeedbackObservationRequest }>("/v1/feedback/:id/observations", {
    preHandler, schema: { security, params, body: FeedbackObservationRequestSchema,
      response: { 200: FeedbackObservationResponseSchema, "4xx": ErrorResponseSchema } },
  }, async (request) => ({ contract_version: CONTRACT_VERSION, observation: await service.observe(request.auth, request.params.id, request.body) }));
  app.get<{ Params: { id: string; observationID: string } }>("/v1/feedback/:id/observations/:observationID", {
    preHandler, schema: { security, params: Type.Object({ id, observationID: id }, { additionalProperties: false }),
      response: { 200: FeedbackObservationResponseSchema, "4xx": ErrorResponseSchema } },
  }, async (request) => ({ contract_version: CONTRACT_VERSION, observation: await service.readObservation(request.auth, request.params.id, request.params.observationID) }));
  const timer = setInterval(() => { void service.sweep().catch(() => {}); }, 60_000);
  timer.unref();
  app.addHook("onClose", async () => clearInterval(timer));
}
