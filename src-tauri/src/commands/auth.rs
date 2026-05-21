#![allow(dead_code)]

use crate::contracts::{AuthStatus};
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

#[tauri::command]
pub fn start_sso_login(base_url: String, _state: State<crate::state::AppState>) -> Result<AuthStatus, String> {
    let _ = base_url;
    Err("SSO login is not connected yet".to_string())
}

#[tauri::command]
pub fn save_manual_auth(
    config: ManualAuthConfig,
    _state: State<crate::state::AppState>,
) -> Result<AuthStatus, String> {
    let _ = config;
    Ok(unauthenticated_status())
}

#[tauri::command]
pub fn get_auth_status(_state: State<crate::state::AppState>) -> Result<AuthStatus, String> {
    Ok(unauthenticated_status())
}

#[tauri::command]
pub fn logout(_state: State<crate::state::AppState>) -> Result<AuthStatus, String> {
    Ok(unauthenticated_status())
}

#[cfg(test)]
mod tests {
    #[test]
    fn unauthenticated_status_is_empty() {
        let status = super::unauthenticated_status();

        assert!(!status.authenticated);
        assert!(status.method.is_none());
        assert!(status.base_url.is_none());
    }
}
