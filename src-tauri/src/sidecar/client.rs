//! Launch the packaged sidecar and exchange a single JSON-line request.

use std::ffi::OsStr;

use serde_json::json;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

use super::protocol::{SidecarRequest, SidecarResponse, PROTOCOL_VERSION};

/// Serializes one JSON request line understood by [`run_one_request`].
pub fn build_ping_line(request_id: &str) -> String {
    let req = SidecarRequest {
        protocol_version: PROTOCOL_VERSION,
        request_id: request_id.to_string(),
        request_type: "ping".to_string(),
        payload: json!({}),
    };

    serde_json::to_string(&req).expect("SidecarRequest is always serializable")
}

pub fn parse_response(raw: &str) -> serde_json::Result<SidecarResponse> {
    serde_json::from_str(raw.trim())
}

/// Spawn `program`, write one stdin line (`request_json_line`), then read one stdout JSON line.
#[allow(dead_code)]
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
}
