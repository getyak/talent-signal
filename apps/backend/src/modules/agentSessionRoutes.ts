import { Type } from "@sinclair/typebox";
import {
  AgentSessionMutationRequestSchema,
  AgentSessionDeleteRequestSchema,
  AgentSessionResponseSchema,
  AgentSessionListResponseSchema,
  ErrorResponseSchema,
  CONTRACT_VERSION,
  type AgentSessionMutationRequest,
  type AgentSessionDeleteRequest,
} from "@talent-signal/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { Pool } from "pg";
import {
  getAgentSession,
  listAgentSessions,
  mutateAgentSession,
  sweepAgentSessions,
} from "./agentSessions.js";
export function registerAgentSessionRoutes(
  app: FastifyInstance,
  pool: Pool,
  authenticate: preHandlerHookHandler,
) {
  const common = {
    preHandler: authenticate,
    schema: { security: [{ bearerSession: [] }], tags: ["agent-sessions"] },
  };
  const params = Type.Object(
    { id: Type.String({ format: "uuid" }) },
    { additionalProperties: false },
  );
  app.get<{ Querystring: { after?: string; limit?: string } }>(
    "/v1/agent-sessions",
    {
      ...common,
      schema: {
        ...common.schema,
        querystring: Type.Object(
          {
            after: Type.Optional(Type.String({ format: "uuid" })),
            limit: Type.Optional(
              Type.String({ pattern: "^(?:[1-9]|[1-4][0-9]|50)$" }),
            ),
          },
          { additionalProperties: false },
        ),
        response: {
          200: AgentSessionListResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      return listAgentSessions(
        pool,
        request.auth,
        request.query.after,
        Number(request.query.limit ?? 50),
      );
    },
  );
  app.get<{ Params: { id: string } }>(
    "/v1/agent-sessions/:id",
    {
      ...common,
      schema: {
        ...common.schema,
        params,
        response: {
          200: AgentSessionResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      return {
        contract_version: CONTRACT_VERSION,
        session: await getAgentSession(pool, request.auth, request.params.id),
      };
    },
  );
  app.put<{ Params: { id: string }; Body: AgentSessionMutationRequest }>(
    "/v1/agent-sessions/:id",
    {
      ...common,
      bodyLimit: 250 * 1024,
      schema: {
        ...common.schema,
        params,
        body: AgentSessionMutationRequestSchema,
        response: {
          200: AgentSessionResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      return {
        contract_version: CONTRACT_VERSION,
        session: await mutateAgentSession(
          pool,
          request.auth,
          request.params.id,
          request.body,
        ),
      };
    },
  );
  app.delete<{ Params: { id: string }; Body: AgentSessionDeleteRequest }>(
    "/v1/agent-sessions/:id",
    {
      ...common,
      schema: {
        ...common.schema,
        params,
        body: AgentSessionDeleteRequestSchema,
        response: {
          200: AgentSessionResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      return {
        contract_version: CONTRACT_VERSION,
        session: await mutateAgentSession(
          pool,
          request.auth,
          request.params.id,
          request.body,
          true,
        ),
      };
    },
  );
  const timer = setInterval(() => {
    void sweepAgentSessions(pool).catch((error) =>
      app.log.error({ err: error }, "Session retention sweep failed"),
    );
  }, 60_000);
  timer.unref();
  app.addHook("onClose", async () => clearInterval(timer));
}
