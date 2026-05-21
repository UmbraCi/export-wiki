#![allow(dead_code)]

use crate::auth::SecretStore;
use crate::contracts::AuthStatus;
use serde::{Deserialize, Serialize};
use tauri::State;

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
pub fn start_sso_login(base_url: String, _state: State<crate::state::AppState>) -> Result<AuthStatus, String> {
    let _ = base_url;
    Err("SSO login is not connected yet".to_string())
}

#[tauri::command]
pub fn save_manual_auth(
    config: ManualAuthConfig,
    state: State<crate::state::AppState>,
) -> Result<AuthStatus, String> {
    validate_manual_auth(&config)?;
    state.secret_store.save_manual_auth(&config)?;
    state.secret_store.load_status()
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
