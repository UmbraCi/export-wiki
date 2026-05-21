use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::contracts::SyncSettings;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    #[serde(default)]
    pub default_output_dir: String,
    #[serde(default = "default_format")]
    pub default_format: String,
    #[serde(default = "default_true")]
    pub include_attachments_default: bool,
    #[serde(default)]
    pub skip_unchanged_default: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_used_url: Option<String>,
    #[serde(default)]
    pub sync: SyncSettings,
}

fn default_format() -> String {
    "markdown".to_string()
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveConfigResult {
    pub success: bool,
}

fn get_config_path() -> PathBuf {
    let mut path = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("export-wiki");
    path.push("config.json");
    path
}

/// Save configuration to disk
#[tauri::command]
pub fn save_config(config: Config) -> Result<SaveConfigResult, String> {
    let path = get_config_path();

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;

    Ok(SaveConfigResult { success: true })
}

/// Load configuration from disk
#[tauri::command]
pub fn load_config() -> Result<Option<Config>, String> {
    let path = get_config_path();

    if !path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let config: Config = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    Ok(Some(config))
}
