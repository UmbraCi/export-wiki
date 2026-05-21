//! Launch the packaged sidecar and exchange a single JSON-line request.

use std::ffi::OsStr;
use std::path::{Path, PathBuf};

use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use uuid::Uuid;

use crate::auth::SidecarAuthConfig;
use crate::contracts::AuthMethod;

use super::protocol::{SidecarRequest, SidecarResponse, PROTOCOL_VERSION};

/// Serializes one JSON request line understood by [`run_one_request`].
pub fn build_ping_line(request_id: &str) -> String {
    build_request_line("ping", request_id, json!({}))
}

pub fn build_request_line(request_type: &str, request_id: &str, payload: Value) -> String {
    let req = SidecarRequest {
        protocol_version: PROTOCOL_VERSION,
        request_id: request_id.to_string(),
        request_type: request_type.to_string(),
        payload,
    };

    serde_json::to_string(&req).expect("SidecarRequest is always serializable")
}

pub fn parse_response(raw: &str) -> serde_json::Result<SidecarResponse> {
    serde_json::from_str(raw.trim())
}

pub fn auth_payload(auth: &SidecarAuthConfig) -> Value {
    json!({
        "base_url": auth.base_url,
        "method": match auth.method {
            AuthMethod::Sso => "sso",
            AuthMethod::ApiToken => "api_token",
            AuthMethod::Cookie => "cookie",
        },
        "username": auth.username,
        "api_token": auth.api_token,
        "cookie": auth.cookie,
    })
}

pub fn resolve_sidecar_program() -> Result<PathBuf, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let triple = match (std::env::consts::ARCH, std::env::consts::OS) {
        ("aarch64", "macos") => "aarch64-apple-darwin",
        ("x86_64", "macos") => "x86_64-apple-darwin",
        ("aarch64", "linux") => "aarch64-unknown-linux-gnu",
        ("x86_64", "linux") => "x86_64-unknown-linux-gnu",
        ("x86_64", "windows") => "x86_64-pc-windows-msvc",
        (arch, os) => return Err(format!("unsupported sidecar target {arch}-{os}")),
    };

    let candidate = manifest_dir.join(format!("binaries/cme-sidecar-{triple}"));
    if candidate.exists() {
        return Ok(candidate);
    }

    Err(format!(
        "sidecar binary not found at {}",
        candidate.display()
    ))
}

pub struct SidecarClient {
    program: PathBuf,
}

impl SidecarClient {
    pub fn resolve_default() -> Result<Self, String> {
        Ok(Self {
            program: resolve_sidecar_program()?,
        })
    }

    pub fn with_program(program: impl Into<PathBuf>) -> Self {
        Self {
            program: program.into(),
        }
    }

    pub fn program(&self) -> &Path {
        &self.program
    }

    pub async fn request(&self, request_type: &str, payload: Value) -> Result<SidecarResponse, String> {
        let request_id = Uuid::new_v4().to_string();
        let line = build_request_line(request_type, &request_id, payload);
        let response = run_one_request(&self.program, &line).await?;

        if !response.ok {
            return Err(response
                .error
                .unwrap_or_else(|| "sidecar request failed".to_string()));
        }

        Ok(response)
    }

    pub async fn get_spaces(&self, auth: &SidecarAuthConfig) -> Result<SidecarResponse, String> {
        self.request("get_spaces", json!({ "auth": auth_payload(auth) }))
            .await
    }

    pub async fn get_page_tree(
        &self,
        auth: &SidecarAuthConfig,
        space_key: &str,
    ) -> Result<SidecarResponse, String> {
        self.request(
            "get_page_tree",
            json!({
                "auth": auth_payload(auth),
                "space_key": space_key,
            }),
        )
        .await
    }

    pub async fn search_pages(
        &self,
        auth: &SidecarAuthConfig,
        query: &str,
    ) -> Result<SidecarResponse, String> {
        self.request(
            "search_pages",
            json!({
                "auth": auth_payload(auth),
                "query": query,
            }),
        )
        .await
    }

    pub async fn get_current_user(
        &self,
        auth: &SidecarAuthConfig,
    ) -> Result<SidecarResponse, String> {
        self.request("get_current_user", json!({ "auth": auth_payload(auth) }))
            .await
    }

    pub async fn export_pages(
        &self,
        auth: &SidecarAuthConfig,
        page_ids: &[String],
        format: &str,
        include_attachments: bool,
    ) -> Result<SidecarResponse, String> {
        self.request(
            "export_pages",
            json!({
                "auth": auth_payload(auth),
                "page_ids": page_ids,
                "format": format,
                "include_attachments": include_attachments,
            }),
        )
        .await
    }
}

/// Spawn `program`, write one stdin line (`request_json_line`), then read one stdout JSON line.
pub async fn run_one_request(
    program: impl AsRef<OsStr>,
    request_json_line: impl AsRef<str>,
) -> Result<SidecarResponse, String> {
    let payload = request_json_line.as_ref();
    let mut child = Command::new(program.as_ref())
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("spawn sidecar process: {e}"))?;

    {
        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| "sidecar stdin not available".to_string())?;

        stdin
            .write_all(payload.trim_end().as_bytes())
            .await
            .map_err(|e| format!("writing sidecar stdin: {e}"))?;

        stdin
            .write_all(b"\n")
            .await
            .map_err(|e| format!("writing sidecar newline: {e}"))?;

        stdin
            .flush()
            .await
            .map_err(|e| format!("flushing sidecar stdin: {e}"))?;

        stdin
            .shutdown()
            .await
            .map_err(|e| format!("closing sidecar stdin: {e}"))?;
    }

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "sidecar stdout not available".to_string())?;

    let mut stdout = BufReader::new(stdout);

    let mut line = String::new();
    stdout
        .read_line(&mut line)
        .await
        .map_err(|e| format!("reading sidecar stdout: {e}"))?;

    let status = child
        .wait()
        .await
        .map_err(|e| format!("waiting for sidecar: {e}"))?;

    let response = parse_response(&line).map_err(|e| format!("decode sidecar response: {e}"))?;

    if !status.success() {
        let code = status.code().map(|c| c.to_string()).unwrap_or_else(|| "signal".into());
        return Err(format!(
            "sidecar process exited unsuccessfully ({code}): {}",
            response
                .error
                .as_deref()
                .unwrap_or("see stderr/logs for diagnostics")
        ));
    }

    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_successful_sidecar_response() {
        let raw = r#"{"protocol_version":1,"request_id":"r1","ok":true,"payload":{"status":"ok"},"error":null}"#;

        let response = parse_response(raw).expect("valid response");

        assert!(response.ok);
        assert_eq!(response.payload["status"], "ok");
    }

    #[test]
    fn build_ping_contains_required_keys() {
        let raw = build_ping_line("probe");
        assert!(raw.contains("\"type\":\"ping\""));
        assert!(raw.contains("\"request_id\":\"probe\""));
    }

    #[test]
    fn auth_payload_maps_api_token_method() {
        let payload = auth_payload(&SidecarAuthConfig {
            base_url: "https://example.atlassian.net".into(),
            method: AuthMethod::ApiToken,
            username: Some("user@example.com".into()),
            api_token: Some("secret".into()),
            cookie: None,
        });

        assert_eq!(payload["method"], "api_token");
        assert_eq!(payload["username"], "user@example.com");
    }

    #[test]
    fn build_get_spaces_request_includes_auth_payload() {
        let raw = build_request_line(
            "get_spaces",
            "r1",
            json!({
                "auth": {
                    "base_url": "https://example.atlassian.net",
                    "method": "cookie",
                    "cookie": "session=abc"
                }
            }),
        );

        assert!(raw.contains("\"type\":\"get_spaces\""));
        assert!(raw.contains("\"cookie\":\"session=abc\""));
    }
}
