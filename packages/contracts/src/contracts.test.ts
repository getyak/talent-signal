import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";

import {
  SYSTEM_HEALTH_COMPONENT_IDS,
  SystemHealthResponseSchema,
  type SystemHealthResponse,
} from "./systemHealthSchemas.js";
import { CONTRACT_VERSION } from "./constants.js";

function healthy(): SystemHealthResponse {
  const component = {
    status: "ok" as const,
    required: true,
    detail: null,
    observed_at: "2026-09-14T00:00:00.000Z",
    duration_ms: 4,
  };
  return {
    contract_version: CONTRACT_VERSION,
    status: "healthy",
    checked_at: "2026-09-14T00:00:00.000Z",
    duration_ms: 12,
    components: {
      web: { ...component, required: false },
      backend_api: component,
      backend_readiness: component,
      postgres: component,
      migrations: component,
    },
    not_probed: ["external_model_providers"],
  };
}

describe("system health contract", () => {
  it("accepts a complete healthy payload", () => {
    expect(Value.Check(SystemHealthResponseSchema, healthy())).toBe(true);
  });

  it("keeps the required first-slice component set", () => {
    expect(SYSTEM_HEALTH_COMPONENT_IDS).toEqual([
      "web",
      "backend_api",
      "backend_readiness",
      "postgres",
      "migrations",
    ]);
    expect(Object.keys(healthy().components).sort()).toEqual(
      [...SYSTEM_HEALTH_COMPONENT_IDS].sort(),
    );
  });

  it("rejects unknown component statuses instead of guessing", () => {
    const payload = healthy() as unknown as {
      components: { postgres: { status: string } };
    };
    payload.components.postgres.status = "probably_fine";
    expect(Value.Check(SystemHealthResponseSchema, payload)).toBe(false);
  });

  it("rejects extra properties that could leak host or credential detail", () => {
    const payload = { ...healthy(), host: "10.0.0.4", password: "secret" };
    expect(Value.Check(SystemHealthResponseSchema, payload)).toBe(false);
  });
});
