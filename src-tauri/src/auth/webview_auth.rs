use std::sync::{Arc, Mutex, mpsc};
use std::time::Duration;

use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri::WindowEvent;

use crate::auth::{SecretStore, SsoAuthConfig};
use crate::contracts::AuthStatus;

pub const SSO_WINDOW_LABEL: &str = "confluence-sso";

const COOKIE_FALLBACK_MSG: &str =
    "SSO completed, but this platform did not expose reusable Confluence cookies. Use manual API Token or Cookie fallback.";

const LOGIN_TIMEOUT: Duration = Duration::from_secs(600);

pub fn is_login_success_url(url: &str) -> bool {
    let parsed = match Url::parse(url) {
        Ok(value) => value,
        Err(_) => return false,
    };

    if parsed.scheme() != "https" {
        return false;
    }

    if matches!(
        parsed.host_str(),
        Some("id.atlassian.com") | Some("auth.atlassian.com")
    ) {
        return false;
    }

    let path = parsed.path();
    path == "/wiki" || path.starts_with("/wiki/")
}

fn normalize_base_url(base_url: &str) -> Result<String, String> {
    let trimmed = base_url.trim().trim_end_matches('/');
    if !trimmed.starts_with("https://") {
        return Err("Confluence URL must start with https://".to_string());
    }
    Ok(trimmed.to_string())
}

fn cookies_to_header(cookies: &[tauri::webview::Cookie<'_>]) -> String {
    cookies
        .iter()
        .map(|cookie| format!("{}={}", cookie.name(), cookie.value()))
        .collect::<Vec<_>>()
        .join("; ")
}

fn read_document_cookie(window: &WebviewWindow) -> Result<String, String> {
    let (tx, rx) = mpsc::sync_channel::<String>(1);
    window
        .eval_with_callback("document.cookie", move |result| {
            let _ = tx.send(result);
        })
        .map_err(|error| format!("eval document.cookie: {error}"))?;

    let raw = rx
        .recv_timeout(Duration::from_secs(5))
        .map_err(|_| "timed out reading document.cookie".to_string())?;

    let parsed: String = serde_json::from_str(&raw).unwrap_or(raw);
    Ok(parsed.trim().to_string())
}

fn extract_reusable_cookies(window: &WebviewWindow, wiki_url: &Url) -> Result<String, String> {
    let cookies_for_wiki = window
        .cookies_for_url(wiki_url.clone())
        .map_err(|error| format!("reading webview cookies: {error}"))?;
    let mut header = cookies_to_header(&cookies_for_wiki);

    if header.is_empty() {
        let all_cookies = window
            .cookies()
            .map_err(|error| format!("reading all webview cookies: {error}"))?;
        header = cookies_to_header(&all_cookies);
    }

    if header.is_empty() {
        header = read_document_cookie(window)?;
    }

    if header.is_empty() {
        return Err(COOKIE_FALLBACK_MSG.to_string());
    }

    Ok(header)
}

async fn wait_for_login_success(
    login_rx: mpsc::Receiver<String>,
    cancel_rx: mpsc::Receiver<()>,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || loop {
        if cancel_rx.try_recv().is_ok() {
            return Err("SSO login was cancelled".to_string());
        }

        match login_rx.recv_timeout(Duration::from_millis(500)) {
            Ok(url) => return Ok(url),
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                return Err(
                    "SSO login window closed before authentication completed".to_string(),
                );
            }
        }
    })
    .await
    .map_err(|error| format!("waiting for SSO login: {error}"))?
}

pub async fn start_sso_login<S: SecretStore + Send + Sync>(
    app: AppHandle,
    base_url: String,
    secret_store: &S,
) -> Result<AuthStatus, String> {
    let base_url = normalize_base_url(&base_url)?;
    let wiki_url = Url::parse(&format!("{base_url}/wiki"))
        .map_err(|error| format!("invalid Confluence URL: {error}"))?;

    if let Some(existing) = app.get_webview_window(SSO_WINDOW_LABEL) {
        let _ = existing.close();
    }

    let (login_tx, login_rx) = mpsc::sync_channel::<String>(1);
    let (cancel_tx, cancel_rx) = mpsc::sync_channel::<()>(1);
    let login_sender = Arc::new(Mutex::new(Some(login_tx)));
    let cancel_sender = Arc::new(Mutex::new(Some(cancel_tx)));

    let login_sender_for_navigation = Arc::clone(&login_sender);
    let cancel_sender_for_window = Arc::clone(&cancel_sender);

    let window = WebviewWindowBuilder::new(
        &app,
        SSO_WINDOW_LABEL,
        WebviewUrl::External(wiki_url.clone()),
    )
    .title("Sign in to Confluence")
    .inner_size(960.0, 720.0)
    .center()
    .on_navigation(move |url| {
        if is_login_success_url(&url.to_string()) {
            if let Some(sender) = login_sender_for_navigation
                .lock()
                .ok()
                .and_then(|mut guard| guard.take())
            {
                let _ = sender.send(url.to_string());
            }
        }
        true
    })
    .build()
    .map_err(|error| format!("opening SSO window: {error}"))?;

    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed) {
            if let Some(sender) = cancel_sender_for_window
                .lock()
                .ok()
                .and_then(|mut guard| guard.take())
            {
                let _ = sender.send(());
            }
        }
    });

    let login_url = tokio::time::timeout(
        LOGIN_TIMEOUT,
        wait_for_login_success(login_rx, cancel_rx),
    )
    .await
    .map_err(|_| "SSO login timed out".to_string())??;

    let parsed_login_url = Url::parse(&login_url)
        .map_err(|error| format!("invalid post-login URL: {error}"))?;

    let cookie = tokio::task::spawn_blocking({
        let window = window.clone();
        move || extract_reusable_cookies(&window, &parsed_login_url)
    })
    .await
    .map_err(|error| format!("extracting SSO cookies: {error}"))??;

    let _ = window.close();

    secret_store.save_sso_auth(&SsoAuthConfig {
        base_url: base_url.clone(),
        cookie,
        display_name: None,
    })?;

    secret_store.load_status()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_confluence_wiki_urls_as_login_success() {
        assert!(is_login_success_url(
            "https://example.atlassian.net/wiki/home"
        ));
        assert!(is_login_success_url(
            "https://example.atlassian.net/wiki/spaces/ENG"
        ));
        assert!(!is_login_success_url("https://id.atlassian.com/login"));
    }

    #[test]
    fn rejects_non_https_and_auth_hosts() {
        assert!(!is_login_success_url("http://example.atlassian.net/wiki/home"));
        assert!(!is_login_success_url("https://auth.atlassian.com/login"));
        assert!(!is_login_success_url("not-a-url"));
    }
}
