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
    pub authenticated: bool,
    pub method: Option<AuthMethod>,
    pub base_url: Option<String>,
    pub display_name: Option<String>,
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
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Markdown,
    Html,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExportOptions {
    pub page_ids: Vec<String>,
    pub output_dir: String,
    pub format: ExportFormat,
    pub include_attachments: bool,
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
    pub message: String,
}
