//! Reuse a sidecar for browsing; isolate authentication checks and cancellable exports.

use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;

use serde::{Deserialize, Serialize};
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
    #[cfg(feature = "dev-sidecar")]
    let candidate = super::dev::program();
    #[cfg(not(feature = "dev-sidecar"))]
    let candidate = std::env::current_exe()
        .map_err(|error| format!("resolve app executable: {error}"))?
        .with_file_name(format!("cme-sidecar{}", std::env::consts::EXE_SUFFIX));
    if candidate.exists() {
        return Ok(candidate);
    }

    Err(format!(
        "sidecar executable not found at {} (development: run npm run setup)",
        candidate.display()
    ))
}

fn sidecar_command(program: &OsStr) -> Command {
    let command = Command::new(program);
    #[cfg(feature = "dev-sidecar")]
    let mut command = command;
    #[cfg(feature = "dev-sidecar")]
    if Path::new(program) == super::dev::program() {
        command
            .current_dir(super::dev::source_dir())
            .args(["-m", "confluence_export_sidecar"]);
    }
    command
}

pub struct SidecarClient {
    program: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SidecarLog {
    pub timestamp: String,
    pub level: String,
    pub source: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub progress: Option<crate::contracts::ExportProgressEvent>,
}

type LogCallback<'a> = &'a (dyn Fn(SidecarLog) + Send + Sync);

// PyInstaller's bootloader forks: killing only its parent leaves the exporter running.
struct ExportProcessTree(Option<u32>);

impl ExportProcessTree {
    fn stop(&mut self) -> Result<(), String> {
        if let Some(pid) = self.0.take() {
            #[cfg(unix)]
            let status = std::process::Command::new("/bin/kill")
                .args(["-KILL", "--", &format!("-{pid}")])
                .status();
            #[cfg(windows)]
            let status = std::process::Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .status();
            status.map_err(|error| format!("stop export process tree: {error}"))?;
        }
        Ok(())
    }
}

impl Drop for ExportProcessTree {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

fn request_secrets(payload: &str) -> Vec<String> {
    let request: Value = serde_json::from_str(payload).unwrap_or(Value::Null);
    let auth = &request["payload"]["auth"];
    let mut secrets: Vec<String> = ["api_token", "cookie"]
        .iter()
        .filter_map(|key| {
            auth[*key]
                .as_str()
                .filter(|value| !value.is_empty())
                .map(str::to_owned)
        })
        .collect();
    if let Some(cookie) = auth["cookie"].as_str() {
        secrets.extend(
            cookie
                .split(';')
                .filter_map(|part| part.split_once('='))
                .map(|(_, value)| value.trim().to_owned())
                .filter(|value| !value.is_empty()),
        );
    }
    secrets.sort_by_key(|value| std::cmp::Reverse(value.len()));
    secrets
}

fn redact_values(message: &str, secrets: &[String]) -> String {
    secrets.iter().fold(message.to_owned(), |text, secret| {
        text.replace(secret, "[redacted]")
    })
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
    #[cfg(feature = "dev-sidecar")]
    source_stamp: super::dev::SourceStamp,
}

impl DirectoryProcess {
    fn spawn(program: &Path) -> Result<Self, String> {
        #[cfg(feature = "dev-sidecar")]
        let source_stamp = Self::source_stamp(program)?;
        let mut child = sidecar_command(program.as_os_str())
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
            #[cfg(feature = "dev-sidecar")]
            source_stamp,
        })
    }

    #[cfg(feature = "dev-sidecar")]
    fn source_stamp(program: &Path) -> Result<super::dev::SourceStamp, String> {
        if program != super::dev::program() {
            return Ok(Vec::new());
        }
        super::dev::source_stamp(&super::dev::source_dir().join("confluence_export_sidecar"))
            .map_err(|error| format!("check sidecar source changes: {error}"))
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
        let exited = process
            .child
            .try_wait()
            .map_err(|error| format!("check directory sidecar: {error}"))?
            .is_some();
        #[cfg(feature = "dev-sidecar")]
        let source_changed = process.source_stamp != DirectoryProcess::source_stamp(program)?;
        #[cfg(not(feature = "dev-sidecar"))]
        let source_changed = false;
        if exited || source_changed {
            if !exited {
                process.child.kill().await
                    .map_err(|error| format!("restart development sidecar: {error}"))?;
            }
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
        output_dir: &str,
        format: &str,
        include_attachments: bool,
        cancelled: &AtomicBool,
        on_log: LogCallback<'_>,
    ) -> Result<SidecarResponse, String> {
        self.request_with_cancel(
            "export_pages",
            json!({
                "auth": auth_payload(auth),
                "page_ids": page_ids,
                "output_dir": output_dir,
                "format": format,
                "include_attachments": include_attachments,
            }),
            cancelled,
            on_log,
        )
        .await
    }

    pub async fn export_migration_package_with_cancel(
        &self,
        auth: &SidecarAuthConfig,
        page_ids: &[String],
        output_dir: &str,
        include_attachments: bool,
        cancelled: &AtomicBool,
        on_log: LogCallback<'_>,
    ) -> Result<SidecarResponse, String> {
        self.request_with_cancel(
            "export_migration_package",
            json!({
                "auth": auth_payload(auth),
                "page_ids": page_ids,
                "output_dir": output_dir,
                "include_attachments": include_attachments,
            }),
            cancelled,
            on_log,
        )
        .await
    }

    async fn request_with_cancel(
        &self,
        request_type: &str,
        payload: Value,
        cancelled: &AtomicBool,
        on_log: LogCallback<'_>,
    ) -> Result<SidecarResponse, String> {
        let request_id = Uuid::new_v4().to_string();
        let line = build_request_line(request_type, &request_id, payload);
        let response =
            run_one_request_inner(&self.program, &line, Some(cancelled), Some(on_log)).await?;

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
    run_one_request_inner(program, request_json_line, None, None).await
}

async fn run_one_request_inner(
    program: impl AsRef<OsStr>,
    request_json_line: impl AsRef<str>,
    cancelled: Option<&AtomicBool>,
    on_log: Option<LogCallback<'_>>,
) -> Result<SidecarResponse, String> {
    let payload = request_json_line.as_ref();
    let secrets = request_secrets(payload);
    let mut command = sidecar_command(program.as_ref());
    #[cfg(unix)]
    command.process_group(0);
    let mut child = command.kill_on_drop(true)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("spawn sidecar process: {e}"))?;
    let mut process_tree = ExportProcessTree(child.id());

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
    let stderr = child.stderr.take().ok_or("sidecar stderr not available")?;
    let mut stderr = BufReader::new(stderr).lines();
    let drain_stderr = async {
        let mut diagnostics = std::collections::VecDeque::new();
        while let Some(line) = stderr
            .next_line()
            .await
            .map_err(|e| format!("reading sidecar stderr: {e}"))?
        {
            let mut entry =
                serde_json::from_str::<SidecarLog>(&line).unwrap_or_else(|_| SidecarLog {
                    timestamp: chrono::Utc::now().to_rfc3339(),
                    level: "warn".into(),
                    source: "sidecar.stderr".into(),
                    message: line,
                    progress: None,
                });
            entry.message = redact_values(&entry.message, &secrets);
            if let Some(on_log) = on_log {
                on_log(entry.clone());
            }
            diagnostics.push_back(entry.message);
            if diagnostics.len() > 20 {
                diagnostics.pop_front();
            }
        }
        Ok::<_, String>(diagnostics.into_iter().collect::<Vec<_>>().join("\n"))
    };
    let mut line = String::new();
    let read_response = async {
        stdout
            .read_line(&mut line)
            .await
            .map_err(|e| format!("reading sidecar stdout: {e}"))?;
        child
            .wait()
            .await
            .map_err(|e| format!("waiting for sidecar: {e}"))
    };
    let exchange = async { tokio::try_join!(read_response, drain_stderr) };
    let mut exchange = Box::pin(exchange);
    let (status, diagnostics) = if let Some(cancelled) = cancelled {
        loop {
            if cancelled.load(Ordering::SeqCst) {
                process_tree.stop()?;
                // Wait for pipes to close and the bootloader to exit before permitting resume.
                let _ = tokio::time::timeout(Duration::from_secs(5), exchange.as_mut()).await
                    .map_err(|_| "export process did not stop; retry pause".to_string())?;
                return Err("EXPORT_CANCELLED".into());
            }
            tokio::select! {
                result = &mut exchange => break result?,
                _ = tokio::time::sleep(Duration::from_millis(50)) => {}
            }
        }
    } else {
        exchange.as_mut().await?
    };
    drop(exchange);
    process_tree.0 = None;
    let mut response = parse_response(&line)
        .map_err(|e| format!("decode sidecar response (exit {status}): {e}\n{diagnostics}"))?;
    response.error = response
        .error
        .map(|message| redact_values(&message, &secrets));

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

    #[cfg(feature = "dev-sidecar")]
    #[test]
    fn development_command_uses_virtualenv_and_source_module() {
        let program = super::super::dev::program();
        let command = sidecar_command(program.as_os_str());
        let command = command.as_std();
        assert_eq!(command.get_program(), program.as_os_str());
        assert_eq!(
            command.get_current_dir(),
            Some(super::super::dev::source_dir().as_path())
        );
        assert_eq!(
            command.get_args().collect::<Vec<_>>(),
            ["-m", "confluence_export_sidecar"]
        );
    }

    #[cfg(all(unix, feature = "dev-sidecar"))]
    #[tokio::test]
    async fn directory_worker_restarts_when_source_stamp_changes() {
        let (_directory, program) = echo_sidecar();
        let worker = DirectoryWorker::default();
        let line = build_request_line("ping", "reload", json!({}));
        let first = worker.request(&program, &line, "reload").await.unwrap();
        worker.process.lock().await.as_mut().unwrap().source_stamp.push((
            PathBuf::from("old.py"),
            std::time::SystemTime::UNIX_EPOCH,
            0,
        ));
        let second = worker.request(&program, &line, "reload").await.unwrap();
        assert_ne!(first.payload["pid"], second.payload["pid"]);
        let third = worker.request(&program, &line, "reload").await.unwrap();
        assert_eq!(second.payload["pid"], third.payload["pid"]);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn cancellation_stops_forked_exporter_before_returning() {
        use std::os::unix::fs::PermissionsExt;
        let directory = tempfile::tempdir().unwrap();
        let program = directory.path().join("forking-sidecar.sh");
        let marker = directory.path().join("orphan-wrote-output");
        std::fs::write(&program, format!(
            "#!/bin/sh\n(sleep 1; touch '{}') &\nprintf 'export started\\n' >&2\nwait\n", marker.display()
        )).unwrap();
        std::fs::set_permissions(&program, std::fs::Permissions::from_mode(0o755)).unwrap();
        let cancelled = AtomicBool::new(false);
        let on_log = |_entry| cancelled.store(true, Ordering::SeqCst);
        let result = run_one_request_inner(&program, "{}", Some(&cancelled), Some(&on_log)).await;
        assert_eq!(result.unwrap_err(), "EXPORT_CANCELLED");
        tokio::time::sleep(Duration::from_millis(1200)).await;
        assert!(!marker.exists(), "forked exporter survived pause and wrote output");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn streams_logs_before_completion_and_redacts_raw_stderr() {
        use std::os::unix::fs::PermissionsExt;
        let directory = tempfile::tempdir().unwrap();
        let program = directory.path().join("logging-sidecar.sh");
        std::fs::write(
            &program,
            "#!/bin/sh\nprintf 'private-session private-api-value\\n' >&2\nexec sleep 30\n",
        )
        .unwrap();
        std::fs::set_permissions(&program, std::fs::Permissions::from_mode(0o755)).unwrap();
        let cancelled = AtomicBool::new(false);
        let captured = std::sync::Mutex::new(Vec::new());
        let on_log = |entry: SidecarLog| {
            captured.lock().unwrap().push(entry);
            cancelled.store(true, Ordering::SeqCst);
        };
        let request = build_request_line(
            "export_pages",
            "test",
            json!({
                "auth": {"api_token": "private-api-value", "cookie": "SID=private-session"}
            }),
        );
        let result = tokio::time::timeout(
            Duration::from_secs(10),
            run_one_request_inner(&program, &request, Some(&cancelled), Some(&on_log)),
        )
        .await
        .unwrap();
        assert_eq!(result.unwrap_err(), "EXPORT_CANCELLED");
        let logs = captured.lock().unwrap();
        assert_eq!(logs[0].source, "sidecar.stderr");
        assert_eq!(logs[0].message, "[redacted] [redacted]");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn reports_stderr_when_sidecar_exits_without_a_response() {
        use std::os::unix::fs::PermissionsExt;
        let directory = tempfile::tempdir().unwrap();
        let program = directory.path().join("broken-sidecar.sh");
        std::fs::write(
            &program,
            "#!/bin/sh\nprintf 'fatal diagnostic\\n' >&2\nexit 2\n",
        )
        .unwrap();
        std::fs::set_permissions(&program, std::fs::Permissions::from_mode(0o755)).unwrap();
        let error = run_one_request(&program, "{}").await.unwrap_err();
        assert!(error.contains("fatal diagnostic"));
        assert!(error.contains("exit"));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn drains_stderr_while_waiting_for_export_response() {
        use std::os::unix::fs::PermissionsExt;
        let directory = tempfile::tempdir().unwrap();
        let program = directory.path().join("noisy-sidecar.sh");
        std::fs::write(&program, "#!/bin/sh\ni=0\nwhile [ \"$i\" -lt 4096 ]; do\n  printf 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' >&2\n  i=$((i + 1))\ndone\nprintf '\\n' >&2\nprintf '{\"protocol_version\":1,\"request_id\":\"test\",\"ok\":true,\"payload\":{}}\\n'\n").unwrap();
        std::fs::set_permissions(&program, std::fs::Permissions::from_mode(0o755)).unwrap();
        let result =
            tokio::time::timeout(Duration::from_secs(10), run_one_request(&program, "{}")).await;
        assert!(
            result.is_ok(),
            "export hangs when the unread stderr pipe fills"
        );
        assert!(result.unwrap().unwrap().ok);
    }

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
