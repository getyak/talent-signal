use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        Arc, Mutex, OnceLock,
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    thread,
    time::Duration,
};

use chrono::{DateTime, Utc};
use keyring::{Entry, Error as KeyringError};
use reqwest::Client;
use serde::Deserialize;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_notification::NotificationExt;
use uuid::Uuid;
use zeroize::Zeroizing;

use crate::{
    backend::{
        PersistentBinding, build_loopback_client, validate_token, validate_uuid, verify_backend,
    },
    models::{
        ActivateBindingRequest, BindingStatus, CapabilityAvailability, CapabilityReport,
        CaptureRequest, CaptureResult, NotificationRequest, NotificationResult, NotificationState,
        OcrRequest, OcrResult, PlatformScope, QuickPanelRequest, QuickPanelResult,
    },
};

const KEYCHAIN_SERVICE: &str = "com.talentsignal.hybrid.backend-token";
const BINDING_FILE: &str = "hybrid-binding.json";
const MAX_CAPTURE_BYTES: u64 = 12_000_000;
const CAPTURE_TTL_MINUTES: i64 = 10;
const KEYCHAIN_TIMEOUT_SECONDS: u64 = 3;

static KEYCHAIN_BUSY: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

pub struct AppState {
    client: Client,
    credential: Mutex<Option<NativeCredential>>,
    active_capture: Mutex<Option<ActiveCapture>>,
    artifacts: Mutex<HashMap<String, CaptureArtifact>>,
    notification_keys: Mutex<HashSet<String>>,
}

struct NativeCredential {
    binding: PersistentBinding,
    token: Zeroizing<String>,
}

impl AppState {
    pub fn new() -> Result<Self, String> {
        let client = build_loopback_client()?;
        Ok(Self {
            client,
            credential: Mutex::new(None),
            active_capture: Mutex::new(None),
            artifacts: Mutex::new(HashMap::new()),
            notification_keys: Mutex::new(HashSet::new()),
        })
    }
}

#[derive(Clone)]
struct ActiveCapture {
    account_id: String,
    session_id: String,
    intent_id: String,
    output: PathBuf,
    child: Arc<Mutex<Option<Child>>>,
    cancelled: Arc<AtomicBool>,
}

#[derive(Clone)]
struct CaptureArtifact {
    account_id: String,
    session_id: String,
    intent_id: String,
    path: PathBuf,
    expires_at: DateTime<Utc>,
}

#[tauri::command]
pub async fn activate_session_binding(
    app: AppHandle,
    state: State<'_, AppState>,
    request: ActivateBindingRequest,
) -> Result<BindingStatus, String> {
    let mut verified = verify_backend(
        &state.client,
        &request.base_url,
        &request.access_token,
        &request.session_id,
    )
    .await
    .map_err(|failure| failure.message().to_string())?;

    verified.key_id = Uuid::new_v4().to_string();
    write_token(&verified.key_id, request.access_token.clone())?;
    if let Err(error) = write_binding(&app, &verified) {
        let _ = delete_token(&verified.key_id);
        return Err(error);
    }
    *lock(&state.credential)? = Some(NativeCredential {
        binding: verified.clone(),
        token: Zeroizing::new(request.access_token),
    });
    Ok(verified.status())
}

#[tauri::command]
pub async fn session_binding_status(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<BindingStatus, String> {
    let cached = lock(&state.credential)?
        .as_ref()
        .map(|credential| (credential.binding.clone(), credential.token.clone()));
    let (persisted, token) = match cached {
        Some(value) => value,
        None => {
            let persisted = match read_binding(&app)? {
                Some(value) => value,
                None => return Ok(BindingStatus::Unbound { reason: None }),
            };
            if validate_uuid("Keychain binding", &persisted.key_id).is_err() {
                return Ok(BindingStatus::Unbound {
                    reason: Some("旧的本机连接不包含可核验的 Keychain 引用，请重新连接。".into()),
                });
            }
            let token = match read_token(&persisted.key_id) {
                Ok(value) => Zeroizing::new(value),
                Err(error) => {
                    return Ok(BindingStatus::Unbound {
                        reason: Some(error),
                    });
                }
            };
            (persisted, token)
        }
    };
    match verify_backend(
        &state.client,
        &persisted.base_url,
        token.as_str(),
        &persisted.session_id,
    )
    .await
    {
        Ok(verified) => {
            let verified = PersistentBinding {
                key_id: persisted.key_id,
                ..verified
            };
            write_binding(&app, &verified)?;
            *lock(&state.credential)? = Some(NativeCredential {
                binding: verified.clone(),
                token,
            });
            Ok(verified.status())
        }
        Err(failure) => {
            *lock(&state.credential)? = None;
            Ok(failure.status())
        }
    }
}

#[tauri::command]
pub fn disconnect_session_binding(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<BindingStatus, String> {
    cancel_any_capture(&state)?;
    cleanup_artifacts(&state)?;
    let path = binding_path(&app)?;
    let mut warnings = Vec::new();
    let key_id = lock(&state.credential)?
        .as_ref()
        .map(|credential| credential.binding.key_id.clone())
        .or_else(|| {
            read_binding(&app)
                .ok()
                .flatten()
                .map(|binding| binding.key_id)
        });
    let token_removed = key_id
        .as_deref()
        .filter(|value| validate_uuid("Keychain binding", value).is_ok())
        .is_none_or(|value| delete_token(value).is_ok());
    if !token_removed {
        warnings.push("Keychain 令牌未能确认删除");
    }
    let mut binding_removed = true;
    if path.exists() && fs::remove_file(&path).is_err() {
        binding_removed = false;
        warnings.push("本机连接记录未能确认删除");
    }
    *lock(&state.credential)? = None;

    // The token and binding are both required. If at least one is gone the
    // connection is unusable; if both remain, surface the failed disconnect.
    if !token_removed && !binding_removed {
        return Ok(BindingStatus::Revoked {
            reason: "无法安全移除本机连接；原生能力已在当前进程中停用，请重试。".into(),
        });
    }
    Ok(BindingStatus::Unbound {
        reason: (!warnings.is_empty()).then(|| format!("已断开；{}。", warnings.join("，"))),
    })
}

#[tauri::command]
pub fn desktop_capabilities(app: AppHandle) -> CapabilityReport {
    let capture = if screen_capture_permission_granted() {
        CapabilityAvailability::Available
    } else {
        CapabilityAvailability::PermissionRequired
    };
    CapabilityReport {
        window_capture: capture,
        local_ocr: if vision_binary_path(&app).is_some() {
            CapabilityAvailability::Available
        } else {
            CapabilityAvailability::Unavailable
        },
        quick_panel: CapabilityAvailability::Available,
        notification: CapabilityAvailability::Available,
    }
}

#[tauri::command]
pub async fn capture_selected_window(
    app: AppHandle,
    state: State<'_, AppState>,
    request: CaptureRequest,
) -> Result<CaptureResult, String> {
    validate_uuid("intentId", &request.intent_id)?;
    require_verified_scope(&app, &state, &request.scope()).await?;
    purge_expired_artifacts(&state)?;
    let replay = {
        let artifacts = lock(&state.artifacts)?;
        replay_capture_for_intent(
            &artifacts,
            &request.account_id,
            &request.session_id,
            &request.intent_id,
        )
    };
    if let Some(replay) = replay {
        return Ok(replay);
    }

    if lock(&state.active_capture)?.is_some() {
        return Ok(CaptureResult::Failed {
            reason: "已有窗口采集正在进行；未启动第二次系统选择。".into(),
        });
    }

    let output_dir = app
        .path()
        .app_cache_dir()
        .map_err(|_| "无法解析 App 缓存目录。".to_string())?
        .join("captures");
    fs::create_dir_all(&output_dir).map_err(|_| "无法创建受控采集目录。".to_string())?;
    let output = output_dir.join(format!("{}.png", Uuid::new_v4()));

    let child = Command::new("/usr/sbin/screencapture")
        .args(["-i", "-W", "-x"])
        .arg(&output)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "无法启动系统窗口选择器。".to_string())?;

    let active = ActiveCapture {
        account_id: request.account_id.clone(),
        session_id: request.session_id.clone(),
        intent_id: request.intent_id.clone(),
        output: output.clone(),
        child: Arc::new(Mutex::new(Some(child))),
        cancelled: Arc::new(AtomicBool::new(false)),
    };
    {
        let mut slot = lock(&state.active_capture)?;
        if slot.is_some() {
            let mut child = lock(&active.child)?;
            if let Some(mut child) = child.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
            return Ok(CaptureResult::Failed {
                reason: "已有窗口采集正在进行。".into(),
            });
        }
        *slot = Some(active.clone());
    }

    let wait_capture = active.clone();
    let exit = tauri::async_runtime::spawn_blocking(move || wait_for_capture(&wait_capture))
        .await
        .map_err(|_| "系统窗口选择器异常结束。".to_string())?;
    clear_active_capture(&state, &request.intent_id)?;

    if active.cancelled.load(Ordering::SeqCst) {
        remove_if_exists(&output);
        return Ok(CaptureResult::Cancelled);
    }
    match exit {
        CaptureExit::Cancelled => {
            remove_if_exists(&output);
            Ok(CaptureResult::Cancelled)
        }
        CaptureExit::Failed => {
            remove_if_exists(&output);
            if screen_capture_permission_granted() {
                Ok(CaptureResult::Failed {
                    reason: "系统没有生成窗口图像。".into(),
                })
            } else {
                Ok(CaptureResult::Denied {
                    reason: "macOS 屏幕录制权限未授予。".into(),
                })
            }
        }
        CaptureExit::Succeeded => {
            let byte_size = fs::metadata(&output).map(|value| value.len()).unwrap_or(0);
            if byte_size == 0 || byte_size > MAX_CAPTURE_BYTES {
                remove_if_exists(&output);
                return Ok(CaptureResult::Failed {
                    reason: "窗口图像为空或超过 12 MB 上限。".into(),
                });
            }
            let handle = Uuid::new_v4().to_string();
            let expires_at = Utc::now() + chrono::Duration::minutes(CAPTURE_TTL_MINUTES);
            lock(&state.artifacts)?.insert(
                handle.clone(),
                CaptureArtifact {
                    account_id: request.account_id,
                    session_id: request.session_id,
                    intent_id: request.intent_id,
                    path: output,
                    expires_at,
                },
            );
            Ok(CaptureResult::Captured {
                local_handle: handle,
                expires_at: expires_at.to_rfc3339(),
            })
        }
    }
}

#[tauri::command]
pub fn cancel_capture(
    state: State<'_, AppState>,
    request: CaptureRequest,
) -> Result<CaptureResult, String> {
    validate_uuid("intentId", &request.intent_id)?;
    assert_local_scope(&state, &request.scope())?;
    let active = lock(&state.active_capture)?.clone();
    let Some(active) = active else {
        return Ok(CaptureResult::Cancelled);
    };
    if active.account_id != request.account_id
        || active.session_id != request.session_id
        || active.intent_id != request.intent_id
    {
        return Err("取消请求与正在进行的采集意图不一致。".into());
    }
    active.cancelled.store(true, Ordering::SeqCst);
    if let Some(mut child) = lock(&active.child)?.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    remove_if_exists(&active.output);
    Ok(CaptureResult::Cancelled)
}

#[tauri::command]
pub async fn recognize_local_text(
    app: AppHandle,
    state: State<'_, AppState>,
    request: OcrRequest,
) -> Result<OcrResult, String> {
    validate_uuid("localHandle", &request.local_handle)?;
    require_verified_scope(&app, &state, &request.scope()).await?;
    purge_expired_artifacts(&state)?;

    let artifact = lock(&state.artifacts)?
        .get(&request.local_handle)
        .cloned()
        .ok_or_else(|| "采集句柄不存在或已经过期。".to_string())?;
    if artifact.account_id != request.account_id || artifact.session_id != request.session_id {
        return Ok(OcrResult::Denied {
            reason: "采集句柄不属于当前账号与 Session。".into(),
        });
    }
    let Some(binary) = vision_binary_path(&app) else {
        return Ok(OcrResult::Failed {
            reason: "本地 Vision helper 未打包；没有云端回退。".into(),
        });
    };
    let output = tauri::async_runtime::spawn_blocking(move || {
        Command::new(binary)
            .arg(artifact.path)
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output()
    })
    .await
    .map_err(|_| "本地 Vision helper 异常结束。".to_string())?
    .map_err(|_| "无法启动本地 Vision helper。".to_string())?;

    let helper = serde_json::from_slice::<VisionHelperResult>(&output.stdout).ok();
    if !output.status.success() {
        return Ok(OcrResult::Failed {
            reason: helper
                .and_then(|value| value.reason)
                .unwrap_or_else(|| "本地 Vision 识别失败；没有云端回退。".into()),
        });
    }
    let Some(text) = helper.and_then(|value| value.text) else {
        return Ok(OcrResult::Failed {
            reason: "本地 Vision 没有返回文字；没有云端回退。".into(),
        });
    };
    if text.trim().is_empty() || text.chars().count() > 12_000 {
        return Ok(OcrResult::Failed {
            reason: "本地 Vision 输出为空或超过 12,000 字上限。".into(),
        });
    }
    Ok(OcrResult::Recognized {
        local_text: text,
        is_provisional: true,
    })
}

#[tauri::command]
pub async fn open_quick_panel(
    app: AppHandle,
    state: State<'_, AppState>,
    request: QuickPanelRequest,
) -> Result<QuickPanelResult, String> {
    validate_uuid("activityId", &request.activity_id)?;
    if request.label.chars().count() > 120 {
        return Err("快捷面板标签过长。".into());
    }
    require_verified_scope(&app, &state, &request.scope()).await?;

    if let Some(panel) = app.get_webview_window("quick-panel") {
        panel.show().map_err(|_| "无法显示快捷面板。".to_string())?;
        panel
            .set_focus()
            .map_err(|_| "无法聚焦快捷面板。".to_string())?;
        return Ok(QuickPanelResult::Opened {
            panel_id: "quick-panel".into(),
        });
    }
    WebviewWindowBuilder::new(
        &app,
        "quick-panel",
        WebviewUrl::App("quick-panel.html".into()),
    )
    .title("继续当前 Session")
    .inner_size(420.0, 260.0)
    .min_inner_size(360.0, 220.0)
    .resizable(false)
    .always_on_top(true)
    .center()
    .build()
    .map_err(|_| "无法创建本地快捷面板。".to_string())?;
    Ok(QuickPanelResult::Opened {
        panel_id: "quick-panel".into(),
    })
}

#[tauri::command]
pub async fn notify_state(
    app: AppHandle,
    state: State<'_, AppState>,
    request: NotificationRequest,
) -> Result<NotificationResult, String> {
    validate_uuid("activityId", &request.activity_id)?;
    require_verified_scope(&app, &state, &request.scope()).await?;
    let state_name = match request.state {
        NotificationState::Ready => "ready",
        NotificationState::Failed => "failed",
    };
    let key = format!(
        "{}:{}:{}:{state_name}",
        request.account_id, request.session_id, request.activity_id
    );
    {
        let mut keys = lock(&state.notification_keys)?;
        if !keys.insert(key.clone()) {
            return Ok(NotificationResult::Suppressed {
                reason: "相同 Session 状态已经通知。".into(),
            });
        }
    }
    let body = match request.state {
        NotificationState::Ready => "当前 Session 的本机草稿已就绪。",
        NotificationState::Failed => "当前 Session 的本机处理失败。",
    };
    if app
        .notification()
        .builder()
        .title("Talent Signal")
        .body(body)
        .show()
        .is_err()
    {
        lock(&state.notification_keys)?.remove(&key);
        return Ok(NotificationResult::Denied {
            reason: "系统未显示通知；没有泄露 Session 内容。".into(),
        });
    }
    Ok(NotificationResult::Shown)
}

async fn require_verified_scope(
    app: &AppHandle,
    state: &State<'_, AppState>,
    scope: &PlatformScope,
) -> Result<PersistentBinding, String> {
    let (persisted, token) = if let Some(credential) = lock(&state.credential)?.as_ref() {
        (credential.binding.clone(), credential.token.clone())
    } else {
        let persisted =
            read_binding(app)?.ok_or_else(|| "没有已核验的本机 Session 连接。".to_string())?;
        let token = Zeroizing::new(read_token(&persisted.key_id)?);
        (persisted, token)
    };
    persisted.assert_scope(scope)?;
    validate_uuid("Keychain binding", &persisted.key_id)?;
    let verified = verify_backend(
        &state.client,
        &persisted.base_url,
        token.as_str(),
        &persisted.session_id,
    )
    .await
    .map_err(|failure| failure.message().to_string())?;
    let verified = PersistentBinding {
        key_id: persisted.key_id,
        ..verified
    };
    verified.assert_scope(scope)?;
    write_binding(app, &verified)?;
    *lock(&state.credential)? = Some(NativeCredential {
        binding: verified.clone(),
        token,
    });
    Ok(verified)
}

fn assert_local_scope(state: &State<'_, AppState>, scope: &PlatformScope) -> Result<(), String> {
    lock(&state.credential)?
        .as_ref()
        .ok_or_else(|| "没有已核验的本机 Session 连接。".to_string())?
        .binding
        .assert_scope(scope)
}

fn token_entry(key_id: &str) -> Result<Entry, String> {
    Entry::new(KEYCHAIN_SERVICE, &format!("binding-{key_id}"))
        .map_err(|_| "无法访问 macOS Keychain。".to_string())
}

fn read_token(key_id: &str) -> Result<String, String> {
    let token = keychain_operation(key_id, |entry| {
        entry.get_password().map_err(keychain_read_error)
    })?;
    validate_token(&token)?;
    Ok(token)
}

fn keychain_read_error(error: KeyringError) -> String {
    match error {
        KeyringError::NoEntry => "Keychain 中没有可用的本机连接令牌。".to_string(),
        KeyringError::NoStorageAccess(_) => {
            "macOS Keychain 当前不可访问；本机连接保持关闭，请解锁 Keychain 后重试。".to_string()
        }
        _ => "无法从 macOS Keychain 读取本机连接令牌；本机连接保持关闭。".to_string(),
    }
}

fn write_token(key_id: &str, token: String) -> Result<(), String> {
    keychain_operation(key_id, move |entry| {
        entry
            .set_password(&token)
            .map_err(|_| "无法将令牌写入 macOS Keychain。".to_string())
    })
}

fn delete_token(key_id: &str) -> Result<(), String> {
    keychain_operation(key_id, |entry| {
        entry
            .delete_credential()
            .map_err(|_| "无法删除 Keychain 中的本机令牌。".to_string())
    })
}

fn keychain_operation<T, F>(key_id: &str, operation: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(Entry) -> Result<T, String> + Send + 'static,
{
    validate_uuid("Keychain binding", key_id)?;
    let key_id = key_id.to_string();
    let busy = KEYCHAIN_BUSY.get_or_init(|| Mutex::new(HashSet::new()));
    {
        let mut operations = busy
            .lock()
            .map_err(|_| "Keychain 状态暂时不可用。".to_string())?;
        if !operations.insert(key_id.clone()) {
            return Err("该本机连接的 Keychain 操作仍在处理中。".into());
        }
    }

    let (sender, receiver) = mpsc::sync_channel(1);
    let worker_key = key_id.clone();
    thread::spawn(move || {
        let result = token_entry(&worker_key).and_then(operation);
        if let Ok(mut operations) = KEYCHAIN_BUSY
            .get_or_init(|| Mutex::new(HashSet::new()))
            .lock()
        {
            operations.remove(&worker_key);
        }
        let _ = sender.send(result);
    });

    receiver
        .recv_timeout(Duration::from_secs(KEYCHAIN_TIMEOUT_SECONDS))
        .map_err(|_| "macOS Keychain 未在 3 秒内响应；未扩大任何本机权限。".to_string())?
}

fn binding_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|_| "无法解析 App 配置目录。".to_string())?
        .join(BINDING_FILE))
}

fn read_binding(app: &AppHandle) -> Result<Option<PersistentBinding>, String> {
    let path = binding_path(app)?;
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(path).map_err(|_| "无法读取本机连接记录。".to_string())?;
    let value = serde_json::from_slice(&bytes)
        .map_err(|_| "本机连接记录损坏；未授予原生能力。".to_string())?;
    Ok(Some(value))
}

fn write_binding(app: &AppHandle, binding: &PersistentBinding) -> Result<(), String> {
    validate_uuid("Keychain binding", &binding.key_id)?;
    let path = binding_path(app)?;
    let parent = path
        .parent()
        .ok_or_else(|| "本机连接路径无效。".to_string())?;
    fs::create_dir_all(parent).map_err(|_| "无法创建 App 配置目录。".to_string())?;
    let temp = parent.join(format!(".{BINDING_FILE}.tmp"));
    let bytes = serde_json::to_vec(binding).map_err(|_| "无法编码本机连接记录。".to_string())?;
    write_private_file(&temp, &bytes)?;
    fs::rename(temp, path).map_err(|_| "无法原子保存本机连接记录。".to_string())
}

#[cfg(unix)]
fn write_private_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    use std::{io::Write, os::unix::fs::OpenOptionsExt};
    let mut file = fs::OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .mode(0o600)
        .open(path)
        .map_err(|_| "无法写入本机连接记录。".to_string())?;
    file.write_all(bytes)
        .map_err(|_| "无法写入本机连接记录。".to_string())
}

#[cfg(not(unix))]
fn write_private_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    fs::write(path, bytes).map_err(|_| "无法写入本机连接记录。".to_string())
}

fn wait_for_capture(active: &ActiveCapture) -> CaptureExit {
    loop {
        if active.cancelled.load(Ordering::SeqCst) {
            return CaptureExit::Cancelled;
        }
        let result = {
            let mut slot = match active.child.lock() {
                Ok(value) => value,
                Err(_) => return CaptureExit::Failed,
            };
            let Some(child) = slot.as_mut() else {
                return if active.cancelled.load(Ordering::SeqCst) {
                    CaptureExit::Cancelled
                } else {
                    CaptureExit::Failed
                };
            };
            match child.try_wait() {
                Ok(Some(status)) => {
                    *slot = None;
                    Some(status.success())
                }
                Ok(None) => None,
                Err(_) => {
                    *slot = None;
                    Some(false)
                }
            }
        };
        if let Some(success) = result {
            return if success && active.output.exists() {
                CaptureExit::Succeeded
            } else if success {
                CaptureExit::Cancelled
            } else {
                CaptureExit::Failed
            };
        }
        thread::sleep(Duration::from_millis(35));
    }
}

fn clear_active_capture(state: &State<'_, AppState>, intent_id: &str) -> Result<(), String> {
    let mut slot = lock(&state.active_capture)?;
    if slot
        .as_ref()
        .is_some_and(|active| active.intent_id == intent_id)
    {
        *slot = None;
    }
    Ok(())
}

fn cancel_any_capture(state: &State<'_, AppState>) -> Result<(), String> {
    if let Some(active) = lock(&state.active_capture)?.take() {
        active.cancelled.store(true, Ordering::SeqCst);
        if let Some(mut child) = lock(&active.child)?.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        remove_if_exists(&active.output);
    }
    Ok(())
}

fn purge_expired_artifacts(state: &State<'_, AppState>) -> Result<(), String> {
    let now = Utc::now();
    let mut artifacts = lock(&state.artifacts)?;
    artifacts.retain(|_, artifact| {
        if artifact.expires_at <= now {
            remove_if_exists(&artifact.path);
            false
        } else {
            true
        }
    });
    Ok(())
}

fn replay_capture_for_intent(
    artifacts: &HashMap<String, CaptureArtifact>,
    account_id: &str,
    session_id: &str,
    intent_id: &str,
) -> Option<CaptureResult> {
    artifacts.iter().find_map(|(handle, artifact)| {
        (artifact.account_id == account_id
            && artifact.session_id == session_id
            && artifact.intent_id == intent_id
            && artifact.expires_at > Utc::now()
            && artifact.path.is_file())
        .then(|| CaptureResult::Captured {
            local_handle: handle.clone(),
            expires_at: artifact.expires_at.to_rfc3339(),
        })
    })
}

fn cleanup_artifacts(state: &State<'_, AppState>) -> Result<(), String> {
    let mut artifacts = lock(&state.artifacts)?;
    for artifact in artifacts.values() {
        remove_if_exists(&artifact.path);
    }
    artifacts.clear();
    Ok(())
}

fn remove_if_exists(path: &Path) {
    if path.is_file() {
        let _ = fs::remove_file(path);
    }
}

pub fn purge_capture_cache_on_startup(app: &AppHandle) -> Result<(), String> {
    let directory = app
        .path()
        .app_cache_dir()
        .map_err(|_| "无法解析 App 缓存目录。".to_string())?
        .join("captures");
    purge_capture_directory(&directory)
}

fn purge_capture_directory(directory: &Path) -> Result<(), String> {
    if !directory.is_dir() {
        return Ok(());
    }
    let entries = fs::read_dir(directory).map_err(|_| "无法检查残留采集缓存。".to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        let is_png = path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("png"));
        let is_regular_file = entry
            .file_type()
            .map(|value| value.is_file())
            .unwrap_or(false);
        if is_png && is_regular_file {
            remove_if_exists(&path);
        }
    }
    Ok(())
}

fn vision_binary_path(app: &AppHandle) -> Option<PathBuf> {
    let executable = std::env::current_exe().ok()?;
    let bundled = executable.parent()?.join("talent-signal-vision");
    if bundled.is_file() {
        return Some(bundled);
    }
    let target = if cfg!(target_arch = "aarch64") {
        "aarch64-apple-darwin"
    } else if cfg!(target_arch = "x86_64") {
        "x86_64-apple-darwin"
    } else {
        return None;
    };
    let development = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join(format!("talent-signal-vision-{target}"));
    if development.is_file() {
        Some(development)
    } else {
        let _ = app;
        None
    }
}

#[cfg(target_os = "macos")]
fn screen_capture_permission_granted() -> bool {
    #[link(name = "CoreGraphics", kind = "framework")]
    unsafe extern "C" {
        fn CGPreflightScreenCaptureAccess() -> bool;
    }
    // SAFETY: CoreGraphics exposes this argument-free process permission query.
    unsafe { CGPreflightScreenCaptureAccess() }
}

#[cfg(not(target_os = "macos"))]
fn screen_capture_permission_granted() -> bool {
    false
}

fn lock<T>(mutex: &Mutex<T>) -> Result<std::sync::MutexGuard<'_, T>, String> {
    mutex
        .lock()
        .map_err(|_| "本机能力状态暂时不可用。".to_string())
}

#[derive(Clone, Copy)]
enum CaptureExit {
    Cancelled,
    Failed,
    Succeeded,
}

#[derive(Deserialize)]
struct VisionHelperResult {
    text: Option<String>,
    reason: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn notification_body_contains_only_fixed_lifecycle_state() {
        let ready = match NotificationState::Ready {
            NotificationState::Ready => "当前 Session 的本机草稿已就绪。",
            NotificationState::Failed => "当前 Session 的本机处理失败。",
        };
        assert_eq!(ready, "当前 Session 的本机草稿已就绪。");
        assert!(!ready.contains("candidate"));
        assert!(!ready.contains("evidence"));
    }

    #[test]
    fn expired_artifact_shape_never_contains_renderer_path() {
        let result = CaptureResult::Captured {
            local_handle: Uuid::new_v4().to_string(),
            expires_at: Utc::now().to_rfc3339(),
        };
        let json = serde_json::to_string(&result).expect("serialize");
        assert!(json.contains("localHandle"));
        assert!(!json.contains("/tmp"));
        assert!(!json.contains("path"));
    }

    #[test]
    fn vision_failure_result_has_no_cloud_fallback_shape() {
        let result = OcrResult::Failed {
            reason: "本地 Vision 识别失败；没有云端回退。".into(),
        };
        let json = serde_json::to_string(&result).expect("serialize");
        assert!(!json.contains("provider"));
        assert!(!json.contains("upload"));
        assert!(!json.contains("url"));
    }

    #[test]
    fn cancelling_an_active_process_yields_no_capture_artifact() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let output = directory.path().join("must-not-exist.png");
        let child = Command::new("/bin/sleep")
            .arg("5")
            .spawn()
            .expect("start bounded test process");
        let active = ActiveCapture {
            account_id: Uuid::new_v4().to_string(),
            session_id: Uuid::new_v4().to_string(),
            intent_id: Uuid::new_v4().to_string(),
            output: output.clone(),
            child: Arc::new(Mutex::new(Some(child))),
            cancelled: Arc::new(AtomicBool::new(false)),
        };
        let waiter = active.clone();
        let join = thread::spawn(move || wait_for_capture(&waiter));
        thread::sleep(Duration::from_millis(40));
        active.cancelled.store(true, Ordering::SeqCst);
        if let Some(mut child) = active.child.lock().expect("child lock").take() {
            child.kill().expect("kill test process");
            let _ = child.wait();
        }

        assert!(matches!(
            join.join().expect("waiter"),
            CaptureExit::Cancelled
        ));
        assert!(!output.exists());
    }

    #[test]
    fn startup_cleanup_removes_only_direct_capture_images() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let capture = directory.path().join("stale.png");
        let unrelated = directory.path().join("keep.txt");
        fs::write(&capture, b"synthetic").expect("write capture");
        fs::write(&unrelated, b"keep").expect("write unrelated");

        purge_capture_directory(directory.path()).expect("purge capture directory");

        assert!(!capture.exists());
        assert!(unrelated.exists());
    }

    #[test]
    fn same_capture_intent_replays_opaque_handle_without_new_work() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let path = directory.path().join("capture.png");
        fs::write(&path, b"synthetic").expect("write capture");
        let account_id = Uuid::new_v4().to_string();
        let session_id = Uuid::new_v4().to_string();
        let intent_id = Uuid::new_v4().to_string();
        let handle = Uuid::new_v4().to_string();
        let expires_at = Utc::now() + chrono::Duration::minutes(5);
        let artifacts = HashMap::from([(
            handle.clone(),
            CaptureArtifact {
                account_id: account_id.clone(),
                session_id: session_id.clone(),
                intent_id: intent_id.clone(),
                path,
                expires_at,
            },
        )]);

        let replay = replay_capture_for_intent(&artifacts, &account_id, &session_id, &intent_id);

        assert!(matches!(
            replay,
            Some(CaptureResult::Captured { local_handle, .. }) if local_handle == handle
        ));
    }

    #[test]
    fn keychain_read_errors_distinguish_missing_from_unreadable() {
        assert_eq!(
            keychain_read_error(KeyringError::NoEntry),
            "Keychain 中没有可用的本机连接令牌。"
        );
        assert_eq!(
            keychain_read_error(KeyringError::BadStoreFormat("synthetic".into())),
            "无法从 macOS Keychain 读取本机连接令牌；本机连接保持关闭。"
        );
    }
}
