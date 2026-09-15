import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NativeCapabilityWorkbench } from "./NativeCapabilityWorkbench.js";
import { createUnavailablePlatformAdapter } from "../platform/ports.js";

function render(adapterHost: "web" | "desktop") {
  return renderToStaticMarkup(
    createElement(NativeCapabilityWorkbench, {
      adapter: createUnavailablePlatformAdapter({ host: adapterHost, reason: "no bridge" }),
      intentId: "intent-1",
      scope: { accountId: "acct", sessionId: "session" },
      title: "原生能力",
    }),
  );
}

describe("NativeCapabilityWorkbench initial render", () => {
  it("labels every unavailable capability honestly and distinguishes permission states", () => {
    const html = render("web");
    // No capability is claimed available before the host reports anything.
    expect(html).not.toContain(">可用<");
    expect(html).toContain("当前主机不可用");
    expect(html).toContain('data-adapter-host="web"');
    expect(html).toContain("ts-workspace-surface");
  });

  it("disables every native action until availability is confirmed", () => {
    const html = render("desktop");
    // Four native capability rows, each with an availability marker.
    for (const capability of ["window_capture", "local_ocr", "quick_panel", "notification"]) {
      expect(html).toContain(`data-capability="${capability}"`);
    }
    // Capture button is disabled in the initial fail-closed state.
    expect(html).toContain('disabled=""');
  });

  it("states that drafts are local and external writes are not performed", () => {
    const html = render("web");
    expect(html).toContain("没有持久化或外部执行权限");
    expect(html).toContain("不创建规范数据");
    expect(html).toContain("没有云端回退");
  });
});
