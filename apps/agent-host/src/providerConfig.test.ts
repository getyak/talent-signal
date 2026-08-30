import { describe, expect, it } from "vitest";

import {
  LOCAL_WEB_SEARCH_PROVIDER_REGISTRY,
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
});
