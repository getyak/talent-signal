import Fastify from "fastify";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import {
  observeSystemHealth,
  registerSystemHealthRoutes,
  REQUIRED_SYSTEM_MIGRATIONS,
} from "./systemHealth.js";

const observedAt = new Date("2026-09-14T09:00:00.000Z");

describe("system health observation", () => {
  it("separates the request handler, database query, and migration state", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ system_health_ready: 1 }] })
      .mockResolvedValueOnce({
        rows: REQUIRED_SYSTEM_MIGRATIONS.map((version) => ({ version })),
      });

    const result = await observeSystemHealth(
      { query } as unknown as Pick<Pool, "query">,
      () => observedAt,
    );

    expect(result).toMatchObject({
      schema_version: "system-health.v1",
      status: "healthy",
      observed_at: observedAt.toISOString(),
      components: [
        { id: "backend", status: "healthy" },
        { id: "database", status: "healthy" },
        { id: "migrations", status: "healthy" },
      ],
    });
    expect(query).toHaveBeenNthCalledWith(1, "SELECT 1 AS system_health_ready");
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("schema_migrations"),
      [REQUIRED_SYSTEM_MIGRATIONS],
    );
  });

  it("reports a missing required migration without blaming PostgreSQL", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ system_health_ready: 1 }] })
      .mockResolvedValueOnce({
        rows: REQUIRED_SYSTEM_MIGRATIONS.slice(1).map((version) => ({ version })),
      });

    const result = await observeSystemHealth(
      { query } as unknown as Pick<Pool, "query">,
      () => observedAt,
    );

    expect(result.status).toBe("degraded");
    expect(result.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "database", status: "healthy" }),
        expect.objectContaining({
          id: "migrations",
          status: "degraded",
          detail_code: "required_migrations_missing",
        }),
      ]),
    );
  });

  it("keeps migrations unknown when PostgreSQL cannot be observed", async () => {
    const query = vi.fn().mockRejectedValue(new Error("synthetic outage"));

    const result = await observeSystemHealth(
      { query } as unknown as Pick<Pool, "query">,
      () => observedAt,
    );

    expect(result.status).toBe("unavailable");
    expect(result.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "database", status: "unavailable" }),
        expect.objectContaining({
          id: "migrations",
          status: "unknown",
          detail_code: "not_observed",
        }),
      ]),
    );
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe("system health route boundary", () => {
  it("requires authentication and returns a non-cacheable observation", async () => {
    const app = Fastify();
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ system_health_ready: 1 }] })
      .mockResolvedValueOnce({
        rows: REQUIRED_SYSTEM_MIGRATIONS.map((version) => ({ version })),
      });
    registerSystemHealthRoutes(
      app,
      { query } as unknown as Pool,
      async (request, reply) => {
        if (request.headers.authorization !== "Bearer synthetic-session") {
          return reply.status(401).send({
            error: {
              code: "UNAUTHORIZED",
              message: "Authentication is required.",
              request_id: request.id,
            },
          });
        }
      },
    );

    const denied = await app.inject({ method: "GET", url: "/v1/system/health" });
    expect(denied.statusCode).toBe(401);
    expect(query).not.toHaveBeenCalled();

    const allowed = await app.inject({
      method: "GET",
      url: "/v1/system/health",
      headers: { authorization: "Bearer synthetic-session" },
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.headers["cache-control"]).toBe("private, no-store");
    expect(allowed.headers.vary).toBe("authorization");
    expect(allowed.json()).toMatchObject({ status: "healthy" });
    await app.close();
  });
});
