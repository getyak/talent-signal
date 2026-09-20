import type { Pool } from "pg";
import {
  CONTRACT_VERSION,
  type SystemHealthComponent,
  type SystemHealthResponse,
} from "@talent-signal/contracts";

/**
 * Migrations that must be present before the backend may serve workspace data.
 * This is the single source of truth shared by the scheduler-oriented readiness
 * probe and the authenticated system-health read. Do not duplicate the list.
 */
export const REQUIRED_MIGRATIONS = [
  "065_screenshot_directory_authority",
  "058_account_management",
  "069_account_access_event_details",
] as const;

/**
 * Integrations this in-product request-path check deliberately does not probe.
 * Naming them here keeps the honest boundary visible to the operator and to the
 * Web notice: absence from the ledger is not evidence of health.
 */
export const SYSTEM_HEALTH_NOT_PROBED = [
  "external_model_providers",
  "opik",
  "browser_executor",
  "tailscale",
  "person_research",
] as const;

export interface ReadinessResult {
  ready: boolean;
  database: "ready" | "unavailable";
  requiredMigrations: readonly string[];
  missingMigrations: readonly string[];
}

interface MigrationRow {
  version: string;
}

const unavailableDatabase: ReadinessResult = {
  ready: false,
  database: "unavailable",
  requiredMigrations: REQUIRED_MIGRATIONS,
  missingMigrations: REQUIRED_MIGRATIONS,
};

/**
 * The one readiness implementation. It answers whether PostgreSQL is reachable
 * and every required migration has been applied. It never returns raw driver
 * errors, hosts, credentials, or migration SQL.
 */
export async function checkReadiness(pool: Pool): Promise<ReadinessResult> {
  let rows: MigrationRow[];
  try {
    const result = await pool.query<MigrationRow>(
      `SELECT version
       FROM schema_migrations
       WHERE version = ANY($1::text[])`,
      [REQUIRED_MIGRATIONS],
    );
    rows = result.rows;
  } catch {
    return unavailableDatabase;
  }
  const present = new Set(rows.map((row) => row.version));
  const missingMigrations = REQUIRED_MIGRATIONS.filter(
    (version) => !present.has(version),
  );
  return {
    ready: missingMigrations.length === 0,
    database: "ready",
    requiredMigrations: REQUIRED_MIGRATIONS,
    missingMigrations,
  };
}

function component(
  status: SystemHealthComponent["status"],
  required: boolean,
  detail: string | null,
  observedAt: string,
  durationMs: number | null,
): SystemHealthComponent {
  return {
    status,
    required,
    detail,
    observed_at: observedAt,
    duration_ms: durationMs,
  };
}

function aggregate(
  components: SystemHealthResponse["components"],
): SystemHealthResponse["status"] {
  const required = Object.values(components).filter((entry) => entry.required);
  if (required.some((entry) => entry.status === "unavailable")) {
    return "unavailable";
  }
  if (required.some((entry) => entry.status === "degraded")) {
    return "degraded";
  }
  return "healthy";
}

/**
 * Builds the authenticated system-health read. `api` reflects this process,
 * `postgres` reflects connectivity, and `migrations` reflects required
 * readiness. Results are derived from the shared readiness probe so the cheap
 * `/health/live` and scheduler `/health/ready` contracts stay unchanged.
 */
export async function loadSystemHealth(
  pool: Pool,
  options: { now?: () => number } = {},
): Promise<SystemHealthResponse> {
  const now = options.now ?? (() => Date.now());
  const startedAt = now();
  const checkedAt = new Date(startedAt).toISOString();

  const readinessStartedAt = now();
  const readiness = await checkReadiness(pool);
  const readinessDuration = Math.max(0, now() - readinessStartedAt);
  const readinessObservedAt = new Date(now()).toISOString();

  const databaseStatus: SystemHealthComponent["status"] =
    readiness.database === "ready" ? "ok" : "unavailable";
  const migrationStatus: SystemHealthComponent["status"] =
    readiness.database === "unavailable"
      ? "unavailable"
      : readiness.ready
        ? "ok"
        : "degraded";

  const components: SystemHealthResponse["components"] = {
    web: component(
      "not_probed",
      false,
      "Web presence is reported by the BFF caller, not this backend process.",
      null,
      null,
    ),
    backend_api: component(
      "ok",
      true,
      "The backend process answered this request.",
      checkedAt,
      0,
    ),
    backend_readiness: component(
      readiness.ready ? "ok" : "unavailable",
      true,
      readiness.ready
        ? "All required migrations are applied."
        : "Required migrations are not all applied.",
      readinessObservedAt,
      readinessDuration,
    ),
    postgres: component(
      databaseStatus,
      true,
      databaseStatus === "ok"
        ? "PostgreSQL answered the readiness query."
        : "PostgreSQL is not reachable for the readiness query.",
      readinessObservedAt,
      readinessDuration,
    ),
    migrations: component(
      migrationStatus,
      true,
      migrationStatus === "ok"
        ? "Every required migration is applied."
        : migrationStatus === "degraded"
          ? `${readiness.missingMigrations.length} required migration(s) not observed.`
          : "Migration readiness could not be established.",
      migrationStatus === "unavailable" ? null : readinessObservedAt,
      migrationStatus === "unavailable" ? null : readinessDuration,
    ),
  };

  return {
    contract_version: CONTRACT_VERSION,
    status: aggregate(components),
    checked_at: checkedAt,
    duration_ms: Math.max(0, now() - startedAt),
    components,
    not_probed: [...SYSTEM_HEALTH_NOT_PROBED],
  };
}
