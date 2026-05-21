use crate::app_error;
use tauri::Url;

/// Normalize any Confluence URL (origin, dashboard, or viewpage link) to `https://{host}`.
pub fn normalize_confluence_base_url(base_url: &str) -> Result<String, String> {
    let (stored_base, _) = normalize_confluence_base_url_parts(base_url)?;
    Ok(stored_base)
}

/// Returns `(stored_base, host)` for SSO entry resolution.
pub fn normalize_confluence_base_url_parts(base_url: &str) -> Result<(String, String), String> {
    let trimmed = base_url.trim();
    if trimmed.is_empty() {
        return Err(app_error::invalid_https_url());
    }

    let parsed =
        Url::parse(trimmed).map_err(|_| app_error::invalid_https_url())?;
    if parsed.scheme() != "https" {
        return Err(app_error::invalid_https_url());
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| "Confluence URL must include a host".to_string())?
        .to_string();

    let stored_base = format!("https://{host}");
    Ok((stored_base, host))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_viewpage_url_to_origin() {
        let normalized = normalize_confluence_base_url(
            "https://wiki.heytea.com/pages/viewpage.action?pageId=110888526",
        )
        .expect("viewpage url");

        assert_eq!(normalized, "https://wiki.heytea.com");
    }

    #[test]
    fn normalizes_cloud_wiki_path_to_origin() {
        let normalized =
            normalize_confluence_base_url("https://acme.atlassian.net/wiki/spaces/ENG")
                .expect("cloud wiki url");

        assert_eq!(normalized, "https://acme.atlassian.net");
    }

    #[test]
    fn rejects_non_https() {
        let error = normalize_confluence_base_url("http://wiki.example.com")
            .expect_err("http should fail");

        assert_eq!(error, app_error::invalid_https_url());
    }
}
