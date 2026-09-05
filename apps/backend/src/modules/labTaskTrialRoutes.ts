import { Type } from "@sinclair/typebox";
import { CONTRACT_VERSION, ErrorResponseSchema, LabTaskConfigurationSchema, LabTaskTrialRequestSchema,
  LabTaskTrialResponseSchema, type LabTaskTrialRequest } from "@talent-signal/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { ApiError } from "../lib/apiError.js";
import type { LabTaskTrialService } from "./labTaskTrials.js";

export function registerLabTaskTrialRoutes(app: FastifyInstance, service: LabTaskTrialService,
  authenticate: preHandlerHookHandler, enabled: boolean) {
  const gate: preHandlerHookHandler = async () => {
    if (!enabled) throw new ApiError(403, "LAB_CAPABILITY_DENIED", "Internal task configuration is disabled.");
  };
  const preHandler = [authenticate, gate];
  const security = [{ bearerSession: [] }];
  app.get("/v1/lab/task-configuration", { preHandler,
    schema: { security, response: { 200: LabTaskConfigurationSchema, "4xx": ErrorResponseSchema } },
  }, async (request, reply) => {
    reply.header("cache-control", "no-store");
    return { session_scope_id: service.sessionScope(request.auth), contract_version: CONTRACT_VERSION, enabled: service.providers.size > 0,
      backend_revision: service.backendRevision, tasks: service.tasks, ...await service.list(request.auth) };
  });
  app.post<{ Body: LabTaskTrialRequest }>("/v1/lab/task-trials", {
    preHandler, config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    schema: { security, body: LabTaskTrialRequestSchema, response: { 200: LabTaskTrialResponseSchema, "4xx": ErrorResponseSchema } },
  }, async (request, reply) => {
    reply.header("cache-control", "no-store");
    return { contract_version: CONTRACT_VERSION, trial: await service.start(request.auth, request.body) };
  });
  app.get<{ Params: { id: string } }>("/v1/lab/task-trials/:id", { preHandler,
    schema: { security, params: Type.Object({ id: Type.String({ format: "uuid" }) }),
      response: { 200: LabTaskTrialResponseSchema, "4xx": ErrorResponseSchema } },
  }, async (request, reply) => {
    reply.header("cache-control", "no-store");
    return { contract_version: CONTRACT_VERSION, trial: await service.read(request.auth, request.params.id) };
  });
  app.post<{ Params: { id: string } }>("/v1/lab/task-trials/:id/stop", { preHandler,
    schema: { security, params: Type.Object({ id: Type.String({ format: "uuid" }) }),
      response: { 200: LabTaskTrialResponseSchema, "4xx": ErrorResponseSchema } },
  }, async (request, reply) => {
    reply.header("cache-control", "no-store");
    return { contract_version: CONTRACT_VERSION, trial: await service.stop(request.auth, request.params.id) };
  });
  if (enabled) {
    const timer = setInterval(() => { void service.scrubExpired().catch(() => {}); }, 60_000);
    timer.unref(); app.addHook("onClose", async () => { clearInterval(timer); });
  }
}
