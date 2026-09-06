import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

describe("bundled product prompts", () => {
  it("loads and resolves all prompts without network access even with legacy registry settings", async () => {
    const fetcher = vi.fn(() => { throw new Error("Network must not be used"); });
    vi.stubGlobal("fetch", fetcher);
    vi.stubEnv("TALENT_SIGNAL_PROMPT_REGISTRY_URL", "http://127.0.0.1:1/unreachable");
    vi.stubEnv("TALENT_SIGNAL_PROMPT_ENVIRONMENT", "a-new-remote-publication");
    const { PROMPT_DEFINITIONS } = await import("./prompts.js");
    const { bundledPrompt, resolveProductPrompt, promptRevision } = await import("./promptRegistry.js");
    for (const name of Object.keys(PROMPT_DEFINITIONS) as (keyof typeof PROMPT_DEFINITIONS)[]) {
      const p = await resolveProductPrompt(name);
      expect(p).toBe(bundledPrompt(name));
      expect(p.source).toBe("bundled");
      expect(p.revision).toBe(promptRevision(PROMPT_DEFINITIONS[name].text));
      expect(p.versionId).toBeNull();
      expect(p.environment).toBeNull();
      expect(Object.isFrozen(p)).toBe(true);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps the selected snapshot stable across calls and rejects unknown names", async () => {
    const { bundledPrompt, resolveProductPrompt } = await import("./promptRegistry.js");
    const first = await resolveProductPrompt("assistant/workspace");
    vi.stubEnv("TALENT_SIGNAL_PROMPT_REGISTRY_URL", "not even a valid URL");
    expect(await resolveProductPrompt("assistant/workspace")).toBe(first);
    expect(() => bundledPrompt("missing" as "assistant/workspace")).toThrow("UNKNOWN_PRODUCT_PROMPT");
  });
});
