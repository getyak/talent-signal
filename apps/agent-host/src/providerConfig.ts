import {
  BigModelAgentProvider,
  ClaudeAgentSDKProvider,
  OpenRouterAgentProvider,
  type AgentProvider,
} from "@talent-signal/agent";

import {
  BraveWebSearchProvider,
  TavilyWebSearchProvider,
  type AgentWebSearchProvider,
} from "./webSearchProviders.js";

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required by the local Agent host.`);
  return value;
}

function positive(environment: NodeJS.ProcessEnv, name: string, fallback: number) {
  const raw = environment[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return value;
}

export function configuredLocalAgentProvider(
  environment: NodeJS.ProcessEnv = process.env,
): AgentProvider {
  const provider = required(environment, "TALENT_SIGNAL_AGENT_PROVIDER").toLowerCase();
  const model = required(environment, "TALENT_SIGNAL_AGENT_MODEL");
  if (provider === "claude") {
    if (
      !environment.ANTHROPIC_API_KEY?.trim() &&
      !environment.ANTHROPIC_AUTH_TOKEN?.trim() &&
      !environment.CLAUDE_CODE_OAUTH_TOKEN?.trim()
    ) {
      throw new Error("A local Anthropic credential is required.");
    }
    return new ClaudeAgentSDKProvider(model);
  }
  if (provider === "openrouter") {
    return new OpenRouterAgentProvider({
      apiKey: required(environment, "OPENROUTER_API_KEY"),
      model,
      ...(environment.OPENROUTER_BASE_URL?.trim()
        ? { baseUrl: environment.OPENROUTER_BASE_URL.trim() }
        : {}),
      ...(environment.TALENT_SIGNAL_AGENT_REFERER?.trim()
        ? { referer: environment.TALENT_SIGNAL_AGENT_REFERER.trim() }
        : {}),
    });
  }
  if (provider === "zhipu") {
    return new BigModelAgentProvider({
      apiKey: required(environment, "ZHIPU_API_KEY"),
      model,
      inputCnyPerMillion: positive(
        environment,
        "TALENT_SIGNAL_ZHIPU_INPUT_CNY_PER_MILLION",
        2,
      ),
      outputCnyPerMillion: positive(
        environment,
        "TALENT_SIGNAL_ZHIPU_OUTPUT_CNY_PER_MILLION",
        8,
      ),
      cnyPerUsd: positive(environment, "TALENT_SIGNAL_CNY_PER_USD", 7.2),
      ...(environment.ZHIPU_BASE_URL?.trim()
        ? { baseUrl: environment.ZHIPU_BASE_URL.trim() }
        : {}),
    });
  }
  throw new Error(
    "TALENT_SIGNAL_AGENT_PROVIDER must be claude, openrouter, or zhipu.",
  );
}

export interface LocalToolProviderRegistration {
  id: "brave" | "tavily";
  capability: "public_web_search";
  secretPath: "/agent-host";
  credentialNames: readonly string[];
  subscriptionOwner: "vendor_account";
  automaticFallback: false;
  create(environment: NodeJS.ProcessEnv): AgentWebSearchProvider;
}

export const LOCAL_WEB_SEARCH_PROVIDER_REGISTRY: Readonly<
  Record<LocalToolProviderRegistration["id"], LocalToolProviderRegistration>
> = Object.freeze({
  brave: {
    id: "brave",
    capability: "public_web_search",
    secretPath: "/agent-host",
    credentialNames: ["BRAVE_SEARCH_API_KEY"],
    subscriptionOwner: "vendor_account",
    automaticFallback: false,
    create: (environment) =>
      new BraveWebSearchProvider({
        apiKey: required(environment, "BRAVE_SEARCH_API_KEY"),
        ...(environment.BRAVE_SEARCH_BASE_URL?.trim()
          ? { baseUrl: environment.BRAVE_SEARCH_BASE_URL.trim() }
          : {}),
      }),
  },
  tavily: {
    id: "tavily",
    capability: "public_web_search",
    secretPath: "/agent-host",
    credentialNames: ["TAVILY_API_KEY"],
    subscriptionOwner: "vendor_account",
    automaticFallback: false,
    create: (environment) =>
      new TavilyWebSearchProvider({
        apiKey: required(environment, "TAVILY_API_KEY"),
        ...(environment.TAVILY_BASE_URL?.trim()
          ? { baseUrl: environment.TAVILY_BASE_URL.trim() }
          : {}),
      }),
  },
});

export function configuredLocalWebSearchProvider(
  environment: NodeJS.ProcessEnv = process.env,
): AgentWebSearchProvider {
  const provider = required(
    environment,
    "TALENT_SIGNAL_AGENT_WEB_SEARCH_PROVIDER",
  ).toLowerCase();
  if (provider in LOCAL_WEB_SEARCH_PROVIDER_REGISTRY) {
    return LOCAL_WEB_SEARCH_PROVIDER_REGISTRY[
      provider as LocalToolProviderRegistration["id"]
    ].create(environment);
  }
  throw new Error(
    "TALENT_SIGNAL_AGENT_WEB_SEARCH_PROVIDER must be brave or tavily.",
  );
}
