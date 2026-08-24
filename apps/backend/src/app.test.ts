import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "./app.js";
import type { BackendConfig } from "./config.js";

const config: BackendConfig = {
  allowedOrigins: ["http://localhost:3000"],
  appleSignInAudiences: ["com.talentsignal.app"],
  appleSignInEnabled: true,
  databaseUrl: "postgresql://synthetic-only",
  host: "127.0.0.1",
  port: 4317,
  retentionSweepIntervalMs: 60_000,
  sessionTtlSeconds: 28_800,
  simulatedAuthEnabled: true,
};

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("readiness rate limiting", () => {
  it("bounds repeated public database readiness probes", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          version: "026_apple_auth",
        },
      ],
    });
    const app = await buildApp({
      config,
      pool: { query } as unknown as Pool,
    });
    apps.push(app);

    for (let index = 0; index < 60; index += 1) {
      const response = await app.inject({
        method: "GET",
        url: "/health/ready",
      });
      expect(response.statusCode).toBe(200);
    }

    const limited = await app.inject({
      method: "GET",
      url: "/health/ready",
    });

    expect(limited.statusCode).toBe(429);
    expect(query).toHaveBeenCalledTimes(60);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("026_apple_auth"),
    );
  }, 10_000);
});
