import { describe, expect, it, vi } from "vitest";

import type { AgentProvider } from "@talent-signal/agent";

import type { DatabaseClient } from "../database/pool.js";
import type { AuthContext } from "./auth.js";
import { assertRemoteProviderDataBoundary } from "./agentRuns.js";

describe("assertRemoteProviderDataBoundary", () => {
  const auth = {
    accountId: "10000000-0000-4000-8000-000000000001",
  } as AuthContext;
  const provider = { id: "claude-agent-sdk" } as AgentProvider;

  it("admits an exact synthetic evidence selection", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ fragment_count: 1, synthetic_only: true }],
    });

    await expect(
      assertRemoteProviderDataBoundary(
        { query } as unknown as DatabaseClient,
        auth,
        provider,
        "20000000-0000-4000-8000-000000000001",
        ["30000000-0000-4000-8000-000000000001"],
      ),
    ).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledOnce();
  });

  it("fails closed before private or mixed evidence reaches Claude", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ fragment_count: 1, synthetic_only: false }],
    });

    await expect(
      assertRemoteProviderDataBoundary(
        { query } as unknown as DatabaseClient,
        auth,
        provider,
        "20000000-0000-4000-8000-000000000001",
        ["30000000-0000-4000-8000-000000000001"],
      ),
    ).rejects.toMatchObject({
      code: "AGENT_REMOTE_PROVIDER_SYNTHETIC_ONLY",
      statusCode: 422,
    });
  });

  it("does not query provider policy for the local deterministic runtime", async () => {
    const query = vi.fn();

    await assertRemoteProviderDataBoundary(
      { query } as unknown as DatabaseClient,
      auth,
      { id: "deterministic-safe" } as AgentProvider,
      "20000000-0000-4000-8000-000000000001",
      [],
    );
    expect(query).not.toHaveBeenCalled();
  });
});
