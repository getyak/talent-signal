/**
 * Pure state model for the capability workbench.
 *
 * The reducer has no side effects and no platform access. It exists so the
 * provisional nature of composer text (IME), the exact terminal state of each
 * native request, and the absence of canonical/external authority can be
 * asserted directly in tests.
 */

import type {
  CapabilityReport,
  CaptureResult,
  OcrResult,
  PlatformCapability,
  PlatformUnavailableResult,
  QuickPanelResult,
  StateNotificationResult,
} from "../platform/ports.js";

export type ComposerText = {
  readonly value: string;
  /**
   * True while an IME composition is active. Composition text is provisional:
   * it must never be submitted, persisted, or treated as confirmed intent.
   */
  readonly composing: boolean;
};

export type WorkbenchState = {
  readonly composer: ComposerText;
  /**
   * Local-only OCR output. Explicitly provisional and editable; it is never
   * canonical evidence and never an external write.
   */
  readonly draftText: string;
  readonly capture: CaptureOutcome;
  readonly ocr: OcrOutcome;
  readonly quickPanel: QuickPanelOutcome;
  readonly notification: NotificationOutcome;
};

export type IdleOutcome = { readonly kind: "idle" };

export type PendingOutcome = { readonly kind: "pending"; readonly capability: PlatformCapability };

export type CaptureOutcome =
  | IdleOutcome
  | PendingOutcome
  | { readonly kind: "cancelled" }
  | { readonly kind: "captured"; readonly localHandle: string; readonly expiresAt: string }
  | { readonly kind: "failed" | "denied"; readonly reason: string }
  | { readonly kind: "unavailable"; readonly reason: string };

export type OcrOutcome =
  | IdleOutcome
  | PendingOutcome
  | { readonly kind: "recognized"; readonly localText: string }
  | { readonly kind: "failed" | "denied"; readonly reason: string }
  | { readonly kind: "unavailable"; readonly reason: string };

export type QuickPanelOutcome =
  | IdleOutcome
  | PendingOutcome
  | { readonly kind: "opened"; readonly panelId: string }
  | { readonly kind: "suppressed" | "denied"; readonly reason: string }
  | { readonly kind: "unavailable"; readonly reason: string };

export type NotificationOutcome =
  | IdleOutcome
  | { readonly kind: "shown" }
  | { readonly kind: "suppressed" | "denied"; readonly reason: string }
  | { readonly kind: "unavailable"; readonly reason: string };

export type WorkbenchAction =
  | { readonly type: "composer/changed"; readonly value: string }
  | { readonly type: "composer/composition-started" }
  | { readonly type: "composer/composition-ended"; readonly value: string }
  | { readonly type: "capture/pending" }
  | { readonly type: "capture/settled"; readonly result: CaptureResult }
  | { readonly type: "ocr/pending" }
  | { readonly type: "ocr/settled"; readonly result: OcrResult }
  | { readonly type: "quick-panel/pending" }
  | { readonly type: "quick-panel/settled"; readonly result: QuickPanelResult }
  | { readonly type: "notification/settled"; readonly result: StateNotificationResult }
  | { readonly type: "draft/edited"; readonly value: string };

export const initialWorkbenchState: WorkbenchState = {
  composer: { value: "", composing: false },
  draftText: "",
  capture: { kind: "idle" },
  ocr: { kind: "idle" },
  quickPanel: { kind: "idle" },
  notification: { kind: "idle" },
};

function unavailableOutcome(result: PlatformUnavailableResult): {
  readonly kind: "unavailable";
  readonly reason: string;
} {
  return { kind: "unavailable", reason: result.reason };
}

export function workbenchReducer(
  state: WorkbenchState,
  action: WorkbenchAction,
): WorkbenchState {
  switch (action.type) {
    case "composer/changed":
      // Editing while composing is expected: the IME may rewrite the buffer.
      return { ...state, composer: { composing: state.composer.composing, value: action.value } };
    case "composer/composition-started":
      return { ...state, composer: { ...state.composer, composing: true } };
    case "composer/composition-ended":
      return { ...state, composer: { composing: false, value: action.value } };
    case "capture/pending":
      return { ...state, capture: { kind: "pending", capability: "window_capture" } };
    case "capture/settled":
      return { ...state, capture: captureOutcome(action.result) };
    case "ocr/pending":
      return { ...state, ocr: { kind: "pending", capability: "local_ocr" } };
    case "ocr/settled":
      return {
        ...state,
        draftText:
          action.result.status === "recognized" ? action.result.localText : state.draftText,
        ocr: ocrOutcome(action.result),
      };
    case "quick-panel/pending":
      return { ...state, quickPanel: { kind: "pending", capability: "quick_panel" } };
    case "quick-panel/settled":
      return { ...state, quickPanel: quickPanelOutcome(action.result) };
    case "notification/settled":
      return { ...state, notification: notificationOutcome(action.result) };
    case "draft/edited":
      return { ...state, draftText: action.value };
  }
}

export function captureOutcome(result: CaptureResult): CaptureOutcome {
  switch (result.status) {
    case "cancelled":
      return { kind: "cancelled" };
    case "captured":
      return { kind: "captured", localHandle: result.localHandle, expiresAt: result.expiresAt };
    case "failed":
      return { kind: "failed", reason: result.reason };
    case "denied":
      return { kind: "denied", reason: result.reason };
    case "unavailable":
      return unavailableOutcome(result);
  }
}

export function ocrOutcome(result: OcrResult): OcrOutcome {
  switch (result.status) {
    case "recognized":
      return { kind: "recognized", localText: result.localText };
    case "failed":
      return { kind: "failed", reason: result.reason };
    case "denied":
      return { kind: "denied", reason: result.reason };
    case "unavailable":
      return unavailableOutcome(result);
  }
}

export function quickPanelOutcome(result: QuickPanelResult): QuickPanelOutcome {
  switch (result.status) {
    case "opened":
      return { kind: "opened", panelId: result.panelId };
    case "suppressed":
      return { kind: "suppressed", reason: result.reason };
    case "denied":
      return { kind: "denied", reason: result.reason };
    case "unavailable":
      return unavailableOutcome(result);
  }
}

export function notificationOutcome(result: StateNotificationResult): NotificationOutcome {
  switch (result.status) {
    case "shown":
      return { kind: "shown" };
    case "suppressed":
      return { kind: "suppressed", reason: result.reason };
    case "denied":
      return { kind: "denied", reason: result.reason };
    case "unavailable":
      return unavailableOutcome(result);
  }
}

/**
 * Whether the composer may be submitted. Composition text is provisional, so a
 * real submit is refused until the IME composition has ended. Even then the
 * result is only a local draft: it carries no canonical or external authority.
 */
export function canSubmitComposer(state: WorkbenchState): boolean {
  return !state.composer.composing && state.composer.value.trim().length > 0;
}

export function composerProvisionalNote(state: WorkbenchState): string | null {
  if (state.composer.composing) {
    return "正在输入法组合中，文本尚未确认；不会提交，也不会被当作已确认意图。";
  }
  return null;
}

export function capabilityBlockReason(
  report: CapabilityReport | null | undefined,
  capability: PlatformCapability,
): string | null {
  const availability = report?.[capability];
  switch (availability) {
    case "available":
      return null;
    case "permission_required":
      return "需要系统权限；授予以操作系统提示为准，本界面不会假定已获得。";
    case "denied":
      return "权限被拒绝；不会回退到其他采集或云端处理。";
    default:
      return "当前主机不提供该原生能力。";
  }
}
