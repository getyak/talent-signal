import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { createUnavailablePlatformAdapter } from "../platform/ports.js";
import { NativeCapabilityStatus } from "./NativeCapabilityStatus.js";

describe("NativeCapabilityStatus", () => {
  it("is read-only and does not require or emit fabricated scope identifiers", () => {
    const html = renderToStaticMarkup(
      createElement(NativeCapabilityStatus, {
        adapter: createUnavailablePlatformAdapter({
          host: "web",
          reason: "Web has no native bridge",
        }),
      }),
    );

    expect(html).toContain('data-capability-mode="status-only"');
    expect(html).toContain('data-adapter-host="web"');
    expect(html).not.toContain("accountId");
    expect(html).not.toContain("sessionId");
    expect(html).not.toContain("<button");
  });
});
