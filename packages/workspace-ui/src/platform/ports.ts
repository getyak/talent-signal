/**
 * Typed platform capability contracts.
 *
 * These types mirror the design handoff `contracts.ts` PlatformPort surface and
 * deliberately keep three things separate:
 *
 * 1. capability *availability* (`available` / `permission_required` / `denied`),
 * 2. a *requested* user action and its outcome, and
 * 3. any canonical or external state.
 *
 * Nothing in this file can manufacture success. Every operation returns an
 * explicit terminal state; the absence of a real host implementation is
 * represented by {@link PlatformUnavailableResult}, never by a synthetic value.
 */

/** The bounded set of native capabilities the shared surface may request. */
export const PLATFORM_CAPABILITIES = [
  "window_capture",
  "local_ocr",
  "quick_panel",
  "notification",
] as const;

export type PlatformCapability = (typeof PLATFORM_CAPABILITIES)[number];

/**
 * Availability as reported by the host. This is a claim about the platform, not
 * about the current account or about any resulting data.
 */
export type CapabilityAvailability =
  | "available"
  | "permission_required"
  | "denied"
  | "unavailable";

export type CapabilityReport = Readonly<
  Record<PlatformCapability, CapabilityAvailability>
>;

/** Result of any operation that had no real host implementation to call. */
export type PlatformUnavailableResult = {
  readonly status: "unavailable";
  readonly capability: PlatformCapability;
  readonly reason: string;
};

/**
 * Account and session scope every native request must carry. The host validates
 * this scope; the renderer never widens it.
 */
export type PlatformScope = {
  readonly accountId: string;
  readonly sessionId: string;
};

/**
 * A capture request always carries an intent id so that retries can be matched
 * to the same declared intent instead of silently expanding scope.
 */
export type CaptureRequest = PlatformScope & {
  readonly intentId: string;
};

export type CaptureResult =
  | { readonly status: "cancelled" }
  | {
      readonly status: "captured";
      readonly localHandle: string;
      readonly expiresAt: string;
    }
  | { readonly status: "failed"; readonly reason: string }
  | { readonly status: "denied"; readonly reason: string }
  | PlatformUnavailableResult;

export type OcrRequest = PlatformScope & {
  /** A local handle returned by a completed capture in this session. */
  readonly localHandle: string;
};

/**
 * Local OCR may fail. There is no cloud fallback: the only recovery is an
 * editable draft owned by the user.
 */
export type OcrResult =
  | {
      readonly status: "recognized";
      readonly localText: string;
      readonly isProvisional: true;
    }
  | { readonly status: "failed"; readonly reason: string }
  | { readonly status: "denied"; readonly reason: string }
  | PlatformUnavailableResult;

export type QuickPanelRequest = PlatformScope & {
  readonly activityId: string;
  readonly label: string;
};

export type QuickPanelResult =
  | { readonly status: "opened"; readonly panelId: string }
  | { readonly status: "suppressed"; readonly reason: string }
  | { readonly status: "denied"; readonly reason: string }
  | PlatformUnavailableResult;

export type StateNotificationRequest = PlatformScope & {
  readonly activityId: string;
  /**
   * Only lifecycle state may cross into a notification. Never evidence,
   * message content, or an action the user did not perform.
   */
  readonly state: "ready" | "failed";
};

export type StateNotificationResult =
  | { readonly status: "shown" }
  | { readonly status: "suppressed"; readonly reason: string }
  | { readonly status: "denied"; readonly reason: string }
  | PlatformUnavailableResult;

/**
 * The injected platform adapter. A host provides exactly one implementation;
 * the shared component never imports Tauri, Electron, `window`, or `fetch`.
 */
export type PlatformAdapter = {
  readonly host: "web" | "desktop";
  readonly capabilities: () => Promise<CapabilityReport>;
  readonly captureSelectedWindow: (
    request: CaptureRequest,
    signal?: AbortSignal,
  ) => Promise<CaptureResult>;
  readonly recognizeLocalText: (
    request: OcrRequest,
    signal?: AbortSignal,
  ) => Promise<OcrResult>;
  readonly openQuickPanel: (request: QuickPanelRequest) => Promise<QuickPanelResult>;
  readonly notifyState: (
    request: StateNotificationRequest,
  ) => Promise<StateNotificationResult>;
};

/**
 * A fail-closed adapter used by hosts that genuinely have no native surface.
 * It reports every capability as `unavailable` and refuses every request with
 * {@link PlatformUnavailableResult}; it never resolves to a success shape.
 */
export function createUnavailablePlatformAdapter(input: {
  readonly host: "web" | "desktop";
  readonly reason: string;
}): PlatformAdapter {
  const unavailable = (capability: PlatformCapability): PlatformUnavailableResult => ({
    status: "unavailable",
    capability,
    reason: input.reason,
  });

  return {
    host: input.host,
    capabilities: async () =>
      Object.freeze({
        window_capture: "unavailable",
        local_ocr: "unavailable",
        quick_panel: "unavailable",
        notification: "unavailable",
      } satisfies CapabilityReport),
    captureSelectedWindow: async () => unavailable("window_capture"),
    recognizeLocalText: async () => unavailable("local_ocr"),
    openQuickPanel: async () => unavailable("quick_panel"),
    notifyState: async () => unavailable("notification"),
  };
}

/**
 * Capability availability is host-reported. Unknown or malformed reports are
 * treated as `unavailable` rather than assumed healthy.
 */
export function availabilityFor(
  report: CapabilityReport | null | undefined,
  capability: PlatformCapability,
): CapabilityAvailability {
  const value = report?.[capability];
  if (value === "available" || value === "permission_required" || value === "denied") {
    return value;
  }
  return "unavailable";
}

/** Copy for each availability state, so hosts cannot invent optimistic labels. */
export function availabilityLabel(availability: CapabilityAvailability): string {
  switch (availability) {
    case "available":
      return "可用";
    case "permission_required":
      return "需要权限";
    case "denied":
      return "权限被拒绝";
    case "unavailable":
      return "当前主机不可用";
  }
}
