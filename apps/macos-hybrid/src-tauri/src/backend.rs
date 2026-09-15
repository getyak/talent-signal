use chrono::{DateTime, Utc};
use std::{sync::Arc, time::Duration};

use reqwest::{Client, ClientBuilder, Response, StatusCode, redirect::Policy};
use rustls::{
    DigitallySignedStruct, RootCertStore, SignatureScheme,
    client::{
        WebPkiServerVerifier,
        danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier},
    },
    pki_types::{CertificateDer, ServerName, UnixTime, pem::PemObject},
};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use sha2::{Digest, Sha256};
use url::Url;
use uuid::Uuid;

use crate::models::{BindingStatus, PlatformScope};

const CONTRACT_VERSION: &str = "2026-08-24.10";
const MAX_CERTIFICATE_BYTES: usize = 16_384;
const MAX_VERIFICATION_RESPONSE_BYTES: usize = 64 * 1024;

fn bounded_client_builder() -> ClientBuilder {
    Client::builder()
        .connect_timeout(Duration::from_secs(3))
        .timeout(Duration::from_secs(8))
        .no_proxy()
        // A loopback endpoint must not redirect an authenticated request to
        // another origin. Reqwest otherwise follows redirects by default and
        // may forward the bearer credential outside the local boundary.
        .redirect(Policy::none())
}

pub fn build_loopback_client(server_certificate_pem: &str) -> Result<Client, String> {
    let server_certificate_pem = canonical_server_certificate_pem(server_certificate_pem)?;
    let certificate = CertificateDer::from_pem_slice(server_certificate_pem.as_bytes())
        .map_err(|_| "本机 TLS 服务器证书格式无效。".to_string())?;
    let expected_sha256: [u8; 32] = Sha256::digest(certificate.as_ref()).into();
    let mut roots = RootCertStore::empty();
    roots
        .add(certificate)
        .map_err(|_| "本机 TLS 服务器证书不能作为信任锚。".to_string())?;
    let delegate = WebPkiServerVerifier::builder(Arc::new(roots))
        .build()
        .map_err(|_| "无法初始化本机 TLS 证书核验器。".to_string())?;
    let verifier = ExactServerCertificateVerifier {
        delegate,
        expected_sha256,
    };
    let tls = rustls::ClientConfig::builder()
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(verifier))
        .with_no_client_auth();
    bounded_client_builder()
        .https_only(true)
        .use_preconfigured_tls(tls)
        .build()
        .map_err(|_| "无法初始化本机后端适配器。".to_string())
}

#[derive(Debug)]
struct ExactServerCertificateVerifier {
    delegate: Arc<WebPkiServerVerifier>,
    expected_sha256: [u8; 32],
}

impl ServerCertVerifier for ExactServerCertificateVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        intermediates: &[CertificateDer<'_>],
        server_name: &ServerName<'_>,
        ocsp_response: &[u8],
        now: UnixTime,
    ) -> Result<ServerCertVerified, rustls::Error> {
        let presented_sha256: [u8; 32] = Sha256::digest(end_entity.as_ref()).into();
        if presented_sha256 != self.expected_sha256 {
            return Err(rustls::Error::General(
                "loopback TLS leaf does not match the exact configured certificate".into(),
            ));
        }
        self.delegate
            .verify_server_cert(end_entity, intermediates, server_name, ocsp_response, now)
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        self.delegate.verify_tls12_signature(message, cert, dss)
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        self.delegate.verify_tls13_signature(message, cert, dss)
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.delegate.supported_verify_schemes()
    }
}

fn canonical_server_certificate_pem(raw: &str) -> Result<String, String> {
    let value = raw.trim();
    if value.is_empty()
        || value.len() > MAX_CERTIFICATE_BYTES
        || value.matches("-----BEGIN CERTIFICATE-----").count() != 1
        || value.matches("-----END CERTIFICATE-----").count() != 1
        || !value.starts_with("-----BEGIN CERTIFICATE-----")
        || !value.ends_with("-----END CERTIFICATE-----")
        || value.contains("PRIVATE KEY")
        || value.contains("-----BEGIN OPENSSH")
    {
        return Err("必须仅提供一张不超过 16 KB 的本机 TLS 服务器证书；不得包含私钥。".into());
    }
    Ok(format!("{value}\n"))
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PersistentBinding {
    #[serde(default)]
    pub key_id: String,
    pub base_url: String,
    pub server_certificate_pem: String,
    pub account_id: String,
    pub account_name: String,
    pub session_id: String,
    pub session_title: String,
    pub user_id: String,
    pub user_display_name: String,
    pub verified_at: DateTime<Utc>,
}

impl PersistentBinding {
    pub fn status_with_warning(&self, cleanup_warning: Option<String>) -> BindingStatus {
        BindingStatus::Verified {
            account_id: self.account_id.clone(),
            account_name: self.account_name.clone(),
            session_id: self.session_id.clone(),
            session_title: self.session_title.clone(),
            user_display_name: self.user_display_name.clone(),
            verified_at: self.verified_at.to_rfc3339(),
            cleanup_warning,
        }
    }

    pub fn assert_scope(&self, scope: &PlatformScope) -> Result<(), String> {
        let account_id = canonical_uuid("accountId", &scope.account_id)?;
        let session_id = canonical_uuid("sessionId", &scope.session_id)?;
        if canonical_uuid("bound accountId", &self.account_id)? != account_id
            || canonical_uuid("bound sessionId", &self.session_id)? != session_id
        {
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
    if url.scheme() != "https" {
        return Err("本机适配器只接受带固定服务器证书的 https loopback 地址。".into());
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
    canonical_uuid(label, value).map(|_| ())
}

pub fn canonical_uuid(label: &str, value: &str) -> Result<String, String> {
    Uuid::parse_str(value)
        .map(|value| value.to_string())
        .map_err(|_| format!("{label} 必须是 UUID。"))
}

pub fn validate_token(token: &str) -> Result<(), String> {
    if token.len() < 20 || token.len() > 4096 || token.chars().any(char::is_whitespace) {
        return Err("Access token 长度或格式无效。".into());
    }
    Ok(())
}

pub async fn verify_backend(
    base_url: &str,
    server_certificate_pem: &str,
    token: &str,
    session_id: &str,
) -> Result<PersistentBinding, VerificationFailure> {
    let base = validate_loopback_base_url(base_url).map_err(VerificationFailure::Invalid)?;
    validate_token(token).map_err(VerificationFailure::Invalid)?;
    let session_id =
        canonical_uuid("Agent Session ID", session_id).map_err(VerificationFailure::Invalid)?;
    let server_certificate_pem = canonical_server_certificate_pem(server_certificate_pem)
        .map_err(VerificationFailure::Invalid)?;
    let client =
        build_loopback_client(&server_certificate_pem).map_err(VerificationFailure::Invalid)?;

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
    let auth = decode_bounded_json::<AuthResponse>(auth_response, "认证").await?;
    if auth.contract_version != CONTRACT_VERSION {
        return Err(VerificationFailure::Revoked(format!(
            "后端契约版本不兼容：需要 {CONTRACT_VERSION}。"
        )));
    }
    let account_id =
        canonical_uuid("accountId", &auth.account.id).map_err(VerificationFailure::Revoked)?;
    let user_id = canonical_uuid("userId", &auth.user.id).map_err(VerificationFailure::Revoked)?;
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
    let session =
        decode_bounded_json::<AgentSessionResponse>(session_response, "Agent Session").await?;
    let response_session_id =
        canonical_uuid("Agent Session response ID", &session.session.session_id)
            .map_err(VerificationFailure::Revoked)?;
    if session.contract_version != CONTRACT_VERSION
        || response_session_id != session_id
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
        server_certificate_pem,
        account_id,
        account_name: bounded_label(auth.account.name, "当前账号"),
        session_id,
        session_title: bounded_label(payload.title, "未命名 Session"),
        user_id,
        user_display_name: bounded_label(auth.user.display_name, "当前用户"),
        verified_at: Utc::now(),
    })
}

async fn decode_bounded_json<T: DeserializeOwned>(
    mut response: Response,
    label: &str,
) -> Result<T, VerificationFailure> {
    if response
        .content_length()
        .is_some_and(|length| length > MAX_VERIFICATION_RESPONSE_BYTES as u64)
    {
        return Err(VerificationFailure::Revoked(format!(
            "{label}响应超过 64 KiB 上限。"
        )));
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| VerificationFailure::Stale(format!("读取{label}响应失败。")))?
    {
        if body.len().saturating_add(chunk.len()) > MAX_VERIFICATION_RESPONSE_BYTES {
            return Err(VerificationFailure::Revoked(format!(
                "{label}响应超过 64 KiB 上限。"
            )));
        }
        body.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&body)
        .map_err(|_| VerificationFailure::Revoked(format!("{label}响应不符合当前数据契约。")))
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
        fs,
        io::{Read, Write},
        net::{TcpListener, TcpStream},
        process::{Child, Command, Stdio},
        sync::mpsc,
        thread,
        time::{Duration, Instant},
    };

    use super::*;

    fn create_certificate(directory: &std::path::Path, name: &str) -> (String, String) {
        let certificate = directory.join(format!("{name}.pem"));
        let key = directory.join(format!("{name}-key.pem"));
        let status = Command::new("/usr/bin/openssl")
            .args([
                "req",
                "-x509",
                "-newkey",
                "rsa:2048",
                "-sha256",
                "-nodes",
                "-days",
                "1",
                "-subj",
                "/CN=Talent Signal Test",
                "-addext",
                "subjectAltName=IP:127.0.0.1",
                "-keyout",
            ])
            .arg(&key)
            .arg("-out")
            .arg(&certificate)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .expect("generate test certificate");
        assert!(status.success());
        (
            fs::read_to_string(certificate).expect("certificate PEM"),
            key.to_string_lossy().into_owned(),
        )
    }

    fn create_ca_signed_leaf(directory: &std::path::Path) -> (String, std::path::PathBuf, String) {
        let ca_certificate = directory.join("ca.pem");
        let ca_key = directory.join("ca-key.pem");
        let leaf_request = directory.join("leaf.csr");
        let leaf_certificate = directory.join("leaf.pem");
        let leaf_chain = directory.join("leaf-chain.pem");
        let leaf_key = directory.join("leaf-key.pem");
        let leaf_extensions = directory.join("leaf.ext");
        fs::write(
            &leaf_extensions,
            "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:127.0.0.1\n",
        )
        .expect("leaf extensions");
        let ca_status = Command::new("/usr/bin/openssl")
            .args([
                "req",
                "-x509",
                "-newkey",
                "rsa:2048",
                "-sha256",
                "-nodes",
                "-days",
                "1",
                "-subj",
                "/CN=Talent Signal Test CA",
                "-addext",
                "basicConstraints=critical,CA:TRUE",
                "-keyout",
            ])
            .arg(&ca_key)
            .arg("-out")
            .arg(&ca_certificate)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .expect("generate CA");
        assert!(ca_status.success());
        let request_status = Command::new("/usr/bin/openssl")
            .args([
                "req",
                "-new",
                "-newkey",
                "rsa:2048",
                "-sha256",
                "-nodes",
                "-subj",
                "/CN=127.0.0.1",
                "-keyout",
            ])
            .arg(&leaf_key)
            .arg("-out")
            .arg(&leaf_request)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .expect("generate leaf request");
        assert!(request_status.success());
        let sign_status = Command::new("/usr/bin/openssl")
            .args(["x509", "-req", "-sha256", "-days", "1", "-in"])
            .arg(&leaf_request)
            .arg("-CA")
            .arg(&ca_certificate)
            .arg("-CAkey")
            .arg(&ca_key)
            .arg("-CAcreateserial")
            .arg("-extfile")
            .arg(&leaf_extensions)
            .arg("-out")
            .arg(&leaf_certificate)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .expect("sign leaf");
        assert!(sign_status.success());
        let ca_pem = fs::read_to_string(&ca_certificate).expect("CA PEM");
        let leaf_pem = fs::read_to_string(&leaf_certificate).expect("leaf PEM");
        fs::write(&leaf_chain, format!("{leaf_pem}{ca_pem}")).expect("write server chain");
        (ca_pem, leaf_chain, leaf_key.to_string_lossy().into_owned())
    }

    #[allow(clippy::zombie_processes)] // Ownership is returned; the test kills and waits it.
    fn start_https_observer(
        directory: &std::path::Path,
        port: u16,
        certificate_path: &std::path::Path,
        key_path: &str,
    ) -> (Child, std::path::PathBuf) {
        let script = directory.join("observer.mjs");
        let log = directory.join("requests.jsonl");
        fs::write(
            &script,
            r#"import https from 'node:https';
import fs from 'node:fs';
const [cert,key,log,port] = process.argv.slice(2);
https.createServer({cert:fs.readFileSync(cert),key:fs.readFileSync(key)},(req,res)=>{
  fs.appendFileSync(log, JSON.stringify({authorization:req.headers.authorization ?? null,url:req.url})+'\n');
  res.writeHead(200,{'content-type':'application/json'});res.end('{}');
}).listen(Number(port),'127.0.0.1');
"#,
        )
        .expect("write observer");
        let child = Command::new("node")
            .arg(&script)
            .arg(certificate_path)
            .arg(key_path)
            .arg(&log)
            .arg(port.to_string())
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("start HTTPS observer");
        for _ in 0..100 {
            if TcpStream::connect(("127.0.0.1", port)).is_ok() {
                return (child, log);
            }
            thread::sleep(Duration::from_millis(10));
        }
        let mut child = child;
        let _ = child.kill();
        let _ = child.wait();
        panic!("HTTPS observer did not listen");
    }

    #[test]
    fn accepts_only_explicit_loopback_https_ports() {
        assert!(validate_loopback_base_url("https://127.0.0.1:4336").is_ok());
        assert!(validate_loopback_base_url("https://localhost:4336").is_ok());
        assert!(validate_loopback_base_url("https://[::1]:4336").is_ok());
        for rejected in [
            "http://127.0.0.1:4336",
            "http://127.0.0.1",
            "https://127.0.0.1:443",
            "https://example.com:4336",
            "https://127.0.0.1:4336/private",
            "https://token@127.0.0.1:4336",
            "https://127.0.0.1:4336?next=remote",
        ] {
            assert!(
                validate_loopback_base_url(rejected).is_err(),
                "accepted {rejected}"
            );
        }
    }

    #[test]
    fn tls_pin_rejects_a_certificate_bundle_containing_a_private_key() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let (certificate, key_path) = create_certificate(directory.path(), "combined");
        let private_key = fs::read_to_string(key_path).expect("private key fixture");

        assert!(build_loopback_client(&format!("{certificate}\n{private_key}")).is_err());
        assert!(canonical_server_certificate_pem(&certificate).is_ok());
    }

    #[test]
    fn scope_mismatch_fails_closed() {
        let binding = PersistentBinding {
            key_id: Uuid::new_v4().to_string(),
            base_url: "https://127.0.0.1:4336".into(),
            server_certificate_pem: "synthetic public certificate".into(),
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
    fn uuid_scope_comparison_uses_one_canonical_representation() {
        let account_id = Uuid::new_v4().to_string();
        let session_id = Uuid::new_v4().to_string();
        let binding = PersistentBinding {
            key_id: Uuid::new_v4().to_string(),
            base_url: "https://127.0.0.1:4336".into(),
            server_certificate_pem: "synthetic public certificate".into(),
            account_id: account_id.clone(),
            account_name: "Synthetic".into(),
            session_id: session_id.clone(),
            session_title: "Synthetic session".into(),
            user_id: Uuid::new_v4().to_string(),
            user_display_name: "Synthetic user".into(),
            verified_at: Utc::now(),
        };

        assert!(
            binding
                .assert_scope(&PlatformScope {
                    account_id: account_id.to_uppercase(),
                    session_id: session_id.to_uppercase(),
                })
                .is_ok()
        );
        assert_eq!(
            canonical_uuid("sessionId", &session_id.to_uppercase()).expect("canonical UUID"),
            session_id
        );
    }

    #[test]
    fn verification_json_reader_rejects_an_oversized_content_length() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("listener");
        let port = listener.local_addr().expect("listener address").port();
        let worker = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("request");
            let mut request = [0_u8; 2048];
            let _ = stream.read(&mut request);
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                MAX_VERIFICATION_RESPONSE_BYTES + 1
            )
            .expect("oversized response header");
        });
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("test runtime");
        let failure = runtime.block_on(async {
            let response = bounded_client_builder()
                .build()
                .expect("bounded client")
                .get(format!("http://127.0.0.1:{port}"))
                .send()
                .await
                .expect("response headers");
            decode_bounded_json::<AuthResponse>(response, "认证")
                .await
                .expect_err("oversized response must fail")
        });
        worker.join().expect("server worker");
        assert!(failure.message().contains("64 KiB"));
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

        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("test runtime");
        let result = runtime.block_on(async {
            bounded_client_builder()
                .build()
                .expect("bounded client")
                .get(format!("http://127.0.0.1:{source_port}"))
                .bearer_auth("synthetic-token-for-redirect-test")
                .send()
                .await
        });

        source_worker.join().expect("source worker");
        assert!(result.expect("redirect response").status().is_redirection());
        assert!(
            !target_receiver
                .recv_timeout(Duration::from_secs(1))
                .expect("redirect target observation")
        );
        target_worker.join().expect("target worker");
    }

    #[test]
    fn pinned_tls_authenticates_the_server_before_sending_bearer() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let (trusted_pem, trusted_key) = create_certificate(directory.path(), "trusted");
        let (wrong_pem, _) = create_certificate(directory.path(), "wrong");
        let trusted_path = directory.path().join("trusted.pem");
        let listener = TcpListener::bind("127.0.0.1:0").expect("reserve port");
        let port = listener.local_addr().expect("port").port();
        drop(listener);
        let (mut server, log) =
            start_https_observer(directory.path(), port, &trusted_path, &trusted_key);
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("test runtime");
        runtime.block_on(async {
            let response = build_loopback_client(&trusted_pem)
                .expect("trusted client")
                .get(format!("https://127.0.0.1:{port}/trusted"))
                .bearer_auth("synthetic-bearer-only-for-pinning-test")
                .send()
                .await
                .expect("trusted TLS request");
            assert!(response.status().is_success());

            let rejected = build_loopback_client(&wrong_pem)
                .expect("wrong pinned client")
                .get(format!("https://127.0.0.1:{port}/wrong"))
                .bearer_auth("must-never-reach-the-server")
                .send()
                .await;
            assert!(rejected.is_err());
        });
        thread::sleep(Duration::from_millis(100));
        server.kill().expect("stop observer");
        server.wait().expect("wait observer");
        let requests = fs::read_to_string(log).expect("request log");
        assert!(requests.contains("synthetic-bearer-only-for-pinning-test"));
        assert!(!requests.contains("must-never-reach-the-server"));
        assert_eq!(requests.lines().count(), 1);
    }

    #[test]
    fn exact_pin_rejects_a_leaf_signed_by_the_configured_ca() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let (ca_pem, leaf_chain, leaf_key) = create_ca_signed_leaf(directory.path());
        let listener = TcpListener::bind("127.0.0.1:0").expect("reserve port");
        let port = listener.local_addr().expect("port").port();
        drop(listener);
        let (mut server, log) =
            start_https_observer(directory.path(), port, &leaf_chain, &leaf_key);
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("test runtime");
        let rejected = runtime.block_on(async {
            build_loopback_client(&ca_pem)
                .expect("client with exact CA certificate pin")
                .get(format!("https://127.0.0.1:{port}/sibling-leaf"))
                .bearer_auth("must-never-reach-a-ca-signed-sibling")
                .send()
                .await
        });
        assert!(rejected.is_err());
        thread::sleep(Duration::from_millis(100));
        server.kill().expect("stop observer");
        server.wait().expect("wait observer");
        let requests = fs::read_to_string(log).unwrap_or_default();
        assert!(!requests.contains("must-never-reach-a-ca-signed-sibling"));
        assert!(requests.is_empty());
    }
}
