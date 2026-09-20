import {
  AccountOnboardingMutationSchema,
  AccountOnboardingPreviewRequestSchema,
  AccountOnboardingPreviewSchema,
  AccountOnboardingSchema,
  ErrorResponseSchema,
  type AccountOnboardingMutation,
  type AccountOnboardingPreviewRequest,
} from "@talent-signal/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { Pool } from "pg";

import {
  mutateAccountOnboarding,
  previewAccountOnboardingProfile,
  readAccountOnboarding,
} from "./accountOnboarding.js";

export function registerAccountOnboarding(
  app: FastifyInstance,
  pool: Pool,
  authenticate: preHandlerHookHandler,
): void {
  const security = [{ bearerSession: [] }];
  const response = { 200: AccountOnboardingSchema, "4xx": ErrorResponseSchema };

  app.get(
    "/v1/account/onboarding",
    {
      preHandler: authenticate,
      schema: { tags: ["account"], security, response },
    },
    async (request, reply) => {
      reply.header("cache-control", "private, no-store");
      return readAccountOnboarding(pool, request.auth);
    },
  );

  app.post<{ Body: AccountOnboardingMutation }>(
    "/v1/account/onboarding",
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        tags: ["account"],
        security,
        body: AccountOnboardingMutationSchema,
        response,
      },
    },
    async (request, reply) => {
      reply.header("cache-control", "private, no-store");
      return mutateAccountOnboarding(pool, request.auth, request.body);
    },
  );

  app.post<{ Body: AccountOnboardingPreviewRequest }>(
    "/v1/account/onboarding/preview",
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags: ["account"],
        security,
        body: AccountOnboardingPreviewRequestSchema,
        response: {
          200: AccountOnboardingPreviewSchema,
          "4xx": ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header("cache-control", "private, no-store");
      return previewAccountOnboardingProfile(request.body.url);
    },
  );
}
