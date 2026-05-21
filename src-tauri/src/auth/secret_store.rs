use crate::auth::base_url::normalize_confluence_base_url;
use crate::commands::auth::{ManualAuthConfig, ManualAuthMethod};
use crate::app_error::{codes, AppError};
use crate::contracts::{AuthMethod, AuthStatus};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct StoredMetadata {
    base_url: String,
    method: AuthMethod,
    username: Option<String>,
}

#[derive(Debug, Clone)]
struct InternalCredential {
    metadata: StoredMetadata,
    secret: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SidecarAuthConfig {
    pub base_url: String,
    pub method: AuthMethod,
    pub username: Option<String>,
    pub api_token: Option<String>,
    pub cookie: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SsoAuthConfig {
    pub base_url: String,
    pub cookie: String,
    pub display_name: Option<String>,
}

pub trait SecretStore {
    fn save_manual_auth(&self, config: &ManualAuthConfig) -> Result<(), String>;
    fn save_sso_auth(&self, config: &SsoAuthConfig) -> Result<(), String>;
    fn load_status(&self) -> Result<AuthStatus, String>;
    fn load_sidecar_auth(&self) -> Result<Option<SidecarAuthConfig>, String>;
    fn clear(&self) -> Result<(), String>;
}

fn manual_method_to_auth_method(method: &ManualAuthMethod) -> AuthMethod {
    match method {
        ManualAuthMethod::ApiToken => AuthMethod::ApiToken,
        ManualAuthMethod::Cookie => AuthMethod::Cookie,
    }
}

fn extract_secret(config: &ManualAuthConfig) -> Result<String, String> {
    match config.method {
        ManualAuthMethod::ApiToken => config
            .api_token
            .clone()
            .ok_or_else(|| "API token authentication requires username and API token".to_string()),
        ManualAuthMethod::Cookie => config
            .cookie
            .clone()
            .ok_or_else(|| "Cookie authentication requires a cookie value".to_string()),
    }
}

fn credential_to_sidecar_auth(credential: &InternalCredential) -> SidecarAuthConfig {
    let (api_token, cookie) = match credential.metadata.method {
        AuthMethod::ApiToken => (Some(credential.secret.clone()), None),
        AuthMethod::Cookie | AuthMethod::Sso => (None, Some(credential.secret.clone())),
    };

    let base_url = normalize_confluence_base_url(&credential.metadata.base_url)
        .unwrap_or_else(|_| credential.metadata.base_url.clone());

    SidecarAuthConfig {
        base_url,
        method: credential.metadata.method.clone(),
        username: credential.metadata.username.clone(),
        api_token,
        cookie,
    }
}

fn credential_to_status(credential: &InternalCredential) -> AuthStatus {
    AuthStatus {
        authenticated: true,
        method: Some(credential.metadata.method.clone()),
        base_url: Some(credential.metadata.base_url.clone()),
        display_name: credential.metadata.username.clone(),
    }
}

fn unauthenticated_status() -> AuthStatus {
    AuthStatus {
        authenticated: false,
        method: None,
        base_url: None,
        display_name: None,
    }
}

fn build_credential(config: &ManualAuthConfig) -> Result<InternalCredential, String> {
    let base_url = normalize_confluence_base_url(&config.base_url)?;
    Ok(InternalCredential {
        metadata: StoredMetadata {
            base_url,
            method: manual_method_to_auth_method(&config.method),
            username: config.username.clone(),
        },
        secret: extract_secret(config)?,
    })
}

fn build_sso_credential(config: &SsoAuthConfig) -> Result<InternalCredential, String> {
    if config.cookie.trim().is_empty() {
        return Err(AppError::new(codes::SSO_REQUIRES_SESSION_COOKIES).into_invoke_error());
    }

    let base_url = normalize_confluence_base_url(&config.base_url)?;
    Ok(InternalCredential {
        metadata: StoredMetadata {
            base_url,
            method: AuthMethod::Sso,
            username: config.display_name.clone(),
        },
        secret: config.cookie.clone(),
    })
}

/// In-process credential store. Secrets are cleared when the app exits.
#[derive(Default)]
pub struct MemorySecretStore {
    credential: Mutex<Option<InternalCredential>>,
}

impl SecretStore for MemorySecretStore {
    fn save_manual_auth(&self, config: &ManualAuthConfig) -> Result<(), String> {
        let credential = build_credential(config)?;
        *self.credential.lock().map_err(|e| e.to_string())? = Some(credential);
        Ok(())
    }

    fn save_sso_auth(&self, config: &SsoAuthConfig) -> Result<(), String> {
        let credential = build_sso_credential(config)?;
        *self.credential.lock().map_err(|e| e.to_string())? = Some(credential);
        Ok(())
    }

    fn load_status(&self) -> Result<AuthStatus, String> {
        let guard = self.credential.lock().map_err(|e| e.to_string())?;
        Ok(match guard.as_ref() {
            Some(credential) => credential_to_status(credential),
            None => unauthenticated_status(),
        })
    }

    fn load_sidecar_auth(&self) -> Result<Option<SidecarAuthConfig>, String> {
        let guard = self.credential.lock().map_err(|e| e.to_string())?;
        Ok(guard.as_ref().map(credential_to_sidecar_auth))
    }

    fn clear(&self) -> Result<(), String> {
        *self.credential.lock().map_err(|e| e.to_string())? = None;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::auth::ManualAuthMethod;

    #[test]
    fn memory_store_roundtrip() {
        let store = MemorySecretStore::default();
        store
            .save_manual_auth(&ManualAuthConfig {
                base_url: "https://wiki.example.com".into(),
                method: ManualAuthMethod::Cookie,
                username: None,
                api_token: None,
                cookie: Some("JSESSIONID=abc".into()),
            })
            .expect("save credentials");

        let status = store.load_status().expect("load status");
        assert!(status.authenticated);
        store.clear().expect("clear credentials");
        assert!(!store.load_status().expect("load status").authenticated);
    }

    #[test]
    fn status_does_not_include_secret_material() {
        let store = MemorySecretStore::default();
        store
            .save_manual_auth(&ManualAuthConfig {
                base_url: "https://example.atlassian.net".into(),
                method: ManualAuthMethod::ApiToken,
                username: Some("user@example.com".into()),
                api_token: Some("secret-token".into()),
                cookie: None,
            })
            .expect("save credentials");

        let status = store.load_status().expect("load status");
        let serialized = serde_json::to_string(&status).expect("serialize status");

        assert!(!serialized.contains("secret-token"));
        assert!(status.authenticated);
    }
}
