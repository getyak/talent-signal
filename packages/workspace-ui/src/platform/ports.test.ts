import { describe, expect, it } from "vitest";

import {
  PLATFORM_CAPABILITIES,
  availabilityFor,
  availabilityLabel,
  createUnavailablePlatformAdapter,
} from "./ports.js";

describe("unavailable platform adapter", () => {
  it("reports every capability as unavailable and never as available", async () => {
    const adapter = createUnavailablePlatformAdapter({
      host: "web",
      reason: "no native bridge",
    });

    const report = await adapter.capabilities();
    for (const capability of PLATFORM_CAPABILITIES) {
      expect(report[capability]).toBe("unavailable");
      expect(availabilityFor(report, capability)).toBe("unavailable");
    }
  });

  it("fails closed on every request instead of returning a success shape", async () => {
    const adapter = createUnavailablePlatformAdapter({
      host: "web",
      reason: "no native bridge",
    });

    const scope = { accountId: "acct", sessionId: "session" };

    const capture = await adapter.captureSelectedWindow({ ...scope, intentId: "intent-1" });
    expect(capture.status).toBe("unavailable");
    expect(capture).not.toHaveProperty("localHandle");

    const ocr = await adapter.recognizeLocalText({ ...scope, localHandle: "local-1" });
    expect(ocr.status).toBe("unavailable");
    expect(ocr).not.toHaveProperty("localText");

    const panel = await adapter.openQuickPanel({
      ...scope,
      activityId: "intent-1",
      label: "Workbench",
    });
    expect(panel.status).toBe("unavailable");
    expect(panel).not.toHaveProperty("panelId");

    const notification = await adapter.notifyState({
      ...scope,
      activityId: "intent-1",
      state: "ready",
    });
    expect(notification.status).toBe("unavailable");
  });
});

describe("availabilityFor", () => {
  it("treats unknown, null, and malformed reports as unavailable", () => {
    expect(availabilityFor(null, "window_capture")).toBe("unavailable");
    expect(availabilityFor(undefined, "local_ocr")).toBe("unavailable");
    expect(
      availabilityFor({ window_capture: "available" as never }, "local_ocr"),
    ).toBe("unavailable");
    expect(
      availabilityFor({ local_ocr: "maybe" as never }, "local_ocr"),
    ).toBe("unavailable");
  });

  it("keeps permission_required distinct from unavailable and denied", () => {
    const report = {
      window_capture: "permission_required",
      local_ocr: "denied",
      quick_panel: "available",
      notification: "unavailable",
    } as const;

    expect(availabilityFor(report, "window_capture")).toBe("permission_required");
    expect(availabilityFor(report, "local_ocr")).toBe("denied");
    expect(availabilityFor(report, "quick_panel")).toBe("available");
    for (const capability of PLATFORM_CAPABILITIES) {
      expect(availabilityLabel(availabilityFor(report, capability))).toBeTruthy();
    }
  });
});
