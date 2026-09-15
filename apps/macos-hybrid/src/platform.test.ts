import { describe, expect, it } from "vitest";

import {
  createDesktopPlatformAdapter,
  isQuickPanelShortcut,
  nativeCommandNames,
  type Invoke,
} from "./platform";

describe("desktop platform adapter", () => {
  it("exposes only the fixed command allowlist", () => {
    expect(nativeCommandNames).toEqual([
      "activate_session_binding",
      "session_binding_status",
      "cancel_capture",
      "desktop_capabilities",
      "capture_selected_window",
      "disconnect_session_binding",
      "notify_state",
      "recognize_local_text",
      "open_quick_panel",
    ]);
    expect(nativeCommandNames).not.toContain("shell");
    expect(nativeCommandNames).not.toContain("read_file");
    expect(nativeCommandNames).not.toContain("fetch_url");
  });

  it("propagates capture cancellation to the typed cancel command", async () => {
    const calls: string[] = [];
    let releaseCapture: ((value: unknown) => void) | undefined;
    const mockInvoke = async (command: string): Promise<unknown> => {
      calls.push(command);
      if (command === "capture_selected_window") {
        return await new Promise<unknown>((resolve) => {
          releaseCapture = resolve;
        });
      }
      return { status: "cancelled" };
    };
    const invoke = mockInvoke as Invoke;
    const adapter = createDesktopPlatformAdapter(invoke);
    const controller = new AbortController();
    const pending = adapter.captureSelectedWindow(
      { accountId: "a", sessionId: "s", intentId: "i" },
      controller.signal,
    );

    controller.abort();
    await Promise.resolve();
    expect(calls).toContain("cancel_capture");
    releaseCapture?.({ status: "cancelled" });
    await expect(pending).resolves.toEqual({ status: "cancelled" });
  });

  it("does not invent a cloud OCR fallback when local OCR is cancelled", async () => {
    const calls: string[] = [];
    const mockInvoke = async (command: string): Promise<unknown> => {
      calls.push(command);
      throw new Error("must not run");
    };
    const invoke = mockInvoke as Invoke;
    const adapter = createDesktopPlatformAdapter(invoke);
    const controller = new AbortController();
    controller.abort();
    await expect(
      adapter.recognizeLocalText(
        { accountId: "a", sessionId: "s", localHandle: "h" },
        controller.signal,
      ),
    ).resolves.toEqual({ status: "failed", reason: "本地识别已取消。" });
    expect(calls).toEqual([]);
  });

  it("recognizes only the focused macOS quick-panel shortcut", () => {
    expect(isQuickPanelShortcut({ altKey: false, ctrlKey: false, key: "k", metaKey: true })).toBe(true);
    expect(isQuickPanelShortcut({ altKey: false, ctrlKey: true, key: "k", metaKey: true })).toBe(false);
    expect(isQuickPanelShortcut({ altKey: false, ctrlKey: false, key: "k", metaKey: false })).toBe(false);
  });
});
