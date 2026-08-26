import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentProvider } from "@talent-signal/agent";

import type { DatabaseClient } from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import type { AuthContext } from "./auth.js";
import {
  assertRemoteProviderDataBoundary,
  configuredAgentProvider,
} from "./agentRuns.js";

const environmentKeys = [
  "TALENT_SIGNAL_AGENT_PROVIDER",
  "TALENT_SIGNAL_AGENT_MODEL",
  "TALENT_SIGNAL_AGENT_REFERER",
  "OPENROUTER_API_KEY",
  "OPENROUTER_BASE_URL",
] as const;
const originalEnvironment = Object.fromEntries(
  environmentKeys.map((name) => [name, process.env[name]]),
);

function expectApiError(operation: () => unknown, code: string): void {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code, statusCode: 503 });
    return;
  }
  throw new Error(`Expected ApiError ${code}.`);
}

afterEach(() => {
  for (const name of environmentKeys) {
    const value = originalEnvironment[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("configuredAgentProvider", () => {
  it("keeps the deterministic provider as the safe default", () => {
    delete process.env.TALENT_SIGNAL_AGENT_PROVIDER;
    delete process.env.TALENT_SIGNAL_AGENT_MODEL;

    expect(configuredAgentProvider()).toMatchObject({
      id: "deterministic-safe",
      model: "talent-signal-no-action-v1",
    });
  });

  it("constructs one pinned OpenRouter provider from server-only settings", () => {
    process.env.TALENT_SIGNAL_AGENT_PROVIDER = "openrouter";
    process.env.TALENT_SIGNAL_AGENT_MODEL = "cohere/north-mini-code:free";
    process.env.OPENROUTER_API_KEY = "synthetic-test-key";
    process.env.OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

    expect(configuredAgentProvider()).toMatchObject({
      id: "openrouter-chat-completions",
      model: "cohere/north-mini-code:free",
      sdkVersion: "openrouter-chat-completions.v1",
    });
  });

  it("fails closed without a credential or pinned model", () => {
    process.env.TALENT_SIGNAL_AGENT_PROVIDER = "openrouter";
    delete process.env.TALENT_SIGNAL_AGENT_MODEL;
    delete process.env.OPENROUTER_API_KEY;

    expectApiError(
      () => configuredAgentProvider(),
      "AGENT_MODEL_NOT_CONFIGURED",
    );

    process.env.TALENT_SIGNAL_AGENT_MODEL = "cohere/north-mini-code:free";
    expectApiError(
      () => configuredAgentProvider(),
      "AGENT_PROVIDER_CREDENTIAL_NOT_CONFIGURED",
    );
  });

  it("rejects dynamic model routing and unknown providers", () => {
    process.env.TALENT_SIGNAL_AGENT_PROVIDER = "openrouter";
    process.env.TALENT_SIGNAL_AGENT_MODEL = "openrouter/free";
    process.env.OPENROUTER_API_KEY = "synthetic-test-key";

    expectApiError(
      () => configuredAgentProvider(),
      "AGENT_PROVIDER_CONFIGURATION_INVALID",
    );

    process.env.TALENT_SIGNAL_AGENT_PROVIDER = "unbounded-provider";
    process.env.TALENT_SIGNAL_AGENT_MODEL = "unbounded-model";
    expectApiError(
      () => configuredAgentProvider(),
      "AGENT_PROVIDER_UNSUPPORTED",
    );
  });
});

describe("assertRemoteProviderDataBoundary", () => {
  const auth = {
    accountId: "10000000-0000-4000-8000-000000000001",
  } as AuthContext;
  const provider = {
    id: "openrouter-chat-completions",
  } as AgentProvider;

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

  it("fails closed before private or mixed evidence reaches a remote provider", async () => {
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
