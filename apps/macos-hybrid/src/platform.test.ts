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
      "cancel_ocr",
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

  it("can cancel an exact persisted capture intent after renderer recovery", async () => {
    const calls: string[] = [];
    const invoke = (async (command: string) => {
      calls.push(command);
      return { status: "cancelled" };
    }) as Invoke;

    await expect(
      createDesktopPlatformAdapter(invoke).cancelCapture({
        accountId: "a",
        sessionId: "s",
        intentId: "i",
      }),
    ).resolves.toEqual({ status: "cancelled" });
    expect(calls).toEqual(["cancel_capture"]);
  });

  it("does not start OCR when it was already cancelled", async () => {
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
    ).resolves.toEqual({ status: "cancelled" });
    expect(calls).toEqual([]);
  });

  it("propagates in-flight OCR cancellation to the native helper", async () => {
    const calls: string[] = [];
    let releaseOcr: ((value: unknown) => void) | undefined;
    const invoke = (async (command: string) => {
      calls.push(command);
      if (command === "recognize_local_text") {
        return await new Promise<unknown>((resolve) => { releaseOcr = resolve; });
      }
      return { status: "cancelled" };
    }) as Invoke;
    const controller = new AbortController();
    const pending = createDesktopPlatformAdapter(invoke).recognizeLocalText(
      { accountId: "a", sessionId: "s", localHandle: "h" },
      controller.signal,
    );
    controller.abort();
    await Promise.resolve();
    expect(calls).toContain("cancel_ocr");
    releaseOcr?.({ status: "cancelled" });
    await expect(pending).resolves.toEqual({ status: "cancelled" });
  });

  it("recognizes only the focused macOS quick-panel shortcut", () => {
    expect(isQuickPanelShortcut({ altKey: false, ctrlKey: false, key: "k", metaKey: true })).toBe(true);
    expect(isQuickPanelShortcut({ altKey: false, ctrlKey: true, key: "k", metaKey: true })).toBe(false);
    expect(isQuickPanelShortcut({ altKey: false, ctrlKey: false, key: "k", metaKey: false })).toBe(false);
  });
});
