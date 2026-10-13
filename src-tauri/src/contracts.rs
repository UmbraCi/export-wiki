use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AuthMethod {
    Sso,
    ApiToken,
    Cookie,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub validation_error: Option<String>,
    pub authenticated: bool,
    pub method: Option<AuthMethod>,
    pub base_url: Option<String>,
    pub display_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SsoSessionInfo {
    pub active: bool,
    pub entry_url: String,
    pub base_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SsoSessionStatus {
    pub active: bool,
    pub entry_url: Option<String>,
    pub current_url: Option<String>,
    pub wiki_session_detected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SpaceInfo {
    pub key: String,
    pub name: String,
    #[serde(rename = "type")]
    pub space_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PageNode {
    pub id: String,
    pub title: String,
    pub parent_id: Option<String>,
    pub children: Vec<PageNode>,
    pub children_loaded: bool,
    pub has_children: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub page_id: String,
    pub title: String,
    pub space_key: String,
    pub excerpt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConfluenceUrlTarget {
    pub page_id: Option<String>,
    pub space_key: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ExportFormat {
    Markdown,
    Html,
    MigrationPackage,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExportOptions {
    pub page_ids: Vec<String>,
    pub output_dir: String,
    pub format: ExportFormat,
    pub include_attachments: bool,
}

#[cfg(test)]
mod tests {
    use super::ExportOptions;

    #[test]
    fn accepts_frontend_migration_package_format() {
        let options: ExportOptions = serde_json::from_value(serde_json::json!({
            "pageIds": ["123"],
            "outputDir": "/tmp/export",
            "format": "migration_package",
            "includeAttachments": false,
        }))
        .expect("frontend migration package format should deserialize");

        assert_eq!(options.page_ids, ["123"]);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExportStats {
    pub total: u32,
    pub exported: u32,
    pub skipped: u32,
    pub failed: u32,
    pub attachments: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExportProgressEvent {
    pub page_id: Option<String>,
    pub status: String,
    pub progress: u32,
    pub stats: ExportStats,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_params: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncSettings {
    pub enabled: bool,
    pub interval_minutes: u32,
    pub output_dir: String,
    pub page_ids: Vec<String>,
}

impl Default for SyncSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            interval_minutes: 60,
            output_dir: String::new(),
            page_ids: vec![],
        }
    }
}
