use chrono::{DateTime, Utc};
use std::time::Duration;

use reqwest::{Client, StatusCode, redirect::Policy};
use serde::{Deserialize, Serialize};
use url::Url;
use uuid::Uuid;

use crate::models::{BindingStatus, PlatformScope};

const CONTRACT_VERSION: &str = "2026-08-24.10";

pub fn build_loopback_client() -> Result<Client, String> {
    Client::builder()
        .connect_timeout(Duration::from_secs(3))
        .timeout(Duration::from_secs(8))
        .no_proxy()
        // A loopback endpoint must not redirect an authenticated request to
        // another origin. Reqwest otherwise follows redirects by default and
        // may forward the bearer credential outside the local boundary.
        .redirect(Policy::none())
        .build()
        .map_err(|_| "无法初始化本机后端适配器。".to_string())
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PersistentBinding {
    #[serde(default)]
    pub key_id: String,
    pub base_url: String,
    pub account_id: String,
    pub account_name: String,
    pub session_id: String,
    pub session_title: String,
    pub user_id: String,
    pub user_display_name: String,
    pub verified_at: DateTime<Utc>,
}

impl PersistentBinding {
    pub fn status(&self) -> BindingStatus {
        BindingStatus::Verified {
            account_id: self.account_id.clone(),
            account_name: self.account_name.clone(),
            session_id: self.session_id.clone(),
            session_title: self.session_title.clone(),
            user_display_name: self.user_display_name.clone(),
            verified_at: self.verified_at.to_rfc3339(),
        }
    }

    pub fn assert_scope(&self, scope: &PlatformScope) -> Result<(), String> {
        validate_uuid("accountId", &scope.account_id)?;
        validate_uuid("sessionId", &scope.session_id)?;
        if self.account_id != scope.account_id || self.session_id != scope.session_id {
            return Err("请求作用域与已核验的账号或 Session 不一致。".into());
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
struct AuthResponse {
    contract_version: String,
    expires_at: DateTime<Utc>,
    account: AuthAccount,
    user: AuthUser,
}

#[derive(Debug, Deserialize)]
struct AuthAccount {
    id: String,
    name: String,
}

#[derive(Debug, Deserialize)]
struct AuthUser {
    id: String,
    display_name: String,
}

#[derive(Debug, Deserialize)]
struct AgentSessionResponse {
    contract_version: String,
    session: AgentSession,
}

#[derive(Debug, Deserialize)]
struct AgentSession {
    session_id: String,
    expires_at: DateTime<Utc>,
    deleted_at: Option<DateTime<Utc>>,
    payload: Option<AgentSessionPayload>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentSessionPayload {
    title: String,
}

pub fn validate_loopback_base_url(raw: &str) -> Result<Url, String> {
    if raw.len() > 256 {
        return Err("本机后端地址过长。".into());
    }
    let mut url = Url::parse(raw.trim()).map_err(|_| "本机后端地址格式无效。".to_string())?;
    if url.scheme() != "http" {
        return Err("本机适配器只接受显式的 http loopback 地址。".into());
    }
    let allowed_host = matches!(
        url.host_str(),
        Some("127.0.0.1" | "localhost" | "::1" | "[::1]")
    );
    if !allowed_host
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
    {
        return Err("地址必须是没有凭据、路径、查询或片段的 loopback 根地址。".into());
    }
    let port = url
        .port()
        .ok_or_else(|| "必须显式指定本机端口。".to_string())?;
    if port < 1024 {
        return Err("本机后端端口必须位于非特权端口范围。".into());
    }
    url.set_path("/");
    Ok(url)
}

pub fn validate_uuid(label: &str, value: &str) -> Result<(), String> {
    Uuid::parse_str(value)
        .map(|_| ())
        .map_err(|_| format!("{label} 必须是 UUID。"))
}

pub fn validate_token(token: &str) -> Result<(), String> {
    if token.len() < 20 || token.len() > 4096 || token.chars().any(char::is_whitespace) {
        return Err("Access token 长度或格式无效。".into());
    }
    Ok(())
}

pub async fn verify_backend(
    client: &Client,
    base_url: &str,
    token: &str,
    session_id: &str,
) -> Result<PersistentBinding, VerificationFailure> {
    let base = validate_loopback_base_url(base_url).map_err(VerificationFailure::Invalid)?;
    validate_token(token).map_err(VerificationFailure::Invalid)?;
    validate_uuid("Agent Session ID", session_id).map_err(VerificationFailure::Invalid)?;

    let auth_url = base
        .join("v1/auth/session")
        .map_err(|_| VerificationFailure::Invalid("无法构造认证端点。".into()))?;
    let auth_response = client
        .get(auth_url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|_| VerificationFailure::Stale("本机后端当前不可达。".into()))?;
    classify_status(auth_response.status())?;
    let auth = auth_response
        .json::<AuthResponse>()
        .await
        .map_err(|_| VerificationFailure::Revoked("认证响应不符合当前数据契约。".into()))?;
    if auth.contract_version != CONTRACT_VERSION {
        return Err(VerificationFailure::Revoked(format!(
            "后端契约版本不兼容：需要 {CONTRACT_VERSION}。"
        )));
    }
    validate_uuid("accountId", &auth.account.id).map_err(VerificationFailure::Revoked)?;
    validate_uuid("userId", &auth.user.id).map_err(VerificationFailure::Revoked)?;
    if auth.expires_at <= Utc::now() {
        return Err(VerificationFailure::Revoked("认证会话已过期。".into()));
    }

    let session_url = base
        .join(&format!("v1/agent-sessions/{session_id}"))
        .map_err(|_| VerificationFailure::Invalid("无法构造 Session 端点。".into()))?;
    let session_response = client
        .get(session_url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|_| VerificationFailure::Stale("核验 Agent Session 时本机后端不可达。".into()))?;
    classify_status(session_response.status())?;
    let session = session_response
        .json::<AgentSessionResponse>()
        .await
        .map_err(|_| {
            VerificationFailure::Revoked("Agent Session 响应不符合当前数据契约。".into())
        })?;
    if session.contract_version != CONTRACT_VERSION
        || session.session.session_id != session_id
        || session.session.deleted_at.is_some()
        || session.session.payload.is_none()
        || session.session.expires_at <= Utc::now()
    {
        return Err(VerificationFailure::Revoked(
            "Agent Session 已删除、过期或身份不一致。".into(),
        ));
    }
    let payload = session.session.payload.expect("checked above");

    Ok(PersistentBinding {
        key_id: String::new(),
        base_url: base.as_str().trim_end_matches('/').to_string(),
        account_id: auth.account.id,
        account_name: bounded_label(auth.account.name, "当前账号"),
        session_id: session_id.to_string(),
        session_title: bounded_label(payload.title, "未命名 Session"),
        user_id: auth.user.id,
        user_display_name: bounded_label(auth.user.display_name, "当前用户"),
        verified_at: Utc::now(),
    })
}

fn bounded_label(value: String, fallback: &str) -> String {
    let value = value.trim();
    if value.is_empty() {
        return fallback.into();
    }
    value.chars().take(200).collect()
}

fn classify_status(status: StatusCode) -> Result<(), VerificationFailure> {
    if status.is_success() {
        return Ok(());
    }
    if matches!(
        status,
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN | StatusCode::NOT_FOUND | StatusCode::GONE
    ) {
        return Err(VerificationFailure::Revoked(
            "凭据或 Agent Session 已失效，未授予本机能力。".into(),
        ));
    }
    Err(VerificationFailure::Stale(format!(
        "本机后端暂时无法核验（HTTP {}）。",
        status.as_u16()
    )))
}

#[derive(Debug)]
pub enum VerificationFailure {
    Invalid(String),
    Stale(String),
    Revoked(String),
}

impl VerificationFailure {
    pub fn message(&self) -> &str {
        match self {
            Self::Invalid(message) | Self::Stale(message) | Self::Revoked(message) => message,
        }
    }

    pub fn status(&self) -> BindingStatus {
        match self {
            Self::Invalid(message) | Self::Revoked(message) => BindingStatus::Revoked {
                reason: message.clone(),
            },
            Self::Stale(message) => BindingStatus::Stale {
                reason: message.clone(),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{
        io::{Read, Write},
        net::TcpListener,
        sync::mpsc,
        thread,
        time::{Duration, Instant},
    };

    use super::*;

    #[test]
    fn accepts_only_explicit_loopback_http_ports() {
        assert!(validate_loopback_base_url("http://127.0.0.1:4336").is_ok());
        assert!(validate_loopback_base_url("http://localhost:4336").is_ok());
        assert!(validate_loopback_base_url("http://[::1]:4336").is_ok());
        for rejected in [
            "https://127.0.0.1:4336",
            "http://127.0.0.1",
            "http://127.0.0.1:80",
            "http://example.com:4336",
            "http://127.0.0.1:4336/private",
            "http://token@127.0.0.1:4336",
            "http://127.0.0.1:4336?next=remote",
        ] {
            assert!(
                validate_loopback_base_url(rejected).is_err(),
                "accepted {rejected}"
            );
        }
    }

    #[test]
    fn scope_mismatch_fails_closed() {
        let binding = PersistentBinding {
            key_id: Uuid::new_v4().to_string(),
            base_url: "http://127.0.0.1:4336".into(),
            account_id: Uuid::new_v4().to_string(),
            account_name: "Synthetic".into(),
            session_id: Uuid::new_v4().to_string(),
            session_title: "Synthetic session".into(),
            user_id: Uuid::new_v4().to_string(),
            user_display_name: "Synthetic user".into(),
            verified_at: Utc::now(),
        };
        let wrong = PlatformScope {
            account_id: Uuid::new_v4().to_string(),
            session_id: binding.session_id.clone(),
        };
        assert!(binding.assert_scope(&wrong).is_err());
    }

    #[test]
    fn authenticated_requests_do_not_follow_loopback_redirects() {
        let redirect_target = TcpListener::bind("127.0.0.1:0").expect("target listener");
        redirect_target
            .set_nonblocking(true)
            .expect("nonblocking target");
        let redirect_port = redirect_target.local_addr().expect("target address").port();
        let (target_sender, target_receiver) = mpsc::sync_channel(1);
        let target_worker = thread::spawn(move || {
            let deadline = Instant::now() + Duration::from_millis(750);
            while Instant::now() < deadline {
                match redirect_target.accept() {
                    Ok((mut stream, _)) => {
                        let _ = stream.write_all(
                            b"HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                        );
                        let _ = target_sender.send(true);
                        return;
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(10));
                    }
                    Err(_) => break,
                }
            }
            let _ = target_sender.send(false);
        });

        let source = TcpListener::bind("127.0.0.1:0").expect("source listener");
        let source_port = source.local_addr().expect("source address").port();
        let source_worker = thread::spawn(move || {
            let (mut stream, _) = source.accept().expect("source request");
            stream
                .set_read_timeout(Some(Duration::from_secs(1)))
                .expect("source read timeout");
            let mut request = [0_u8; 2048];
            let _ = stream.read(&mut request);
            write!(
                stream,
                "HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:{redirect_port}/capture\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
            )
            .expect("redirect response");
        });

        let result = tauri::async_runtime::block_on(verify_backend(
            &build_loopback_client().expect("loopback client"),
            &format!("http://127.0.0.1:{source_port}"),
            "synthetic-token-for-redirect-test",
            &Uuid::new_v4().to_string(),
        ));

        source_worker.join().expect("source worker");
        assert!(matches!(result, Err(VerificationFailure::Stale(_))));
        assert!(
            !target_receiver
                .recv_timeout(Duration::from_secs(1))
                .expect("redirect target observation")
        );
        target_worker.join().expect("target worker");
    }
}
