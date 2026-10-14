use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::app_error::{self, codes, AppError};
use crate::auth::SecretStore;
use crate::contracts::{ExportFormat, ExportOptions, ExportProgressEvent, ExportStats};
use crate::export::file_writer::{write_exported_page, ExportedAttachment, ExportedPage};
use crate::sidecar::client::{SidecarClient, SidecarLog};
use crate::state::AppState;

use serde_json::{json, Value};

const EMPTY_SELECTION: &str = codes::EMPTY_SELECTION;

struct ExportGuard<'a>(&'a AtomicBool);

impl Drop for ExportGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

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
        ExportFormat::MigrationPackage => "migration_package",
    };

    if options.output_dir.trim().is_empty() {
        return Err(AppError::new(codes::OUTPUT_DIR_REQUIRED).into_invoke_error());
    }

    if state
        .export_running
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err(AppError::new("EXPORT_IN_PROGRESS").into_invoke_error());
    }
    let _guard = ExportGuard(&state.export_running);
    let auth = require_sidecar_auth(&state)?;
    state.export_cancelled.store(false, Ordering::SeqCst);
    let client = SidecarClient::resolve_default()?;
    let on_log = |entry: SidecarLog| {
        if let Some(progress) = &entry.progress {
            let _ = emit_progress(&app, progress.clone());
        }
        let _ = app.emit_to("main", "export-log", entry);
    };
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

    if options.format == ExportFormat::MigrationPackage {
        if state.export_cancelled.load(Ordering::SeqCst) {
            return Err(AppError::new(codes::EXPORT_CANCELLED).into_invoke_error());
        }
        emit_progress(
            &app,
            ExportProgressEvent {
                page_id: Some(options.page_ids[0].clone()),
                status: "writing".into(),
                progress: 0,
                stats: stats.clone(),
                message_key: Some("export.writing".into()),
                message_params: Some(json!({ "filename": "migration package" })),
                message: None,
            },
        )?;
        let response = client
            .export_migration_package_with_cancel(
                &auth,
                &options.page_ids,
                &options.output_dir,
                options.include_attachments,
                &state.export_cancelled,
                &on_log,
            )
            .await
            .map_err(|error| {
                if state.export_cancelled.load(Ordering::SeqCst) {
                    AppError::new(codes::EXPORT_CANCELLED).into_invoke_error()
                } else {
                    redact_secrets(&error)
                }
            })?;
        if state.export_cancelled.load(Ordering::SeqCst) {
            return Err(AppError::new(codes::EXPORT_CANCELLED).into_invoke_error());
        }
        stats.exported = total;
        stats.attachments = response
            .payload
            .get("attachments")
            .and_then(Value::as_u64)
            .unwrap_or(0) as u32;
        emit_progress(
            &app,
            ExportProgressEvent {
                page_id: None,
                status: "complete".into(),
                progress: 100,
                stats: stats.clone(),
                message_key: Some("export.complete".into()),
                message_params: Some(
                    json!({ "exported": total, "failed": 0, "attachments": stats.attachments }),
                ),
                message: None,
            },
        )?;
        return Ok(ExportPagesAck { export_id });
    }

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
        .export_pages_with_cancel(
            &auth,
            &options.page_ids,
            &options.output_dir,
            format,
            options.include_attachments,
            &state.export_cancelled,
            &on_log,
        )
        .await
        .map_err(|error| {
            if state.export_cancelled.load(Ordering::SeqCst) {
                AppError::new(codes::EXPORT_CANCELLED).into_invoke_error()
            } else {
                redact_secrets(&error)
            }
        })?;

    if state.export_cancelled.load(Ordering::SeqCst) {
        return Err(AppError::new(codes::EXPORT_CANCELLED).into_invoke_error());
    }

    let pages = parse_exported_pages(&response.payload).map_err(|error| redact_secrets(&error))?;

    for (index, page) in pages.iter().enumerate() {
        if state.export_cancelled.load(Ordering::SeqCst) {
            return Err(AppError::new(codes::EXPORT_CANCELLED).into_invoke_error());
        }
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

    if stats.exported == total {
        if let Some(path) = response
            .payload
            .get("checkpoint_path")
            .and_then(Value::as_str)
        {
            let checkpoint = PathBuf::from(path);
            if checkpoint.starts_with(
                output_dir
                    .canonicalize()
                    .unwrap_or(output_dir.clone())
                    .join(".export-wiki-resume"),
            ) {
                let _ = std::fs::remove_dir_all(checkpoint);
            }
        }
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

#[tauri::command]
pub fn cancel_export(state: State<'_, AppState>) -> Result<(), String> {
    state.export_cancelled.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub fn save_log_file(window: tauri::Window, path: String, contents: String) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Log files can only be saved from the main window".into());
    }
    std::fs::write(path, contents).map_err(|error| format!("save log file: {error}"))
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
        assert_eq!(
            pages[0].attachments[0].relative_path,
            "attachments/diagram.png"
        );
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
