#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
pub struct Config {
    pub auth: Option<AuthConfigData>,
    pub export_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthConfigData {
    pub base_url: String,
    pub username: String,
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