import { describe, expect, it } from "vitest";

import {
  LOCAL_PERSON_PROFILE_PROVIDER_REGISTRY,
  LOCAL_WEB_SEARCH_PROVIDER_REGISTRY,
  configuredLocalPersonProfileProvider,
  configuredLocalVisionAgentProvider,
  configuredLocalWebSearchProvider,
} from "./providerConfig.js";

describe("local third-party Tool provider registry", () => {
  it("declares credential and subscription ownership without fallback", () => {
    expect(Object.keys(LOCAL_WEB_SEARCH_PROVIDER_REGISTRY).sort()).toEqual([
      "brave",
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
    ).toThrow("must be brave or tavily");
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
