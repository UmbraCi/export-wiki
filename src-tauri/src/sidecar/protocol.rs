//! Versioned envelopes exchanged with the Python `confluence_export_sidecar` process.

use serde::{Deserialize, Serialize};

pub const PROTOCOL_VERSION: u8 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub struct SidecarRequest {
    pub protocol_version: u8,
    pub request_id: String,
    #[serde(rename = "type")]
    pub request_type: String,
    #[serde(default)]
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub struct SidecarResponse {
    pub protocol_version: u8,
    pub request_id: String,
    pub ok: bool,
    #[serde(default)]
    pub payload: serde_json::Value,
    #[serde(default)]
    pub error: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_ping_request_with_protocol_and_type_fields() {
        let req = SidecarRequest {
            protocol_version: 1,
            request_id: "r1".to_string(),
            request_type: "ping".to_string(),
            payload: serde_json::json!({}),
        };
        let s = serde_json::to_string(&req).expect("json");

        assert!(s.contains("\"protocol_version\":1"));
        assert!(s.contains("\"type\":\"ping\""));
    }
}
