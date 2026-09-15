use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActivateBindingRequest {
    pub base_url: String,
    pub access_token: String,
    pub session_id: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlatformScope {
    pub account_id: String,
    pub session_id: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CaptureRequest {
    pub account_id: String,
    pub session_id: String,
    pub intent_id: String,
}

impl CaptureRequest {
    pub fn scope(&self) -> PlatformScope {
        PlatformScope {
            account_id: self.account_id.clone(),
            session_id: self.session_id.clone(),
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OcrRequest {
    pub account_id: String,
    pub session_id: String,
    pub local_handle: String,
}

impl OcrRequest {
    pub fn scope(&self) -> PlatformScope {
        PlatformScope {
            account_id: self.account_id.clone(),
            session_id: self.session_id.clone(),
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct QuickPanelRequest {
    pub account_id: String,
    pub session_id: String,
    pub activity_id: String,
    pub label: String,
}

impl QuickPanelRequest {
    pub fn scope(&self) -> PlatformScope {
        PlatformScope {
            account_id: self.account_id.clone(),
            session_id: self.session_id.clone(),
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NotificationRequest {
    pub account_id: String,
    pub session_id: String,
    pub activity_id: String,
    pub state: NotificationState,
}

impl NotificationRequest {
    pub fn scope(&self) -> PlatformScope {
        PlatformScope {
            account_id: self.account_id.clone(),
            session_id: self.session_id.clone(),
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NotificationState {
    Ready,
    Failed,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
#[allow(dead_code)]
pub enum CapabilityAvailability {
    Available,
    PermissionRequired,
    Denied,
    Unavailable,
}

#[derive(Clone, Debug, Serialize)]
pub struct CapabilityReport {
    pub window_capture: CapabilityAvailability,
    pub local_ocr: CapabilityAvailability,
    pub quick_panel: CapabilityAvailability,
    pub notification: CapabilityAvailability,
}

#[derive(Clone, Debug, Serialize)]
#[serde(
    tag = "state",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum BindingStatus {
    Unbound {
        reason: Option<String>,
    },
    Stale {
        reason: String,
    },
    Revoked {
        reason: String,
    },
    Verified {
        account_id: String,
        account_name: String,
        session_id: String,
        session_title: String,
        user_display_name: String,
        verified_at: String,
    },
}

#[derive(Clone, Debug, Serialize)]
#[serde(
    tag = "status",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum CaptureResult {
    Cancelled,
    Captured {
        local_handle: String,
        expires_at: String,
    },
    Failed {
        reason: String,
    },
    Denied {
        reason: String,
    },
}

#[derive(Clone, Debug, Serialize)]
#[serde(
    tag = "status",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum OcrResult {
    Recognized {
        local_text: String,
        is_provisional: bool,
    },
    Failed {
        reason: String,
    },
    Denied {
        reason: String,
    },
}

#[derive(Clone, Debug, Serialize)]
#[serde(
    tag = "status",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
#[allow(dead_code)]
pub enum QuickPanelResult {
    Opened { panel_id: String },
    Suppressed { reason: String },
    Denied { reason: String },
}

#[derive(Clone, Debug, Serialize)]
#[serde(
    tag = "status",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum NotificationResult {
    Shown,
    Suppressed { reason: String },
    Denied { reason: String },
}
