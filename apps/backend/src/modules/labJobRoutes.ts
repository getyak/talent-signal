import { Type } from "@sinclair/typebox";
import { CONTRACT_VERSION, ErrorResponseSchema, LabJobCatalogSchema, LabJobRequestSchema, LabJobResponseSchema, LabJobReviewSchema,
  type LabJobRequest, type LabJobReview } from "@talent-signal/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { ApiError } from "../lib/apiError.js";
import { LabExperimentJobService } from "./labExperimentJobs.js";
import { labJobCases } from "./labJobCases.js";
import { LabRegressionService } from "./labRegressions.js";
import { registerLabRegressionRoutes } from "./labRegressionRoutes.js";
import { LabCIVerificationService } from "./labCIVerifications.js";
import type { LabCIVerifying } from "./labCIVerifier.js";

export function registerLabJobRoutes(app: FastifyInstance, service: LabExperimentJobService,
  authenticate: preHandlerHookHandler, enabled: boolean, workerEnabled = true, ciVerifier: LabCIVerifying | null = null) {
  const gate: preHandlerHookHandler = async (_request, reply) => {
    reply.header("cache-control", "no-store");
    if (!enabled) throw new ApiError(403, "LAB_CAPABILITY_DENIED", "Internal experiment batches are disabled.");
  };
  const preHandler = [authenticate, gate];
  const ci = new LabCIVerificationService(service.pool, service, ciVerifier);
  registerLabRegressionRoutes(app, new LabRegressionService(service.pool, service, ci), preHandler, ci);
  const security = [{ bearerSession: [] }];
  const params = Type.Object({ id: Type.String({ format: "uuid" }) });
  const response = { 200: LabJobResponseSchema, "4xx": ErrorResponseSchema };
  app.get("/v1/lab/experiment-jobs", { preHandler, schema: { security, response: { 200: LabJobCatalogSchema, "4xx": ErrorResponseSchema } } }, async (request) => ({
    contract_version: CONTRACT_VERSION, catalog_revision: service.catalogRevision, enabled: service.models.length > 0, cases: labJobCases(), models: service.models,
    jobs: await service.list(request.auth), daily_call_limit: service.dailyCallLimit, daily_calls_reserved: await service.dailyCalls(request.auth),
  }));
  app.post<{ Body: LabJobRequest }>("/v1/lab/experiment-jobs", { preHandler,
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    schema: { security, body: LabJobRequestSchema, response: { 202: LabJobResponseSchema, "4xx": ErrorResponseSchema } },
  }, async (request, reply) => reply.code(202).send({ contract_version: CONTRACT_VERSION, job: await service.start(request.auth, request.body) }));
  app.get<{ Params: { id: string } }>("/v1/lab/experiment-jobs/:id", { preHandler, schema: { security, params, response } },
    async (request) => ({ contract_version: CONTRACT_VERSION, job: await service.read(request.auth, request.params.id) }));
  app.post<{ Params: { id: string } }>("/v1/lab/experiment-jobs/:id/cancel", { preHandler, schema: { security, params, response } },
    async (request) => ({ contract_version: CONTRACT_VERSION, job: await service.cancel(request.auth, request.params.id) }));
  app.post<{ Params: { id: string }; Body: LabJobReview }>("/v1/lab/experiment-jobs/:id/review", { preHandler, schema: { security, params, body: LabJobReviewSchema, response } },
    async (request) => ({ contract_version: CONTRACT_VERSION, job: await service.review(request.auth, request.params.id, request.body) }));
  if (enabled && workerEnabled) app.addHook("onReady", async () => { service.startWorker(); });
  app.addHook("onClose", async () => { await service.close(); });
}
