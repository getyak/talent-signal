import { describe, expect, it } from "vitest";
import {
  WORKSPACE_NAV_ROUTES,
  workspaceCaptureIntent,
  workspaceMobileNavRoutes,
  workspaceNavRouteForPath,
  workspaceNavRoutes,
  workspaceRouteLabel,
} from "./workspace-navigation";

describe("workspace route ownership", () => {
  it.each([
    ["/workspace", "home"],
    ["/workspace/", "home"],
    ["/workspace/people", "people"],
    ["/workspace/meetings", "meetings"],
    ["/workspace/plugs", "plugs"],
    ["/workspace/extensions", "plugs"],
    ["/workspace/today", "today"],
    ["/workspace/pursuits/example", "today"],
    ["/workspace/sessions/example", "sessions"],
    ["/workspace/captures/people/example", "captures"],
  ])("gives %s exactly one primary destination", (pathname, expected) => {
    expect(
      WORKSPACE_NAV_ROUTES.filter((item) => item.matches(pathname)).map(
        (item) => item.id,
      ),
    ).toEqual([expected]);
  });

  it("keeps internal tools out of primary retrieval", () => {
    expect(WORKSPACE_NAV_ROUTES.some((item) => item.matches("/workspace/monitor"))).toBe(false);
    // Direct desktop primary order: new conversation, Today, People, Meetings,
    // Extensions. Sources is a contextual utility and Sessions is a collapsed
    // rail utility rather than a primary destination.
    expect(workspaceNavRoutes("primary").map((item) => item.id)).toEqual([
      "home",
      "today",
      "people",
      "meetings",
      "plugs",
    ]);
    expect(workspaceNavRoutes("utility").map((item) => item.id)).toEqual([
      "sessions",
    ]);
    expect(workspaceNavRoutes("account").map((item) => item.id)).toEqual([
      "captures",
    ]);
    // The compact dock keeps the four retrieval destinations; Sources has its
    // own header button instead.
    expect(workspaceMobileNavRoutes().map((item) => item.id)).toEqual([
      "home",
      "today",
      "people",
      "meetings",
    ]);
  });

  it("keeps the home canvas at the default entry and degrades safely off-route", () => {
    expect(workspaceNavRouteForPath("/workspace")?.id).toBe("home");
    expect(workspaceNavRouteForPath("/workspace/settings")?.id).toBeUndefined();
    expect(workspaceNavRouteForPath(null)?.id).toBeUndefined();
    expect(workspaceRouteLabel("/workspace")).toBe("新对话");
    expect(workspaceRouteLabel("/workspace/people")).toBe("人物");
    expect(workspaceRouteLabel("/workspace/settings")).toBe("设置");
  });
});

it("preserves same-page composer focus and loading navigation", () => {
  expect(workspaceCaptureIntent("/workspace", "?surface=desk")).toEqual({
    intercept: true,
    href: "/workspace?surface=desk&intent=compose",
    event: "talent-signal:focus-agent",
  });
  expect(workspaceCaptureIntent("/workspace", "?surface=loading")).toEqual({ intercept: false });
  expect(workspaceCaptureIntent("/workspace", "")).toEqual({ intercept: false });
  expect(workspaceCaptureIntent("/workspace/people", "")).toEqual({ intercept: false });
});
