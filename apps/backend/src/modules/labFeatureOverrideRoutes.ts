import { Type } from "@sinclair/typebox";
import {
  CONTRACT_VERSION,
  ErrorResponseSchema,
  LabFeatureConfigurationSchema,
  LabFeatureOverrideRequestSchema,
  LabFeatureOverrideResponseSchema,
  type LabFeatureOverrideRequest,
} from "@talent-signal/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { ApiError } from "../lib/apiError.js";
import type { LabFeatureOverrideService } from "./labFeatureOverrides.js";

export function registerLabFeatureOverrideRoutes(app: FastifyInstance, service: LabFeatureOverrideService,
  authenticate: preHandlerHookHandler, enabled: boolean) {
  const gate: preHandlerHookHandler = async () => {
    if (!enabled) throw new ApiError(403, "LAB_CAPABILITY_DENIED", "Internal feature overrides are disabled.");
  };
  const preHandler = [authenticate, gate];
  const security = [{ bearerSession: [] }];
  app.get("/v1/lab/feature-configuration", { preHandler,
    schema: { security, response: { 200: LabFeatureConfigurationSchema, "4xx": ErrorResponseSchema } },
  }, async (request, reply) => {
    reply.header("cache-control", "no-store");
    return service.configuration(request.auth, true);
  });
  app.post<{ Body: LabFeatureOverrideRequest }>("/v1/lab/feature-overrides", {
    preHandler, config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    schema: { security, body: LabFeatureOverrideRequestSchema,
      response: { 200: LabFeatureOverrideResponseSchema, "4xx": ErrorResponseSchema } },
  }, async (request, reply) => {
    reply.header("cache-control", "no-store");
    return { contract_version: CONTRACT_VERSION, override: await service.start(request.auth, request.body) };
  });
  app.get<{ Params: { id: string } }>("/v1/lab/feature-overrides/:id", { preHandler,
    schema: { security, params: Type.Object({ id: Type.String({ format: "uuid" }) }),
      response: { 200: LabFeatureOverrideResponseSchema, "4xx": ErrorResponseSchema } },
  }, async (request, reply) => {
    reply.header("cache-control", "no-store");
    return { contract_version: CONTRACT_VERSION, override: await service.read(request.auth, request.params.id) };
  });
  app.post<{ Params: { id: string } }>("/v1/lab/feature-overrides/:id/stop", { preHandler,
    schema: { security, params: Type.Object({ id: Type.String({ format: "uuid" }) }),
      response: { 200: LabFeatureOverrideResponseSchema, "4xx": ErrorResponseSchema } },
  }, async (request, reply) => {
    reply.header("cache-control", "no-store");
    return { contract_version: CONTRACT_VERSION, override: await service.stop(request.auth, request.params.id) };
  });
  if (enabled) {
    const timer = setInterval(() => { void service.scrubExpired().catch(() => {}); }, 60_000);
    timer.unref(); app.addHook("onClose", async () => { clearInterval(timer); });
  }
}
