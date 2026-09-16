export {
  NativeCapabilityWorkbench,
  type NativeCapabilityWorkbenchProps,
  type WorkbenchScope,
} from "./components/NativeCapabilityWorkbench.js";

export {
  NativeCapabilityStatus,
  type NativeCapabilityStatusProps,
} from "./components/NativeCapabilityStatus.js";

export {
  PLATFORM_CAPABILITIES,
  availabilityFor,
  availabilityLabel,
  createUnavailablePlatformAdapter,
  type CapabilityAvailability,
  type CapabilityReport,
  type CaptureRequest,
  type CaptureResult,
  type OcrRequest,
  type OcrResult,
  type PlatformAdapter,
  type PlatformCapability,
  type PlatformScope,
  type PlatformUnavailableResult,
  type QuickPanelRequest,
  type QuickPanelResult,
  type StateNotificationRequest,
  type StateNotificationResult,
} from "./platform/ports.js";

export {
  canSubmitComposer,
  capabilityBlockReason,
  composerProvisionalNote,
  initialWorkbenchState,
  workbenchReducer,
  type CaptureOutcome,
  type ComposerText,
  type NotificationOutcome,
  type OcrOutcome,
  type QuickPanelOutcome,
  type WorkbenchAction,
  type WorkbenchState,
} from "./state/workbenchState.js";

export {
  WORKSPACE_SURFACE_CLASS,
  quietTheme,
  type QuietTheme,
} from "./theme/tokens.js";
