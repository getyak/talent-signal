import {
  ErrorResponseSchema,
  McpClientGrantCreateRequestSchema,
  McpClientGrantCreateResponseSchema,
  McpClientGrantListResponseSchema,
  McpClientGrantResponseSchema,
  McpClientGrantRevokeRequestSchema,
  McpConnectionActionRequestSchema,
  McpConnectionCreateRequestSchema,
  McpConnectionListResponseSchema,
  McpConnectionResponseSchema,
  McpConnectionUpdateRequestSchema,
  McpEndpointsResponseSchema,
  type McpClientGrantCreateRequest,
  type McpClientGrantRevokeRequest,
  type McpConnectionActionRequest,
  type McpConnectionCreateRequest,
  type McpConnectionUpdateRequest,
} from "@talent-signal/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { Pool } from "pg";
import { Type } from "@sinclair/typebox";

import {
  connectMcpConnection,
  createMcpConnection,
  disconnectMcpConnection,
  inboundDependencies,
  listMcpConnections,
  updateMcpConnection,
  type McpInboundDependencies,
} from "./mcpConnections.js";
import {
  createMcpClientGrant,
  listMcpClientGrants,
  publicMcpEndpoint,
  resolveMcpGrant,
  revokeMcpClientGrant,
} from "./mcpGrants.js";
import {
  createMcpToolRegistry,
  registerMcpServerRoutes,
} from "./mcpServer.js";
import { parsePublicMcpOrigin } from "./mcpSecurity.js";

const IdParamsSchema = Type.Object(
  { id: Type.String({ format: "uuid" }) },
  { additionalProperties: false },
);

export interface McpRouteOptions {
  allowedOrigins?: string[];
  deploymentWorkspaceIds?: readonly string[] | undefined;
  inbound?: McpInboundDependencies;
  publicOrigin?: string | null;
}

export function registerMcpExtensionRoutes(
  app: FastifyInstance,
  pool: Pool,
  authenticate: preHandlerHookHandler,
  options: McpRouteOptions = {},
): void {
  const inbound = options.inbound ?? inboundDependencies();
  const publicOrigin =
    options.publicOrigin === undefined
      ? parsePublicMcpOrigin()
      : options.publicOrigin;
  const security = [{ bearerSession: [] }];
  const noStore: preHandlerHookHandler = async (_request, reply) => {
    reply.header("cache-control", "no-store");
  };

  app.get(
    "/v1/mcp/connections",
    {
      preHandler: [authenticate, noStore],
      schema: {
        security,
        tags: ["mcp"],
        response: {
          200: McpConnectionListResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) => listMcpConnections(pool, request.auth),
  );

  app.post<{ Body: McpConnectionCreateRequest }>(
    "/v1/mcp/connections",
    {
      preHandler: [authenticate, noStore],
      schema: {
        security,
        tags: ["mcp"],
        body: McpConnectionCreateRequestSchema,
        response: {
          201: McpConnectionResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(await createMcpConnection(pool, request.auth, request.body, inbound)),
  );

  app.put<{ Body: McpConnectionUpdateRequest; Params: { id: string } }>(
    "/v1/mcp/connections/:id",
    {
      preHandler: [authenticate, noStore],
      schema: {
        security,
        tags: ["mcp"],
        params: IdParamsSchema,
        body: McpConnectionUpdateRequestSchema,
        response: {
          200: McpConnectionResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) =>
      updateMcpConnection(
        pool,
        request.auth,
        request.params.id,
        request.body,
        inbound,
      ),
  );

  app.post<{ Body: McpConnectionActionRequest; Params: { id: string } }>(
    "/v1/mcp/connections/:id/connect",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      preHandler: [authenticate, noStore],
      schema: {
        security,
        tags: ["mcp"],
        params: IdParamsSchema,
        body: McpConnectionActionRequestSchema,
        response: {
          200: McpConnectionResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) =>
      connectMcpConnection(
        pool,
        request.auth,
        request.params.id,
        request.body,
        inbound,
      ),
  );

  app.post<{ Body: McpConnectionActionRequest; Params: { id: string } }>(
    "/v1/mcp/connections/:id/disconnect",
    {
      preHandler: [authenticate, noStore],
      schema: {
        security,
        tags: ["mcp"],
        params: IdParamsSchema,
        body: McpConnectionActionRequestSchema,
        response: {
          200: McpConnectionResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) =>
      disconnectMcpConnection(
        pool,
        request.auth,
        request.params.id,
        request.body,
      ),
  );

  app.get(
    "/v1/mcp/clients",
    {
      preHandler: [authenticate, noStore],
      schema: {
        security,
        tags: ["mcp"],
        response: {
          200: McpClientGrantListResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) => listMcpClientGrants(pool, request.auth),
  );

  app.post<{ Body: McpClientGrantCreateRequest }>(
    "/v1/mcp/clients",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      preHandler: [authenticate, noStore],
      schema: {
        security,
        tags: ["mcp"],
        body: McpClientGrantCreateRequestSchema,
        response: {
          201: McpClientGrantCreateResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await createMcpClientGrant(
            pool,
            request.auth,
            request.body,
            publicOrigin,
          ),
        ),
  );

  app.post<{ Body: McpClientGrantRevokeRequest; Params: { id: string } }>(
    "/v1/mcp/clients/:id/revoke",
    {
      preHandler: [authenticate, noStore],
      schema: {
        security,
        tags: ["mcp"],
        params: IdParamsSchema,
        body: McpClientGrantRevokeRequestSchema,
        response: {
          200: McpClientGrantResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request) =>
      revokeMcpClientGrant(pool, request.auth, request.params.id, request.body),
  );

  app.get(
    "/v1/mcp/endpoints",
    {
      preHandler: [authenticate, noStore],
      schema: {
        security,
        tags: ["mcp"],
        response: {
          200: McpEndpointsResponseSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async () => publicMcpEndpoint(publicOrigin),
  );

  registerMcpServerRoutes(app, {
    allowedOrigins: options.allowedOrigins ?? [],
    publicOrigin,
    resolveGrant: (authorization) =>
      resolveMcpGrant(pool, authorization, {
        ...(options.deploymentWorkspaceIds
          ? { deploymentWorkspaceIds: options.deploymentWorkspaceIds }
          : {}),
      }),
    tools: createMcpToolRegistry(pool),
  });
}
