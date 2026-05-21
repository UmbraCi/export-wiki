#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use tauri::State;
use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct Space {
    pub key: String,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Page {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportOptions {
    pub space_key: String,
    pub output_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportResult {
    pub success: bool,
}

/// Get all available spaces
#[tauri::command]
pub fn get_spaces(_state: State<AppState>) -> Result<Vec<Space>, String> {
    // TODO: Implement actual API call
    Ok(vec![
        Space {
            key: "DEMO".to_string(),
            name: "Demo Space".to_string(),
        },
    ])
}

/// Get all pages in a space
#[tauri::command]
pub fn get_pages(space_key: String, _state: State<AppState>) -> Result<Vec<Page>, String> {
    // TODO: Implement actual API call
    Ok(vec![
        Page {
            id: "1".to_string(),
            title: format!("Sample Page in {}", space_key),
        },
    ])
}

/// Start export process
#[tauri::command]
pub fn start_export(options: ExportOptions, _state: State<AppState>) -> Result<ExportResult, String> {
    // TODO: Implement actual export logic
    println!("Exporting space {} to {}", options.space_key, options.output_path);
    Ok(ExportResult { success: true })
}