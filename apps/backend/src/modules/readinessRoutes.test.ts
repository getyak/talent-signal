import Fastify from "fastify";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { registerReadinessRoutes } from "./readinessRoutes.js";
import { REQUIRED_SYSTEM_MIGRATIONS } from "./systemHealth.js";

describe("MCP schema readiness", () => {
  it.each([false, true])("requires MCP migration when applied=%s", async (applied) => {
    const migrations = REQUIRED_SYSTEM_MIGRATIONS.filter((version) => version !== "072_mcp_extensions");
    const query = vi.fn().mockResolvedValue({
      rows: [...migrations, ...(applied ? ["072_mcp_extensions"] : [])].map((version) => ({ version })),
    });
    const app = Fastify();
    registerReadinessRoutes(app, { query } as unknown as Pool);
    try {
      const response = await app.inject({ method: "GET", url: "/health/ready" });
      expect(response.statusCode).toBe(applied ? 200 : 503);
      if (applied) expect(response.json().migration).toBe("072_mcp_extensions");
      else expect(response.json().status).toBe("not_ready");
    } finally {
      await app.close();
    }
  });
});
