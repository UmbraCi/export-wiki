use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::app_error::{self, codes, AppError};
use crate::auth::SecretStore;
use crate::contracts::{ExportFormat, ExportOptions, ExportProgressEvent, ExportStats};
use crate::export::file_writer::{ExportedAttachment, ExportedPage, write_exported_page};
use crate::sidecar::client::SidecarClient;
use crate::state::AppState;

use serde_json::json;

const EMPTY_SELECTION: &str = codes::EMPTY_SELECTION;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPagesAck {
    pub export_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SidecarExportedAttachment {
    filename: String,
    relative_path: String,
    content_base64: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SidecarExportedPage {
    page_id: String,
    title: String,
    filename: String,
    #[serde(default)]
    markdown: Option<String>,
    #[serde(default)]
    html: Option<String>,
    attachments: Vec<SidecarExportedAttachment>,
}

pub(crate) fn redact_secrets(message: &str) -> String {
    message
        .replace("token", "[redacted]")
        .replace("Token", "[redacted]")
        .replace("cookie", "[redacted]")
        .replace("Cookie", "[redacted]")
        .replace("password", "[redacted]")
        .replace("Password", "[redacted]")
        .replace("secret", "[redacted]")
        .replace("Secret", "[redacted]")
        .replace("api_token", "[redacted]")
}

fn require_sidecar_auth(state: &AppState) -> Result<crate::auth::SidecarAuthConfig, String> {
    let status = state.secret_store.load_status()?;
    if !status.authenticated {
        return Err(app_error::auth_required());
    }

    state
        .secret_store
        .load_sidecar_auth()?
        .ok_or_else(|| app_error::auth_required())
}

fn map_exported_page(page: SidecarExportedPage) -> ExportedPage {
    ExportedPage {
        page_id: page.page_id,
        title: page.title,
        filename: page.filename,
        markdown: page.markdown,
        html: page.html,
        attachments: page
            .attachments
            .into_iter()
            .map(|attachment| ExportedAttachment {
                filename: attachment.filename,
                relative_path: attachment.relative_path,
                content_base64: attachment.content_base64,
            })
            .collect(),
    }
}

fn parse_exported_pages(payload: &serde_json::Value) -> Result<Vec<ExportedPage>, String> {
    let raw = payload
        .get("pages")
        .ok_or_else(|| "sidecar response missing pages".to_string())?;

    let pages: Vec<SidecarExportedPage> =
        serde_json::from_value(raw.clone()).map_err(|error| format!("decode pages: {error}"))?;

    Ok(pages.into_iter().map(map_exported_page).collect())
}

fn emit_progress(app: &AppHandle, event: ExportProgressEvent) -> Result<(), String> {
    app.emit("export-progress", event)
        .map_err(|error| format!("emit export progress: {error}"))
}

#[tauri::command]
pub async fn export_pages(
    options: ExportOptions,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<ExportPagesAck, String> {
    if options.page_ids.is_empty() {
        return Err(AppError::new(EMPTY_SELECTION).into_invoke_error());
    }

    let format = match options.format {
        ExportFormat::Markdown => "markdown",
        ExportFormat::Html => "html",
    };

    if options.output_dir.trim().is_empty() {
        return Err(AppError::new(codes::OUTPUT_DIR_REQUIRED).into_invoke_error());
    }

    let auth = require_sidecar_auth(&state)?;
    let client = SidecarClient::resolve_default()?;
    let export_id = Uuid::new_v4().to_string();
    let total = options.page_ids.len() as u32;
    let output_dir = PathBuf::from(&options.output_dir);

    let mut stats = ExportStats {
        total,
        exported: 0,
        skipped: 0,
        failed: 0,
        attachments: 0,
    };

    emit_progress(
        &app,
        ExportProgressEvent {
            page_id: None,
            status: "queued".into(),
            progress: 0,
            stats: stats.clone(),
            message_key: Some("export.queued".into()),
            message_params: Some(json!({ "count": total })),
            message: None,
        },
    )?;

    let response = client
        .export_pages(
            &auth,
            &options.page_ids,
            format,
            options.include_attachments,
        )
        .await
        .map_err(|error| redact_secrets(&error))?;

    let pages = parse_exported_pages(&response.payload).map_err(|error| redact_secrets(&error))?;

    for (index, page) in pages.iter().enumerate() {
        let page_number = index as u32 + 1;
        let progress_before_write = ((page_number.saturating_sub(1)) * 100) / total.max(1);

        emit_progress(
            &app,
            ExportProgressEvent {
                page_id: Some(page.page_id.clone()),
                status: "writing".into(),
                progress: progress_before_write,
                stats: stats.clone(),
                message_key: Some("export.writing".into()),
                message_params: Some(json!({ "filename": page.filename })),
                message: None,
            },
        )?;

        match write_exported_page(&output_dir, page) {
            Ok(attachment_count) => {
                stats.exported += 1;
                stats.attachments += attachment_count as u32;
            }
            Err(error) => {
                stats.failed += 1;
                emit_progress(
                    &app,
                    ExportProgressEvent {
                        page_id: Some(page.page_id.clone()),
                        status: "failed".into(),
                        progress: (page_number * 100) / total.max(1),
                        stats: stats.clone(),
                        message_key: None,
                        message_params: None,
                        message: Some(redact_secrets(&error)),
                    },
                )?;
            }
        }
    }

    if stats.exported + stats.failed < total {
        stats.skipped = total.saturating_sub(stats.exported + stats.failed);
    }

    emit_progress(
        &app,
        ExportProgressEvent {
            page_id: None,
            status: "complete".into(),
            progress: 100,
            stats: stats.clone(),
            message_key: Some("export.complete".into()),
            message_params: Some(json!({
                "exported": stats.exported,
                "failed": stats.failed,
                "attachments": stats.attachments,
            })),
            message: None,
        },
    )?;

    Ok(ExportPagesAck { export_id })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_page_selection_message_is_stable() {
        assert_eq!(EMPTY_SELECTION, codes::EMPTY_SELECTION);
    }

    #[test]
    fn redacts_secret_terms_from_errors() {
        let message = "Failed with cookie and api_token values";
        let redacted = redact_secrets(message);

        assert!(!redacted.to_lowercase().contains("cookie"));
        assert!(!redacted.to_lowercase().contains("token"));
        assert!(redacted.contains("[redacted]"));
    }

    #[test]
    fn maps_sidecar_export_payload() {
        let payload = serde_json::json!({
            "pages": [{
                "pageId": "123",
                "title": "Home",
                "filename": "Home.md",
                "markdown": "# Home\n",
                "attachments": [{
                    "filename": "diagram.png",
                    "relativePath": "attachments/diagram.png",
                    "contentBase64": "YWJj"
                }]
            }]
        });

        let pages = parse_exported_pages(&payload).expect("pages");

        assert_eq!(pages.len(), 1);
        assert_eq!(pages[0].filename, "Home.md");
        assert_eq!(pages[0].markdown.as_deref(), Some("# Home\n"));
        assert_eq!(pages[0].attachments[0].relative_path, "attachments/diagram.png");
    }

    #[test]
    fn maps_sidecar_html_export_payload() {
        let payload = serde_json::json!({
            "pages": [{
                "pageId": "123",
                "title": "Home",
                "filename": "Home.html",
                "html": "<h1>Home</h1>",
                "attachments": []
            }]
        });

        let pages = parse_exported_pages(&payload).expect("pages");

        assert_eq!(pages[0].filename, "Home.html");
        assert_eq!(pages[0].html.as_deref(), Some("<h1>Home</h1>"));
        assert!(pages[0].markdown.is_none());
    }
}
