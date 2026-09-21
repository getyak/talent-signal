import Fastify from "fastify";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { registerReadinessRoutes } from "./readinessRoutes.js";
import { REQUIRED_SYSTEM_MIGRATIONS } from "./systemHealth.js";

describe.each(["072_mcp_extensions", "073_conversation_queue", "073_account_onboarding", "074_time_workspace", "075_conversation_message_images"])("schema readiness: %s", (required) => {
  it.each([false, true])("requires migration when applied=%s", async (applied) => {
    const migrations = REQUIRED_SYSTEM_MIGRATIONS.filter((version) => version !== required);
    const query = vi.fn().mockResolvedValue({
      rows: [...migrations, ...(applied ? [required] : [])].map((version) => ({ version })),
    });
    const app = Fastify();
    registerReadinessRoutes(app, { query } as unknown as Pool);
    try {
      const response = await app.inject({ method: "GET", url: "/health/ready" });
      expect(response.statusCode).toBe(applied ? 200 : 503);
      if (applied) expect(response.json().migration).toBe(REQUIRED_SYSTEM_MIGRATIONS.at(-1));
      else expect(response.json().status).toBe("not_ready");
    } finally {
      await app.close();
    }
  });
});
