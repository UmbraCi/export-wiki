#![allow(dead_code)]

use crate::auth::SecretStore;
use crate::contracts::{AuthStatus, SsoSessionInfo, SsoSessionStatus};
use crate::sidecar::client::SidecarClient;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Diagnostic logging for manual auth / cookie flow. Logs cookie names only — never values.
macro_rules! auth_diag {
    ($($arg:tt)*) => {
        eprintln!("[auth-diag] {}", format!($($arg)*));
    };
}

fn cookie_names_from_header(header: &str) -> Vec<String> {
    header
        .split(';')
        .filter_map(|part| part.trim().split('=').next())
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_string)
        .collect()
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualAuthConfig {
    pub base_url: String,
    pub method: ManualAuthMethod,
    pub username: Option<String>,
    pub api_token: Option<String>,
    pub cookie: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ManualAuthMethod {
    ApiToken,
    Cookie,
}

pub(crate) fn unauthenticated_status() -> AuthStatus {
    AuthStatus {
        authenticated: false,
        method: None,
        base_url: None,
        display_name: None,
    }
}

fn validate_manual_auth(config: &ManualAuthConfig) -> Result<(), String> {
    if !config.base_url.starts_with("https://") {
        return Err("Confluence URL must start with https://".to_string());
    }

    match config.method {
        ManualAuthMethod::ApiToken => {
            let has_username = config
                .username
                .as_ref()
                .is_some_and(|value| !value.is_empty());
            let has_token = config
                .api_token
                .as_ref()
                .is_some_and(|value| !value.is_empty());

            if !has_username || !has_token {
                return Err(
                    "API token authentication requires username and API token".to_string(),
                );
            }
        }
        ManualAuthMethod::Cookie => {
            let has_cookie = config
                .cookie
                .as_ref()
                .is_some_and(|value| !value.is_empty());

            if !has_cookie {
                return Err("Cookie authentication requires a cookie value".to_string());
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub fn start_sso_login(
    base_url: String,
    app: tauri::AppHandle,
    state: State<'_, crate::state::AppState>,
) -> Result<SsoSessionInfo, String> {
    crate::auth::webview_auth::open_sso_window(app, base_url, &state.sso_session)
}

#[tauri::command]
pub fn get_sso_session_status(
    app: tauri::AppHandle,
    state: State<'_, crate::state::AppState>,
) -> Result<SsoSessionStatus, String> {
    crate::auth::webview_auth::get_sso_session_status(&app, &state.sso_session)
}

#[tauri::command]
pub fn navigate_sso_window(
    url: String,
    app: tauri::AppHandle,
    state: State<'_, crate::state::AppState>,
) -> Result<(), String> {
    crate::auth::webview_auth::navigate_sso_window(&app, url, &state.sso_session)
}

#[tauri::command]
pub async fn complete_sso_login(
    app: tauri::AppHandle,
    state: State<'_, crate::state::AppState>,
) -> Result<AuthStatus, String> {
    crate::auth::webview_auth::complete_sso_login(app, &state.secret_store, &state.sso_session).await
}

#[tauri::command]
pub fn cancel_sso_login(
    app: tauri::AppHandle,
    state: State<'_, crate::state::AppState>,
) -> Result<(), String> {
    crate::auth::webview_auth::cancel_sso_login(&app, &state.sso_session)
}

#[tauri::command]
pub async fn save_manual_auth(
    config: ManualAuthConfig,
    state: State<'_, crate::state::AppState>,
) -> Result<AuthStatus, String> {
    auth_diag!(
        "save_manual_auth called method={:?} base_url={}",
        config.method,
        config.base_url
    );

    if config.method == ManualAuthMethod::Cookie {
        let cookie = config.cookie.as_deref().unwrap_or("");
        auth_diag!(
            "cookie payload names={:?} length={}",
            cookie_names_from_header(cookie),
            cookie.len()
        );
    }

    validate_manual_auth(&config).map_err(|error| {
        auth_diag!("validation failed: {error}");
        error
    })?;

    state.secret_store.save_manual_auth(&config).map_err(|error| {
        auth_diag!("secret store save failed: {error}");
        error
    })?;
    auth_diag!("credentials saved to secret store");

    if config.method == ManualAuthMethod::Cookie {
        let sidecar_auth = state
            .secret_store
            .load_sidecar_auth()?
            .ok_or_else(|| "Authentication required".to_string())?;
        auth_diag!(
            "validating cookie via sidecar base_url={} method={:?}",
            sidecar_auth.base_url,
            sidecar_auth.method
        );

        let client = SidecarClient::resolve_default().map_err(|error| {
            auth_diag!("sidecar resolve failed: {error}");
            error
        })?;

        if let Err(error) = client.get_current_user(&sidecar_auth).await {
            auth_diag!("cookie validation failed: {error}");
            let _ = state.secret_store.clear();
            return Err(format!(
                "Cookie validation failed: {error}. Copy all wiki cookies (include seraph.confluence), not only JSESSIONID."
            ));
        }

        auth_diag!("cookie validation succeeded");
    }

    let status = state.secret_store.load_status()?;
    auth_diag!(
        "save_manual_auth complete authenticated={} method={:?}",
        status.authenticated,
        status.method
    );
    Ok(status)
}

#[tauri::command]
pub fn get_auth_status(state: State<crate::state::AppState>) -> Result<AuthStatus, String> {
    state.secret_store.load_status()
}

#[tauri::command]
pub fn logout(state: State<crate::state::AppState>) -> Result<AuthStatus, String> {
    state.secret_store.clear()?;
    Ok(unauthenticated_status())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unauthenticated_status_is_empty() {
        let status = super::unauthenticated_status();

        assert!(!status.authenticated);
        assert!(status.method.is_none());
        assert!(status.base_url.is_none());
    }

    #[test]
    fn rejects_non_https_base_url() {
        let error = validate_manual_auth(&ManualAuthConfig {
            base_url: "http://example.atlassian.net".into(),
            method: ManualAuthMethod::ApiToken,
            username: Some("user@example.com".into()),
            api_token: Some("token".into()),
            cookie: None,
        })
        .expect_err("http url should fail");

        assert_eq!(error, "Confluence URL must start with https://");
    }

    #[test]
    fn rejects_api_token_without_username() {
        let error = validate_manual_auth(&ManualAuthConfig {
            base_url: "https://example.atlassian.net".into(),
            method: ManualAuthMethod::ApiToken,
            username: None,
            api_token: Some("token".into()),
            cookie: None,
        })
        .expect_err("missing username should fail");

        assert_eq!(
            error,
            "API token authentication requires username and API token"
        );
    }

    #[test]
    fn rejects_cookie_without_value() {
        let error = validate_manual_auth(&ManualAuthConfig {
            base_url: "https://example.atlassian.net".into(),
            method: ManualAuthMethod::Cookie,
            username: None,
            api_token: None,
            cookie: None,
        })
        .expect_err("missing cookie should fail");

        assert_eq!(error, "Cookie authentication requires a cookie value");
    }
}
