import {
  CONTRACT_VERSION,
  ErrorResponseSchema,
  SystemHealthResponseSchema,
  type SystemHealthComponent,
  type SystemHealthResponse,
} from "@talent-signal/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { Pool } from "pg";

export const REQUIRED_SYSTEM_MIGRATIONS = [
  "058_account_management",
  "065_screenshot_directory_authority",
  "069_account_access_event_details",
  "070_meeting_drafts",
  "071_agent_session_list_snapshots",
  "072_mcp_extensions",
] as const;

function elapsedMilliseconds(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function component(
  value: Omit<SystemHealthComponent, "required">,
): SystemHealthComponent {
  return { ...value, required: true };
}

export async function observeSystemHealth(
  pool: Pick<Pool, "query">,
  now: () => Date = () => new Date(),
): Promise<SystemHealthResponse> {
  const components: SystemHealthComponent[] = [
    component({
      id: "backend",
      label: "Backend API",
      kind: "service",
      status: "healthy",
      duration_ms: 0,
      detail_code: "request_completed",
    }),
  ];

  const databaseStartedAt = performance.now();
  try {
    await pool.query("SELECT 1 AS system_health_ready");
    components.push(
      component({
        id: "database",
        label: "PostgreSQL",
        kind: "database",
        status: "healthy",
        duration_ms: elapsedMilliseconds(databaseStartedAt),
        detail_code: "query_completed",
      }),
    );
  } catch {
    components.push(
      component({
        id: "database",
        label: "PostgreSQL",
        kind: "database",
        status: "unavailable",
        duration_ms: elapsedMilliseconds(databaseStartedAt),
        detail_code: "dependency_unreachable",
      }),
      component({
        id: "migrations",
        label: "Database schema",
        kind: "schema",
        status: "unknown",
        duration_ms: null,
        detail_code: "not_observed",
      }),
    );
    return {
      contract_version: CONTRACT_VERSION,
      schema_version: "system-health.v1",
      status: "unavailable",
      observed_at: now().toISOString(),
      components,
    };
  }

  const migrationsStartedAt = performance.now();
  try {
    const result = await pool.query<{ version: string }>(
      `SELECT version
       FROM schema_migrations
       WHERE version = ANY($1::text[])`,
      [REQUIRED_SYSTEM_MIGRATIONS],
    );
    const applied = new Set(result.rows.map((row) => row.version));
    const complete = REQUIRED_SYSTEM_MIGRATIONS.every((version) =>
      applied.has(version),
    );
    components.push(
      component({
        id: "migrations",
        label: "Database schema",
        kind: "schema",
        status: complete ? "healthy" : "degraded",
        duration_ms: elapsedMilliseconds(migrationsStartedAt),
        detail_code: complete
          ? "required_migrations_applied"
          : "required_migrations_missing",
      }),
    );
    return {
      contract_version: CONTRACT_VERSION,
      schema_version: "system-health.v1",
      status: complete ? "healthy" : "degraded",
      observed_at: now().toISOString(),
      components,
    };
  } catch {
    components.push(
      component({
        id: "migrations",
        label: "Database schema",
        kind: "schema",
        status: "unavailable",
        duration_ms: elapsedMilliseconds(migrationsStartedAt),
        detail_code: "dependency_unreachable",
      }),
    );
    return {
      contract_version: CONTRACT_VERSION,
      schema_version: "system-health.v1",
      status: "unavailable",
      observed_at: now().toISOString(),
      components,
    };
  }
}

export function registerSystemHealthRoutes(
  app: FastifyInstance,
  pool: Pool,
  authenticate: preHandlerHookHandler,
): void {
  app.get(
    "/v1/system/health",
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        tags: ["operations"],
        security: [{ bearerSession: [] }],
        response: {
          200: SystemHealthResponseSchema,
          "4xx": ErrorResponseSchema,
          "5xx": ErrorResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      reply.header("cache-control", "private, no-store");
      reply.header("pragma", "no-cache");
      reply.header("vary", "authorization");
      return observeSystemHealth(pool);
    },
  );
}
