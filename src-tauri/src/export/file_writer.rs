use std::fs;
use std::path::{Path, PathBuf};

use base64::Engine;
use base64::engine::general_purpose::STANDARD;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExportedAttachment {
    pub filename: String,
    pub relative_path: String,
    pub content_base64: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExportedPage {
    pub page_id: String,
    pub title: String,
    pub filename: String,
    pub markdown: Option<String>,
    pub html: Option<String>,
    pub attachments: Vec<ExportedAttachment>,
}

pub fn sanitize_filename(filename: &str) -> String {
    let mut sanitized = String::new();
    for ch in filename.chars() {
        if ch.is_control() {
            continue;
        }
        sanitized.push(ch);
    }
    let sanitized = sanitized.trim_end_matches([' ', '.']).to_string();
    let stem = Path::new(&sanitized)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("untitled")
        .to_ascii_uppercase();
    let reserved = [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
        "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    let mut result = if reserved.contains(&stem.as_str()) {
        format!("{sanitized}_")
    } else {
        sanitized
    };
    if result.len() > 255 {
        result.truncate(255);
    }
    if result.is_empty() {
        "untitled".to_string()
    } else {
        result
    }
}

pub fn write_exported_page(output_dir: &Path, page: &ExportedPage) -> Result<usize, String> {
    fs::create_dir_all(output_dir).map_err(|error| format!("create output dir: {error}"))?;

    let content = page
        .html
        .as_deref()
        .or(page.markdown.as_deref())
        .ok_or_else(|| format!("exported page {} has no content", page.page_id))?;

    let page_filename = sanitize_filename(&page.filename);
    let page_path = output_dir.join(page_filename);
    if let Some(parent) = page_path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("create page parent: {error}"))?;
    }
    fs::write(&page_path, content)
        .map_err(|error| format!("write page {}: {error}", page_path.display()))?;

    let mut attachments_written = 0;
    for attachment in &page.attachments {
        let relative = PathBuf::from(&attachment.relative_path);
        let attachment_path = output_dir.join(relative);
        if let Some(parent) = attachment_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("create attachment parent: {error}"))?;
        }

        let content = STANDARD
            .decode(&attachment.content_base64)
            .map_err(|error| format!("decode attachment {}: {error}", attachment.filename))?;
        fs::write(&attachment_path, content).map_err(|error| {
            format!(
                "write attachment {}: {error}",
                attachment_path.display()
            )
        })?;
        attachments_written += 1;
    }

    Ok(attachments_written)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_markdown_and_attachment_under_output_dir() {
        let temp = tempfile::tempdir().expect("tempdir");
        let page = ExportedPage {
            page_id: "123".into(),
            title: "Home".into(),
            filename: "Home.md".into(),
            markdown: Some("# Home\n".into()),
            html: None,
            attachments: vec![ExportedAttachment {
                filename: "diagram.png".into(),
                relative_path: "attachments/diagram.png".into(),
                content_base64: "YWJj".into(),
            }],
        };

        write_exported_page(temp.path(), &page).expect("write page");

        assert!(temp.path().join("Home.md").exists());
        assert!(temp.path().join("attachments/diagram.png").exists());
    }

    #[test]
    fn writes_html_and_markdown_paths_are_distinct() {
        let temp = tempfile::tempdir().expect("tempdir");
        let markdown_page = ExportedPage {
            page_id: "123".into(),
            title: "Home".into(),
            filename: "Home.md".into(),
            markdown: Some("# Home\n".into()),
            html: None,
            attachments: vec![],
        };
        let html_page = ExportedPage {
            page_id: "123".into(),
            title: "Home".into(),
            filename: "Home.html".into(),
            markdown: None,
            html: Some("<h1>Home</h1>".into()),
            attachments: vec![],
        };

        write_exported_page(temp.path(), &markdown_page).expect("write markdown");
        write_exported_page(temp.path(), &html_page).expect("write html");

        assert!(temp.path().join("Home.md").exists());
        assert!(temp.path().join("Home.html").exists());
        assert_ne!(
            temp.path().join("Home.md"),
            temp.path().join("Home.html")
        );
    }
}
