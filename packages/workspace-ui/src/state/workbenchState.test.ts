import { describe, expect, it } from "vitest";

import {
  canSubmitComposer,
  capabilityBlockReason,
  composerProvisionalNote,
  initialWorkbenchState,
  workbenchReducer,
} from "./workbenchState.js";

describe("composer provisional state", () => {
  it("never allows submit while the IME composition is active", () => {
    let state = workbenchReducer(initialWorkbenchState, {
      type: "composer/changed",
      value: "张",
    });
    expect(state.composer.composing).toBe(false);
    expect(canSubmitComposer(state)).toBe(true);

    state = workbenchReducer(state, { type: "composer/composition-started" });
    expect(state.composer.composing).toBe(true);
    expect(canSubmitComposer(state)).toBe(false);
    expect(composerProvisionalNote(state)).toContain("尚未确认");

    // The IME rewrites the buffer mid-composition; it stays provisional.
    state = workbenchReducer(state, { type: "composer/changed", value: "张三" });
    expect(canSubmitComposer(state)).toBe(false);

    state = workbenchReducer(state, {
      type: "composer/composition-ended",
      value: "张三",
    });
    expect(state.composer.composing).toBe(false);
    expect(state.composer.value).toBe("张三");
    expect(canSubmitComposer(state)).toBe(true);
    expect(composerProvisionalNote(state)).toBeNull();
  });

  it("refuses an empty or whitespace-only composer", () => {
    expect(canSubmitComposer(initialWorkbenchState)).toBe(false);
    expect(
      canSubmitComposer(
        workbenchReducer(initialWorkbenchState, { type: "composer/changed", value: "   " }),
      ),
    ).toBe(false);
  });
});

describe("native outcomes preserve their exact terminal state", () => {
  it("keeps cancelled distinct from captured and failed", () => {
    const cancelled = workbenchReducer(initialWorkbenchState, {
      type: "capture/settled",
      result: { status: "cancelled" },
    });
    expect(cancelled.capture.kind).toBe("cancelled");

    const captured = workbenchReducer(initialWorkbenchState, {
      type: "capture/settled",
      result: { status: "captured", localHandle: "h1", expiresAt: "2026-01-01T00:00:00Z" },
    });
    expect(captured.capture.kind).toBe("captured");

    const unavailable = workbenchReducer(initialWorkbenchState, {
      type: "capture/settled",
      result: { status: "unavailable", capability: "window_capture", reason: "no bridge" },
    });
    expect(unavailable.capture.kind).toBe("unavailable");
  });

  it("does not populate draft text on OCR failure or unavailability", () => {
    const failed = workbenchReducer(initialWorkbenchState, {
      type: "ocr/settled",
      result: { status: "failed", reason: "engine error" },
    });
    expect(failed.draftText).toBe("");
    expect(failed.ocr.kind).toBe("failed");

    const unavailable = workbenchReducer(initialWorkbenchState, {
      type: "ocr/settled",
      result: { status: "unavailable", capability: "local_ocr", reason: "no bridge" },
    });
    expect(unavailable.draftText).toBe("");
    expect(unavailable.ocr.kind).toBe("unavailable");
  });

  it("marks OCR-recognized text as local and keeps it editable", () => {
    let state = workbenchReducer(initialWorkbenchState, {
      type: "ocr/settled",
      result: { status: "recognized", localText: "候选人提到下周一", isProvisional: true },
    });
    expect(state.draftText).toBe("候选人提到下周一");

    state = workbenchReducer(state, { type: "draft/edited", value: "修改后的草稿" });
    expect(state.draftText).toBe("修改后的草稿");
  });

  it("distinguishes requested, suppressed, denied, and unavailable notifications", () => {
    const kinds = (
      [
        { status: "requested" },
        { status: "suppressed", reason: "duplicate" },
        { status: "denied", reason: "system" },
        { status: "unavailable", capability: "notification", reason: "none" },
      ] as const
    ).map(
      (result) =>
        workbenchReducer(initialWorkbenchState, { type: "notification/settled", result })
          .notification.kind,
    );
    expect(kinds).toEqual(["requested", "suppressed", "denied", "unavailable"]);
  });
});

describe("capabilityBlockReason", () => {
  it("returns null only for available capabilities", () => {
    expect(capabilityBlockReason({ window_capture: "available" } as never, "window_capture")).toBeNull();
    expect(
      capabilityBlockReason({ local_ocr: "permission_required" } as never, "local_ocr"),
    ).toContain("权限");
    expect(capabilityBlockReason({ quick_panel: "denied" } as never, "quick_panel")).toContain(
      "拒绝",
    );
    expect(capabilityBlockReason(null, "notification")).toContain("不可用");
  });
});
