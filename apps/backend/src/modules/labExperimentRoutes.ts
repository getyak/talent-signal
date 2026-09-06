import { resolveProductPrompt } from "@talent-signal/agent/prompt-registry";
import { CONTRACT_VERSION, LabExperimentCatalogSchema, LabExperimentRequestSchema,
  LabExperimentResponseSchema, LabExperimentReviewSchema, ErrorResponseSchema,
  type LabExperimentRequest, type LabExperiment } from "@talent-signal/contracts";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { ApiError } from "../lib/apiError.js";
import { configuredChatPrompt } from "./chatAnswerProvider.js";
import { experimentCases, LabExperimentService } from "./labExperiments.js";

export function registerLabExperimentRoutes(app: FastifyInstance, service: LabExperimentService,
  authenticate: preHandlerHookHandler, enabled: boolean) {
  const gate: preHandlerHookHandler = async () => {
    if (!enabled) throw new ApiError(403, "LAB_CAPABILITY_DENIED", "Internal experiments are disabled.");
  };
  const preHandler = [authenticate, gate];
  const security = [{ bearerSession: [] }];
  const params = Type.Object({ id: Type.String({ format: "uuid" }) });
  const response = { 200: LabExperimentResponseSchema, "4xx": ErrorResponseSchema };
  app.get("/v1/lab/experiments", { preHandler, schema: { security,
    response: { 200: LabExperimentCatalogSchema, "4xx": ErrorResponseSchema } } }, async (request) => ({
    contract_version: CONTRACT_VERSION, enabled: service.providers.size > 0,
    backend_revision: service.backendRevision, provider: "zhipu-chat-completions" as const,
    prompt_version: configuredChatPrompt("relationship", "baseline", (await resolveProductPrompt("assistant/relationship")).text).revision, models: [...service.providers.keys()],
    cases: experimentCases(), experiments: await service.list(request.auth),
  }));
  app.post<{ Body: LabExperimentRequest }>("/v1/lab/experiments", {
    preHandler, config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    schema: { security, body: LabExperimentRequestSchema,
      response: { 202: LabExperimentResponseSchema, "4xx": ErrorResponseSchema } },
  }, async (request, reply) => reply.code(202).send({ contract_version: CONTRACT_VERSION,
    experiment: await service.start(request.auth, request.body) }));
  app.get<{ Params: { id: string } }>("/v1/lab/experiments/:id", {
    preHandler, schema: { security, params, response },
  }, async (request) => ({ contract_version: CONTRACT_VERSION, experiment: await service.read(request.auth, request.params.id) }));
  app.post<{ Params: { id: string }; Body: { review: LabExperiment["review"] } }>("/v1/lab/experiments/:id/review", {
    preHandler, schema: { security, params, body: LabExperimentReviewSchema, response },
  }, async (request) => ({ contract_version: CONTRACT_VERSION,
    experiment: await service.review(request.auth, request.params.id, request.body.review) }));
  if (enabled) {
    const timer = setInterval(() => { void service.scrubExpired().catch(() => {}); }, 60_000);
    timer.unref();
    app.addHook("onClose", async () => { clearInterval(timer); });
  }
}
