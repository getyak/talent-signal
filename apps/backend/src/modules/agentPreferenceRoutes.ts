import { AgentPreferenceMutationSchema, AgentPreferenceResponseSchema, ErrorResponseSchema, type AgentPreferenceMutation } from "@talent-signal/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { Pool } from "pg";
import { readAgentPreference, saveAgentPreference } from "./agentPreferences.js";
import { ApiError } from "../lib/apiError.js";

export function registerAgentPreferenceRoutes(app: FastifyInstance, pool: Pool, authenticate: preHandlerHookHandler, enabled: boolean): void {
  const preHandler = [authenticate, async () => {
    if (!enabled) throw new ApiError(503, "AGENT_PREFERENCES_UNAVAILABLE", "Reply preferences are not enabled for this workspace yet.");
  }];
  const response = { 200: AgentPreferenceResponseSchema, "4xx": ErrorResponseSchema, "5xx": ErrorResponseSchema };
  const security = [{ bearerSession: [] }];
  app.get("/v1/agent/preferences", { preHandler, schema: { security, response } }, async (request, reply) => {
    reply.header("cache-control", "no-store");
    return readAgentPreference(pool, request.auth);
  });
  app.put<{ Body: AgentPreferenceMutation }>("/v1/agent/preferences", { preHandler, bodyLimit: 4096,
    schema: { security, body: AgentPreferenceMutationSchema, response } }, async (request, reply) => {
    reply.header("cache-control", "no-store");
    return saveAgentPreference(pool, request.auth, request.body);
  });
}
