use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPagesOptions {
    pub page_ids: Vec<String>,
    pub output_dir: String,
    pub format: String,
    pub include_attachments: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPagesAck {
    pub export_id: String,
}

#[tauri::command]
pub fn export_pages(
    options: ExportPagesOptions,
    _state: State<crate::state::AppState>,
) -> Result<ExportPagesAck, String> {
    let _ = (&options.page_ids, &options.output_dir, &options.format, options.include_attachments);
    Ok(ExportPagesAck {
        export_id: "stub-export".to_string(),
    })
}
