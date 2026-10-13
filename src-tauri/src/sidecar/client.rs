//! Reuse a sidecar for browsing; isolate authentication checks and cancellable exports.

use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;

use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::sync::{Mutex, Notify};
use uuid::Uuid;

use crate::auth::SidecarAuthConfig;
use crate::contracts::AuthMethod;

use super::protocol::{SidecarRequest, SidecarResponse, PROTOCOL_VERSION};

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

#[derive(Default)]
struct DirectoryWorker {
    process: Mutex<Option<DirectoryProcess>>,
    generation: AtomicU64,
    reset: Notify,
}

static DIRECTORY_WORKER: DirectoryWorker = DirectoryWorker {
    process: Mutex::const_new(None),
    generation: AtomicU64::new(0),
    reset: Notify::const_new(),
};

struct DirectoryProcess {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
}

impl DirectoryProcess {
    fn spawn(program: &Path) -> Result<Self, String> {
        let mut child = Command::new(program)
            .kill_on_drop(true)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|error| format!("spawn directory sidecar: {error}"))?;
        let stdin = child.stdin.take().ok_or("sidecar stdin not available")?;
        let stdout = child.stdout.take().ok_or("sidecar stdout not available")?;
        Ok(Self {
            child,
            stdin,
            stdout: BufReader::new(stdout),
        })
    }

    async fn exchange(&mut self, line: &str, request_id: &str) -> Result<SidecarResponse, String> {
        self.stdin
            .write_all(format!("{line}\n").as_bytes())
            .await
            .map_err(|error| format!("write directory sidecar request: {error}"))?;
        self.stdin
            .flush()
            .await
            .map_err(|error| format!("flush directory sidecar request: {error}"))?;
        let mut response_line = String::new();
        let size = self
            .stdout
            .read_line(&mut response_line)
            .await
            .map_err(|error| format!("read directory sidecar response: {error}"))?;
        if size == 0 {
            return Err("directory sidecar stopped; retry the request".into());
        }
        let response = parse_response(&response_line)
            .map_err(|error| format!("decode directory sidecar response: {error}"))?;
        if response.protocol_version != PROTOCOL_VERSION || response.request_id != request_id {
            return Err("directory sidecar response does not match the request".into());
        }
        Ok(response)
    }
}

impl DirectoryWorker {
    async fn clear(&self) {
        self.generation.fetch_add(1, Ordering::SeqCst);
        self.reset.notify_waiters();
        self.process.lock().await.take();
    }

    async fn request(
        &self,
        program: &Path,
        line: &str,
        request_id: &str,
    ) -> Result<SidecarResponse, String> {
        let generation = self.generation.load(Ordering::SeqCst);
        let mut slot = self.process.lock().await;
        let reset = self.reset.notified();
        if self.generation.load(Ordering::SeqCst) != generation {
            return Err("directory sidecar session changed; retry the request".into());
        }
        // Taking ownership also kills the process if this future is cancelled mid-response.
        let mut process = match slot.take() {
            Some(process) => process,
            None => DirectoryProcess::spawn(program)?,
        };
        if process
            .child
            .try_wait()
            .map_err(|error| format!("check directory sidecar: {error}"))?
            .is_some()
        {
            process = DirectoryProcess::spawn(program)?;
        }
        let response = tokio::select! {
            _ = reset => return Err("directory sidecar session changed; retry the request".into()),
            response = tokio::time::timeout(Duration::from_secs(120), process.exchange(line, request_id)) => {
                response.map_err(|_| "directory sidecar request timed out".to_string())?
            }
        };
        if response.is_ok() {
            *slot = Some(process);
        }
        response
    }
}

pub async fn clear_directory_worker() {
    DIRECTORY_WORKER.clear().await;
}

impl SidecarClient {
    pub fn resolve_default() -> Result<Self, String> {
        Ok(Self {
            program: resolve_sidecar_program()?,
        })
    }

    pub async fn request(
        &self,
        request_type: &str,
        payload: Value,
    ) -> Result<SidecarResponse, String> {
        let request_id = Uuid::new_v4().to_string();
        let line = build_request_line(request_type, &request_id, payload);
        let response = if matches!(
            request_type,
            "get_spaces"
                | "get_page_tree"
                | "get_page_children"
                | "get_page_descendants"
                | "search_pages"
        ) {
            DIRECTORY_WORKER
                .request(&self.program, &line, &request_id)
                .await?
        } else {
            run_one_request(&self.program, &line).await?
        };

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

    pub async fn get_page_children(
        &self,
        auth: &SidecarAuthConfig,
        page_id: &str,
    ) -> Result<SidecarResponse, String> {
        self.request(
            "get_page_children",
            json!({
                "auth": auth_payload(auth),
                "page_id": page_id,
            }),
        )
        .await
    }

    pub async fn get_page_descendants(
        &self,
        auth: &SidecarAuthConfig,
        page_id: &str,
    ) -> Result<SidecarResponse, String> {
        self.request(
            "get_page_descendants",
            json!({
                "auth": auth_payload(auth),
                "page_id": page_id,
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
        tokio::time::timeout(
            Duration::from_secs(20),
            self.request("get_current_user", json!({ "auth": auth_payload(auth) })),
        )
        .await
        .map_err(|_| "authentication check timed out".to_string())?
    }

    pub async fn export_pages_with_cancel(
        &self,
        auth: &SidecarAuthConfig,
        page_ids: &[String],
        format: &str,
        include_attachments: bool,
        cancelled: &AtomicBool,
    ) -> Result<SidecarResponse, String> {
        self.request_with_cancel(
            "export_pages",
            json!({
                "auth": auth_payload(auth),
                "page_ids": page_ids,
                "format": format,
                "include_attachments": include_attachments,
            }),
            cancelled,
        )
        .await
    }

    pub async fn export_migration_package_with_cancel(
        &self,
        auth: &SidecarAuthConfig,
        page_ids: &[String],
        output_dir: &str,
        flatten: bool,
        cancelled: &AtomicBool,
    ) -> Result<SidecarResponse, String> {
        self.request_with_cancel(
            "export_migration_package",
            json!({
                "auth": auth_payload(auth),
                "page_ids": page_ids,
                "output_dir": output_dir,
                "flatten": flatten,
            }),
            cancelled,
        )
        .await
    }

    async fn request_with_cancel(
        &self,
        request_type: &str,
        payload: Value,
        cancelled: &AtomicBool,
    ) -> Result<SidecarResponse, String> {
        let request_id = Uuid::new_v4().to_string();
        let line = build_request_line(request_type, &request_id, payload);
        let response = run_one_request_cancellable(&self.program, &line, cancelled).await?;

        if !response.ok {
            return Err(response
                .error
                .unwrap_or_else(|| "sidecar request failed".to_string()));
        }

        Ok(response)
    }
}

/// Spawn `program`, write one stdin line (`request_json_line`), then read one stdout JSON line.
pub async fn run_one_request(
    program: impl AsRef<OsStr>,
    request_json_line: impl AsRef<str>,
) -> Result<SidecarResponse, String> {
    run_one_request_inner(program, request_json_line, None).await
}

pub async fn run_one_request_cancellable(
    program: impl AsRef<OsStr>,
    request_json_line: impl AsRef<str>,
    cancelled: &AtomicBool,
) -> Result<SidecarResponse, String> {
    run_one_request_inner(program, request_json_line, Some(cancelled)).await
}

async fn run_one_request_inner(
    program: impl AsRef<OsStr>,
    request_json_line: impl AsRef<str>,
    cancelled: Option<&AtomicBool>,
) -> Result<SidecarResponse, String> {
    let payload = request_json_line.as_ref();
    let mut child = Command::new(program.as_ref())
        .kill_on_drop(true)
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
    if let Some(cancelled) = cancelled {
        let mut read_line = Box::pin(stdout.read_line(&mut line));
        loop {
            if cancelled.load(Ordering::SeqCst) {
                child
                    .kill()
                    .await
                    .map_err(|e| format!("stopping sidecar process: {e}"))?;
                return Err("EXPORT_CANCELLED".into());
            }

            tokio::select! {
                result = &mut read_line => {
                    result.map_err(|e| format!("reading sidecar stdout: {e}"))?;
                    break;
                }
                _ = tokio::time::sleep(Duration::from_millis(50)) => {}
            }
        }
    } else {
        stdout
            .read_line(&mut line)
            .await
            .map_err(|e| format!("reading sidecar stdout: {e}"))?;
    }

    let status = child
        .wait()
        .await
        .map_err(|e| format!("waiting for sidecar: {e}"))?;

    let response = parse_response(&line).map_err(|e| format!("decode sidecar response: {e}"))?;

    if !status.success() {
        let code = status
            .code()
            .map(|c| c.to_string())
            .unwrap_or_else(|| "signal".into());
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

    #[cfg(unix)]
    fn echo_sidecar() -> (tempfile::TempDir, PathBuf) {
        use std::os::unix::fs::PermissionsExt;
        let directory = tempfile::tempdir().unwrap();
        let program = directory.path().join("sidecar.sh");
        std::fs::write(&program, r#"#!/bin/sh
while IFS= read -r line; do
    request_id=$(printf '%s' "$line" | sed -n 's/.*"request_id":"\([^"]*\)".*/\1/p')
    printf '{"protocol_version":1,"request_id":"%s","ok":true,"payload":{"pid":%s}}\n' "$request_id" "$$"
done
"#).unwrap();
        std::fs::set_permissions(&program, std::fs::Permissions::from_mode(0o755)).unwrap();
        (directory, program)
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn directory_worker_reuses_process_and_restarts_after_exit() {
        let (_directory, program) = echo_sidecar();
        let worker = DirectoryWorker::default();
        let first = worker
            .request(
                &program,
                &build_request_line("ping", "first", json!({})),
                "first",
            )
            .await
            .unwrap();
        let second = worker
            .request(
                &program,
                &build_request_line("ping", "second", json!({})),
                "second",
            )
            .await
            .unwrap();
        assert_eq!(first.payload["pid"], second.payload["pid"]);
        {
            let mut slot = worker.process.lock().await;
            slot.as_mut().unwrap().child.kill().await.unwrap();
        }
        let restarted = worker
            .request(
                &program,
                &build_request_line("ping", "third", json!({})),
                "third",
            )
            .await
            .unwrap();
        assert_ne!(first.payload["pid"], restarted.payload["pid"]);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn directory_worker_discards_mismatched_responses() {
        let (_directory, program) = echo_sidecar();
        let worker = DirectoryWorker::default();
        let result = worker
            .request(
                &program,
                &build_request_line("ping", "wrong", json!({})),
                "expected",
            )
            .await;
        assert!(result.unwrap_err().contains("does not match"));
        assert!(worker.process.lock().await.is_none());
        assert!(worker
            .request(
                &program,
                &build_request_line("ping", "next", json!({})),
                "next"
            )
            .await
            .is_ok());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn clearing_directory_worker_interrupts_pending_requests() {
        let (_directory, program) = echo_sidecar();
        std::fs::write(
            &program,
            "#!/bin/sh\nIFS= read -r line\nIFS= read -r next_line\n",
        )
        .unwrap();
        let worker = std::sync::Arc::new(DirectoryWorker::default());
        let request_worker = worker.clone();
        let pending = tokio::spawn(async move {
            request_worker
                .request(
                    &program,
                    &build_request_line("ping", "pending", json!({})),
                    "pending",
                )
                .await
        });
        tokio::time::timeout(Duration::from_secs(2), async {
            while worker.process.try_lock().is_ok() {
                tokio::task::yield_now().await;
            }
            worker.clear().await;
        })
        .await
        .unwrap();
        assert!(pending
            .await
            .unwrap()
            .unwrap_err()
            .contains("session changed"));
        assert!(worker.process.lock().await.is_none());
    }

    #[test]
    fn parses_successful_sidecar_response() {
        let raw = r#"{"protocol_version":1,"request_id":"r1","ok":true,"payload":{"status":"ok"},"error":null}"#;

        let response = parse_response(raw).expect("valid response");

        assert!(response.ok);
        assert_eq!(response.payload["status"], "ok");
    }

    #[test]
    fn build_ping_contains_required_keys() {
        let raw = build_request_line("ping", "probe", json!({}));
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
