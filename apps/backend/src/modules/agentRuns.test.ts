import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentProvider } from "@talent-signal/agent";

import type { DatabaseClient } from "../database/pool.js";
import { ApiError } from "../lib/apiError.js";
import type { AuthContext } from "./auth.js";
import {
  assertRemoteProviderDataBoundary,
  configuredAgentProvider,
  resolveAgentInputArtifacts,
} from "./agentRuns.js";

const environmentKeys = [
  "TALENT_SIGNAL_AGENT_PROVIDER",
  "TALENT_SIGNAL_AGENT_MODEL",
  "TALENT_SIGNAL_AGENT_REFERER",
  "TALENT_SIGNAL_AGENT_REASONING_EFFORT",
  "TALENT_SIGNAL_AGENT_PROVIDER_ORDER",
  "TALENT_SIGNAL_AGENT_IMAGE_INPUT_ENABLED",
  "OPENROUTER_API_KEY",
  "OPENROUTER_BASE_URL",
  "ZHIPU_API_KEY",
  "ZHIPU_BASE_URL",
  "TALENT_SIGNAL_ZHIPU_INPUT_CNY_PER_MILLION",
  "TALENT_SIGNAL_ZHIPU_OUTPUT_CNY_PER_MILLION",
  "TALENT_SIGNAL_CNY_PER_USD",
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
    process.env.TALENT_SIGNAL_AGENT_IMAGE_INPUT_ENABLED = "true";

    expect(configuredAgentProvider()).toMatchObject({
      id: "openrouter-chat-completions",
      model: "cohere/north-mini-code:free",
      sdkVersion: "openrouter-chat-completions.v1",
      inputCapabilities: {
        text: true,
        image: true,
        imageUnderstanding: true,
      },
    });
  });

  it("constructs one pinned BigModel provider with explicit pricing", () => {
    process.env.TALENT_SIGNAL_AGENT_PROVIDER = "zhipu";
    process.env.TALENT_SIGNAL_AGENT_MODEL = "glm-5.3";
    process.env.ZHIPU_API_KEY = "synthetic-test-key";
    process.env.ZHIPU_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
    process.env.TALENT_SIGNAL_ZHIPU_INPUT_CNY_PER_MILLION = "8";
    process.env.TALENT_SIGNAL_ZHIPU_OUTPUT_CNY_PER_MILLION = "28";
    process.env.TALENT_SIGNAL_CNY_PER_USD = "7";

    expect(configuredAgentProvider()).toMatchObject({
      id: "bigmodel-chat-completions",
      model: "glm-5.3",
      sdkVersion: "bigmodel-chat-completions.v1",
    });
  });

  it("fails closed when direct BigModel pricing is not explicit", () => {
    process.env.TALENT_SIGNAL_AGENT_PROVIDER = "zhipu";
    process.env.TALENT_SIGNAL_AGENT_MODEL = "glm-5.3";
    process.env.ZHIPU_API_KEY = "synthetic-test-key";
    delete process.env.TALENT_SIGNAL_ZHIPU_INPUT_CNY_PER_MILLION;
    delete process.env.TALENT_SIGNAL_ZHIPU_OUTPUT_CNY_PER_MILLION;
    delete process.env.TALENT_SIGNAL_CNY_PER_USD;

    expectApiError(
      () => configuredAgentProvider(),
      "AGENT_PROVIDER_CONFIGURATION_INVALID",
    );
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

  it("rejects invalid reasoning effort and provider slugs", () => {
    process.env.TALENT_SIGNAL_AGENT_PROVIDER = "openrouter";
    process.env.TALENT_SIGNAL_AGENT_MODEL = "z-ai/glm-5.3";
    process.env.OPENROUTER_API_KEY = "synthetic-test-key";
    process.env.TALENT_SIGNAL_AGENT_REASONING_EFFORT = "unbounded";

    expectApiError(
      () => configuredAgentProvider(),
      "AGENT_PROVIDER_CONFIGURATION_INVALID",
    );

    process.env.TALENT_SIGNAL_AGENT_REASONING_EFFORT = "low";
    process.env.TALENT_SIGNAL_AGENT_PROVIDER_ORDER = "z-ai,invalid provider";
    expectApiError(
      () => configuredAgentProvider(),
      "AGENT_PROVIDER_CONFIGURATION_INVALID",
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

describe("resolveAgentInputArtifacts", () => {
  const auth = {
    accountId: "10000000-0000-4000-8000-000000000001",
  } as AuthContext;
  const telemetry = {
    trace_id: "a".repeat(32),
    parent_span_id: "b".repeat(16),
    interaction_id: "20000000-0000-4000-8000-000000000001",
  };
  const provider = {
    inputCapabilities: {
      text: true,
      image: true,
      imageUnderstanding: false,
    },
  } as AgentProvider;

  it("reconstructs hash-identical synthetic text without persisting content in the manifest", async () => {
    const text = "synthetic";
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: "30000000-0000-4000-8000-000000000001",
          kind: "text",
          mime_type: "text/plain; charset=utf-8",
          byte_size: 9,
          content_hash:
            "b3cc0475bb78a5026098858e9889acf666d31062d513d303314eca31d36e72f2",
          text_content: text,
          binary_content: null,
          data_classification: "synthetic",
          authorization_scope: "evaluation:agent-lab",
        },
      ],
    });

    const result = await resolveAgentInputArtifacts(
      { query } as unknown as DatabaseClient,
      auth,
      provider,
      telemetry,
      ["30000000-0000-4000-8000-000000000001"],
    );

    expect(result.parts[0]).toMatchObject({ kind: "text", text });
    expect(result.manifest[0]).not.toHaveProperty("text");
  });

  it("rejects an artifact that is not explicitly synthetic Agent Lab input", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: "30000000-0000-4000-8000-000000000001",
          kind: "text",
          mime_type: "text/plain; charset=utf-8",
          byte_size: 9,
          content_hash:
            "b3cc0475bb78a5026098858e9889acf666d31062d513d303314eca31d36e72f2",
          text_content: "synthetic",
          binary_content: null,
          data_classification: "private_relationship",
          authorization_scope: "evaluation:agent-lab",
        },
      ],
    });

    await expect(
      resolveAgentInputArtifacts(
        { query } as unknown as DatabaseClient,
        auth,
        provider,
        telemetry,
        ["30000000-0000-4000-8000-000000000001"],
      ),
    ).rejects.toMatchObject({ code: "AGENT_INPUT_SYNTHETIC_ONLY" });
  });
});
