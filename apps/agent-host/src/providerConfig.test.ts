import { describe, expect, it } from "vitest";

import {
  LOCAL_PERSON_PROFILE_PROVIDER_REGISTRY,
  LOCAL_WEB_SEARCH_PROVIDER_REGISTRY,
  configuredLocalPersonProfileProvider,
  configuredLocalAgentProvider,
  configuredLocalVisionAgentProvider,
  configuredLocalWebSearchProvider,
} from "./providerConfig.js";

describe("local third-party Tool provider registry", () => {
  it("binds only the explicit Claude environment and requires a dedicated Hao credential", () => {
    const environment = {
      TALENT_SIGNAL_AGENT_PROVIDER: "claude", TALENT_SIGNAL_AGENT_MODEL: "anthropic/claude-sonnet-5",
      TALENT_SIGNAL_AGENT_VISION_MODEL: "anthropic/claude-sonnet-5",
      TALENT_SIGNAL_ALLOW_SENSITIVE_AI_PROCESSING: "true",
      ANTHROPIC_BASE_URL: "https://api.hao.ai/anthropic", HAO_ANTHROPIC_API_KEY: "synthetic-hao-key",
    };
    expect(configuredLocalAgentProvider(environment).id).toBe("claude-agent-sdk");
    expect(configuredLocalVisionAgentProvider(environment).inputCapabilities.imageUnderstanding).toBe(true);
    expect(() => configuredLocalAgentProvider({ ...environment, HAO_ANTHROPIC_API_KEY: "",
      ANTHROPIC_API_KEY: "other-gateway", CLAUDE_CODE_OAUTH_TOKEN: "ambient-oauth" })).toThrow("CREDENTIAL_AMBIGUOUS_OR_MISSING");
    expect(() => configuredLocalAgentProvider({ ...environment, ANTHROPIC_BASE_URL: "https://unadmitted.invalid" })).toThrow("ENDPOINT_NOT_ADMITTED");
  });

  it("declares credential and subscription ownership without fallback", () => {
    expect(Object.keys(LOCAL_WEB_SEARCH_PROVIDER_REGISTRY).sort()).toEqual([
      "brave",
      "exa",
      "tavily",
    ]);
    for (const registration of Object.values(
      LOCAL_WEB_SEARCH_PROVIDER_REGISTRY,
    )) {
      expect(registration).toMatchObject({
        capability: "public_web_search",
        secretPath: "/agent-host",
        subscriptionOwner: "vendor_account",
        automaticFallback: false,
      });
      expect(registration.credentialNames).toHaveLength(1);
    }
  });

  it("fails closed for an unknown provider or a missing provider key", () => {
    expect(() =>
      configuredLocalWebSearchProvider({
        TALENT_SIGNAL_AGENT_WEB_SEARCH_PROVIDER: "unknown",
      }),
    ).toThrow("must be brave, tavily, or exa");
    expect(() =>
      configuredLocalWebSearchProvider({
        TALENT_SIGNAL_AGENT_WEB_SEARCH_PROVIDER: "brave",
      }),
    ).toThrow("BRAVE_SEARCH_API_KEY is required");
  });

  it("keeps TikHub and the vision model in the local person-research boundary", () => {
    expect(LOCAL_PERSON_PROFILE_PROVIDER_REGISTRY.tikhub).toMatchObject({
      capability: "public_person_profile_research",
      secretPath: "/agent-host",
      subscriptionOwner: "vendor_account",
      automaticFallback: false,
      credentialNames: ["TIKHUB_API_KEY", "TIKHUB_BASE_URL"],
    });
    expect(() => configuredLocalPersonProfileProvider({})).toThrow(
      "TIKHUB_API_KEY is required",
    );
    expect(() =>
      configuredLocalVisionAgentProvider({
        TALENT_SIGNAL_AGENT_PROVIDER: "zhipu",
        TALENT_SIGNAL_AGENT_VISION_MODEL: "glm-4.6v-flash",
        TALENT_SIGNAL_ALLOW_SENSITIVE_AI_PROCESSING: "false",
        ZHIPU_API_KEY: "synthetic",
      }),
    ).toThrow("explicit remote-sensitive-processing admission");
    expect(() =>
      configuredLocalVisionAgentProvider({
        TALENT_SIGNAL_AGENT_PROVIDER: "zhipu",
        TALENT_SIGNAL_AGENT_VISION_MODEL: "glm-5.2",
        TALENT_SIGNAL_ALLOW_SENSITIVE_AI_PROCESSING: "true",
        ZHIPU_API_KEY: "synthetic",
      }),
    ).toThrow("must support image understanding");
    expect(
      configuredLocalVisionAgentProvider({
        TALENT_SIGNAL_AGENT_PROVIDER: "zhipu",
        TALENT_SIGNAL_AGENT_VISION_MODEL: "glm-4.6v-flash",
        TALENT_SIGNAL_ALLOW_SENSITIVE_AI_PROCESSING: "true",
        ZHIPU_API_KEY: "synthetic",
      }).inputCapabilities.imageUnderstanding,
    ).toBe(true);
  });
});
