import { Type, type Static } from "@sinclair/typebox";

import { CONTRACT_VERSION } from "./constants.js";

export const SystemHealthStatusSchema = Type.Union([
  Type.Literal("healthy"),
  Type.Literal("degraded"),
  Type.Literal("unavailable"),
  Type.Literal("unknown"),
]);

export const SystemHealthComponentSchema = Type.Object(
  {
    id: Type.Union([
      Type.Literal("web"),
      Type.Literal("backend"),
      Type.Literal("database"),
      Type.Literal("migrations"),
    ]),
    label: Type.String({ minLength: 1, maxLength: 80 }),
    kind: Type.Union([
      Type.Literal("service"),
      Type.Literal("database"),
      Type.Literal("schema"),
    ]),
    required: Type.Boolean(),
    status: SystemHealthStatusSchema,
    duration_ms: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
    detail_code: Type.Union([
      Type.Literal("request_completed"),
      Type.Literal("query_completed"),
      Type.Literal("required_migrations_applied"),
      Type.Literal("required_migrations_missing"),
      Type.Literal("dependency_unreachable"),
      Type.Literal("not_observed"),
    ]),
  },
  { additionalProperties: false },
);

export const SystemHealthResponseSchema = Type.Object(
  {
    contract_version: Type.Literal(CONTRACT_VERSION),
    schema_version: Type.Literal("system-health.v1"),
    status: Type.Union([
      Type.Literal("healthy"),
      Type.Literal("degraded"),
      Type.Literal("unavailable"),
    ]),
    observed_at: Type.String({ format: "date-time" }),
    components: Type.Array(SystemHealthComponentSchema, {
      minItems: 1,
      maxItems: 4,
    }),
  },
  { additionalProperties: false },
);

export type SystemHealthStatus = Static<typeof SystemHealthStatusSchema>;
export type SystemHealthComponent = Static<typeof SystemHealthComponentSchema>;
export type SystemHealthResponse = Static<typeof SystemHealthResponseSchema>;
