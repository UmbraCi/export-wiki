#![allow(dead_code)]

use crate::app_error::{self, codes, AppError};
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
        validation_error: None,
        authenticated: false,
        method: None,
        base_url: None,
        display_name: None,
    }
}

fn validate_manual_auth(config: &ManualAuthConfig) -> Result<(), String> {
    if !config.base_url.starts_with("https://") {
        return Err(app_error::invalid_https_url());
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
                return Err(AppError::new(codes::API_TOKEN_REQUIRED).into_invoke_error());
            }
        }
        ManualAuthMethod::Cookie => {
            let has_cookie = config
                .cookie
                .as_ref()
                .is_some_and(|value| !value.is_empty());

            if !has_cookie {
                return Err(AppError::new(codes::COOKIE_REQUIRED).into_invoke_error());
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
    crate::auth::webview_auth::complete_sso_login(app, &state.secret_store, &state.sso_session)
        .await
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

    let generation = state.secret_store.generation()?;
    let candidate = crate::auth::secret_store::manual_sidecar_auth(&config)?;
    let client = SidecarClient::resolve_default()?;
    client.get_current_user(&candidate).await?;
    state.secret_store.save_manual_auth(&config, generation)?;

    let status = state.secret_store.load_status()?;
    auth_diag!(
        "save_manual_auth complete authenticated={} method={:?}",
        status.authenticated,
        status.method
    );
    Ok(status)
}

#[tauri::command]
pub async fn get_auth_status(
    state: State<'_, crate::state::AppState>,
) -> Result<AuthStatus, String> {
    restore_auth_status(&state.secret_store, |auth| async move {
        SidecarClient::resolve_default()?
            .get_current_user(&auth)
            .await
            .map(|_| ())
    })
    .await
}

async fn restore_auth_status<S, F, Fut>(store: &S, validate: F) -> Result<AuthStatus, String>
where
    S: SecretStore,
    F: FnOnce(crate::auth::SidecarAuthConfig) -> Fut,
    Fut: std::future::Future<Output = Result<(), String>>,
{
    let generation = store.generation()?;
    let mut status = store.load_status()?;
    let Some(auth) = store.load_sidecar_auth()? else {
        return Ok(status);
    };
    let result = validate(auth).await;
    if store.generation()? != generation {
        return Err(crate::auth::secret_store::cancelled_auth_error());
    }
    if let Err(error) = result {
        status.authenticated = false;
        if error == app_error::auth_required() {
            store.clear_if_unchanged(generation)?;
            status.validation_error = Some("SESSION_EXPIRED".into());
        } else {
            status.validation_error = Some("AUTH_CHECK_FAILED".into());
        }
    }
    Ok(status)
}

#[tauri::command]
pub async fn logout(
    app: tauri::AppHandle,
    state: State<'_, crate::state::AppState>,
) -> Result<AuthStatus, String> {
    state.secret_store.clear()?;
    crate::sidecar::client::clear_directory_worker().await;
    crate::auth::webview_auth::cancel_sso_login(&app, &state.sso_session)?;
    let cleared = tokio::task::spawn_blocking(move || {
        use tauri::Manager;
        let window = app
            .get_webview_window("main")
            .ok_or("main window not available")?;
        for cookie in window.cookies().map_err(|_| "reading cookies failed")? {
            window
                .delete_cookie(cookie)
                .map_err(|_| "clearing cookies failed")?;
        }
        Ok::<(), &str>(())
    })
    .await;
    let mut status = unauthenticated_status();
    if !matches!(cleared, Ok(Ok(()))) {
        status.validation_error = Some("BROWSER_SESSION_CLEAR_FAILED".into());
    }
    Ok(status)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn restoring_valid_credentials_does_not_open_login_or_change_store() {
        let (_directory, store) = saved_store();
        assert!(
            restore_auth_status(&store, |_| async { Ok(()) })
                .await
                .unwrap()
                .authenticated
        );
        assert_eq!(store.generation().unwrap(), 1);
    }

    #[tokio::test]
    async fn expired_credentials_are_deleted_but_url_is_kept_for_relogin() {
        let (_directory, store) = saved_store();
        let status = restore_auth_status(&store, |_| async { Err(app_error::auth_required()) })
            .await
            .unwrap();
        assert!(!status.authenticated);
        assert_eq!(status.base_url.as_deref(), Some("https://wiki.example.com"));
        assert_eq!(status.validation_error.as_deref(), Some("SESSION_EXPIRED"));
        assert!(store.load_sidecar_auth().unwrap().is_none());
    }

    #[tokio::test]
    async fn network_failure_keeps_saved_credentials_for_retry() {
        let (_directory, store) = saved_store();
        let status = restore_auth_status(&store, |_| async { Err("connection timed out".into()) })
            .await
            .unwrap();
        assert!(!status.authenticated);
        assert_eq!(
            status.validation_error.as_deref(),
            Some("AUTH_CHECK_FAILED")
        );
        assert!(store.load_sidecar_auth().unwrap().is_some());
    }

    #[tokio::test]
    async fn late_validation_cannot_delete_new_credentials() {
        let (_directory, store) = saved_store();
        let result = restore_auth_status(&store, |_| async {
            store.clear().unwrap();
            Err(app_error::auth_required())
        })
        .await;
        assert_eq!(
            result.unwrap_err(),
            crate::auth::secret_store::cancelled_auth_error()
        );
    }

    fn saved_store() -> (tempfile::TempDir, crate::auth::PersistentSecretStore) {
        let (directory, store) = crate::auth::secret_store::tests::test_store();
        store
            .save_sso_auth(
                &crate::auth::SsoAuthConfig {
                    base_url: "https://wiki.example.com".into(),
                    cookie: "session=abc".into(),
                    display_name: None,
                },
                0,
            )
            .unwrap();
        (directory, store)
    }

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

        assert_eq!(error, app_error::invalid_https_url());
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
            AppError::new(codes::API_TOKEN_REQUIRED).into_invoke_error()
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

        assert_eq!(
            error,
            AppError::new(codes::COOKIE_REQUIRED).into_invoke_error()
        );
    }
}
