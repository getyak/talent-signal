import { Type, type Static } from "@sinclair/typebox";
import { CONTRACT_VERSION } from "./constants.js";

const Time = Type.String({ format: "date-time" });

/**
 * Observed status for one probe. `not_probed` is deliberately distinct from
 * `unavailable`: this in-product request-path check does not prove the health
 * of an integration it never contacts.
 */
const ComponentStatus = Type.Union([
  Type.Literal("ok"),
  Type.Literal("degraded"),
  Type.Literal("unavailable"),
  Type.Literal("not_probed"),
]);

const Component = Type.Object(
  {
    status: ComponentStatus,
    required: Type.Boolean(),
    detail: Type.Union([Type.String({ maxLength: 200 }), Type.Null()]),
    observed_at: Type.Union([Time, Type.Null()]),
    duration_ms: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
  },
  { additionalProperties: false },
);

export const SYSTEM_HEALTH_COMPONENT_IDS = [
  "web",
  "backend_api",
  "backend_readiness",
  "postgres",
  "migrations",
] as const;

export const SYSTEM_HEALTH_OVERALL_STATUSES = [
  "healthy",
  "degraded",
  "unavailable",
] as const;

export const SystemHealthResponseSchema = Type.Object(
  {
    contract_version: Type.Literal(CONTRACT_VERSION),
    status: Type.Union([
      Type.Literal("healthy"),
      Type.Literal("degraded"),
      Type.Literal("unavailable"),
    ]),
    checked_at: Time,
    duration_ms: Type.Number({ minimum: 0 }),
    components: Type.Object(
      {
        web: Component,
        backend_api: Component,
        backend_readiness: Component,
        postgres: Component,
        migrations: Component,
      },
      { additionalProperties: false },
    ),
    /**
     * Integrations this in-product request-path check deliberately does not
     * contact. Presence here is not evidence that the integration is healthy.
     */
    not_probed: Type.Array(Type.String({ minLength: 1, maxLength: 80 })),
  },
  { additionalProperties: false },
);

export type SystemHealthResponse = Static<typeof SystemHealthResponseSchema>;
export type SystemHealthComponent = Static<typeof Component>;
export type SystemHealthComponentId = (typeof SYSTEM_HEALTH_COMPONENT_IDS)[number];
export type SystemHealthOverallStatus = (typeof SYSTEM_HEALTH_OVERALL_STATUSES)[number];
