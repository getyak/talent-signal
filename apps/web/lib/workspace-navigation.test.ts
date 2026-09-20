import { describe, expect, it } from "vitest";
import { WORKSPACE_NAV_ROUTES, workspaceCaptureIntent } from "./workspace-navigation";

describe("workspace route ownership", () => {
  it.each([
    ["/workspace/today", "today"],
    ["/workspace/pursuits/example", "today"],
    ["/workspace/sessions/example", "sessions"],
    ["/workspace/people", "people"],
    ["/workspace/meetings", "meetings"],
    ["/workspace/captures/people/example", "captures"],
    ["/workspace/plugs", "plugs"],
  ])("gives %s exactly one primary destination", (pathname, expected) => {
    expect(WORKSPACE_NAV_ROUTES.filter(item => item.matches(pathname)).map(item => item.id)).toEqual([expected]);
  });
  it("keeps internal tools out of primary retrieval", () => {
    expect(WORKSPACE_NAV_ROUTES.some(item => item.matches("/workspace/monitor"))).toBe(false);
    expect(WORKSPACE_NAV_ROUTES.filter(item => item.mobile).map(item => item.id)).toEqual(["today", "sessions", "people", "meetings"]);
  });
});

it("preserves same-page composer focus and loading navigation", () => {
  expect(workspaceCaptureIntent("/workspace", "?surface=desk")).toEqual({ intercept: true, href: "/workspace?surface=desk&intent=compose", event: "talent-signal:focus-agent" });
  expect(workspaceCaptureIntent("/workspace", "?surface=loading")).toEqual({ intercept: false });
  expect(workspaceCaptureIntent("/workspace/people", "")).toEqual({ intercept: false });
});
