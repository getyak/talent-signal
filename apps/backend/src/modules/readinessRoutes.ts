import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";

import {
  REQUIRED_SYSTEM_MIGRATIONS,
  SYSTEM_HEALTH_OBSERVATION_TIMEOUT_MS,
  boundedHealthObservation,
} from "./systemHealth.js";

const latestRequiredMigration = REQUIRED_SYSTEM_MIGRATIONS.at(-1);
if (!latestRequiredMigration) {
  throw new Error("At least one required migration must be configured.");
}

export function registerReadinessRoutes(
  app: FastifyInstance,
  pool: Pool,
  timeoutMs: number = SYSTEM_HEALTH_OBSERVATION_TIMEOUT_MS,
): void {
  app.get("/health/live", async () => ({
    status: "ok",
    service: "talent-signal-backend",
  }));

  app.get(
    "/health/ready",
    {
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute",
        },
      },
    },
    async (_request, reply) => {
      try {
        // Readiness must fail bounded too: a stalled dependency returns 503
        // within the observation budget instead of hanging deployment probes.
        const result = await boundedHealthObservation(
          pool.query<{ version: string }>(
            `SELECT version
           FROM schema_migrations
           WHERE version = ANY($1::text[])`,
            [REQUIRED_SYSTEM_MIGRATIONS],
          ),
          Date.now() + timeoutMs,
        );
        const applied = new Set(result.rows.map((row) => row.version));
        if (!REQUIRED_SYSTEM_MIGRATIONS.every((version) => applied.has(version))) {
          throw new Error("migration unavailable");
        }
        return {
          status: "ready",
          database: "ready",
          migration: latestRequiredMigration,
        };
      } catch {
        return reply.status(503).send({
          status: "not_ready",
          database: "unavailable",
        });
      }
    },
  );
}
