import { describe, it, expect } from "vitest";
import { browseDiscoveredPublicPage } from "./isolatedPublicBrowser.js";

describe("isolated public browser admission", () => {
  it("rejects a mutable or missing runtime image before executing anything", async () => {
    for (const image of [undefined, "latest", "talent-signal-browser:get9", "sha256:not-a-digest"]) {
      await expect(browseDiscoveredPublicPage("https://example.com/", new AbortController().signal,
        image ? { TALENT_SIGNAL_BROWSER_IMAGE: image } : {})).rejects.toThrow("BROWSER_IMAGE_NOT_CONFIGURED");
    }
  });
  it("rejects credentials, non-HTTPS and alternate ports before runtime dispatch", async () => {
    const environment = { TALENT_SIGNAL_BROWSER_IMAGE: `sha256:${"a".repeat(64)}` };
    for (const url of ["http://example.com/", "https://user:pass@example.com/", "https://example.com:444/"]) {
      await expect(browseDiscoveredPublicPage(url, new AbortController().signal, environment)).rejects.toThrow("BROWSER_SOURCE_INVALID");
    }
  });
});
