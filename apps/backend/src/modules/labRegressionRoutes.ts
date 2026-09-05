import { Type } from "@sinclair/typebox";
import { CONTRACT_VERSION, ErrorResponseSchema, LabRegressionDeletionSchema, LabRegressionExportSchema,
  LabRegressionListSchema, LabRegressionRequestSchema, LabRegressionResponseSchema, LabCIRequestSchema, LabCIReceiptSchema,
  type LabRegressionRequest, type LabCIRequest } from "@talent-signal/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { LabRegressionService } from "./labRegressions.js";
import type { LabCIVerificationService } from "./labCIVerifications.js";

export function registerLabRegressionRoutes(app: FastifyInstance, service: LabRegressionService, preHandler: preHandlerHookHandler[], ci: LabCIVerificationService) {
  const security = [{ bearerSession: [] }], params = Type.Object({ id: Type.String({ format: "uuid" }) });
  const response = { 200: LabRegressionResponseSchema, "4xx": ErrorResponseSchema };
  const ciResponse = { 200: Type.Object({ contract_version: Type.Literal(CONTRACT_VERSION), verification: LabCIReceiptSchema }, { additionalProperties: false }), "4xx": ErrorResponseSchema, 503: ErrorResponseSchema };
  app.post<{ Params: { id: string }; Body: LabCIRequest }>("/v1/lab/regressions/:id/ci-verifications", { preHandler,
    config: { rateLimit: { max: 5, timeWindow: "15 minutes" } }, schema: { security, params, body: LabCIRequestSchema, response: ciResponse } },
    async (request) => ({ contract_version: CONTRACT_VERSION, verification: await ci.verify(request.auth, request.params.id, request.body) }));
  app.get<{ Params: { id: string; verificationId: string } }>("/v1/lab/regressions/:id/ci-verifications/:verificationId", { preHandler,
    schema: { security, params: Type.Object({ ...params.properties, verificationId: Type.String({ format: "uuid" }) }), response: ciResponse } },
    async (request) => ({ contract_version: CONTRACT_VERSION, verification: await ci.read(request.auth, request.params.id, request.params.verificationId) }));
  app.get("/v1/lab/regressions", { preHandler, schema: { security, response: { 200: LabRegressionListSchema, "4xx": ErrorResponseSchema } } },
    async (request) => ({ contract_version: CONTRACT_VERSION, regressions: await service.list(request.auth) }));
  app.post<{ Body: LabRegressionRequest }>("/v1/lab/regressions", { preHandler,
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } }, schema: { security, body: LabRegressionRequestSchema, response } },
    async (request) => ({ contract_version: CONTRACT_VERSION, regression: await service.save(request.auth, request.body) }));
  app.get<{ Params: { id: string } }>("/v1/lab/regressions/:id", { preHandler, schema: { security, params, response } },
    async (request) => ({ contract_version: CONTRACT_VERSION, regression: await service.read(request.auth, request.params.id) }));
  app.delete<{ Params: { id: string } }>("/v1/lab/regressions/:id", { preHandler, schema: { security, params, response: { 200: LabRegressionDeletionSchema, "4xx": ErrorResponseSchema } } },
    async (request) => service.remove(request.auth, request.params.id));
  app.get<{ Params: { id: string } }>("/v1/lab/regressions/:id/export", { preHandler, schema: { security, params, response: { 200: LabRegressionExportSchema, "4xx": ErrorResponseSchema } } },
    async (request, reply) => {
      const { id, content_hash, snapshot, created_at, expires_at } = await service.read(request.auth, request.params.id);
      reply.header("content-disposition", `attachment; filename="lab-regression-${id}.json"`);
      return { schema_version: "lab-regression-bundle.v1", execution_authority: "none", id, content_hash, snapshot, created_at, expires_at };
    });
}
