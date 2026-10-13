use crate::app_error::{codes, AppError};
use crate::auth::base_url::normalize_confluence_base_url;
use crate::commands::auth::{ManualAuthConfig, ManualAuthMethod};
use crate::contracts::{AuthMethod, AuthStatus};
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::{ErrorKind, Write};
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct StoredMetadata {
    base_url: String,
    method: AuthMethod,
    username: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
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
    fn generation(&self) -> Result<u64, String>;
    fn save_manual_auth(&self, config: &ManualAuthConfig, generation: u64) -> Result<(), String>;
    fn save_sso_auth(&self, config: &SsoAuthConfig, generation: u64) -> Result<(), String>;
    fn load_status(&self) -> Result<AuthStatus, String>;
    fn load_sidecar_auth(&self) -> Result<Option<SidecarAuthConfig>, String>;
    fn clear(&self) -> Result<(), String>;
    fn clear_if_unchanged(&self, generation: u64) -> Result<(), String>;
}

pub fn manual_sidecar_auth(config: &ManualAuthConfig) -> Result<SidecarAuthConfig, String> {
    Ok(credential_to_sidecar_auth(&build_credential(config)?))
}

pub fn sso_sidecar_auth(config: &SsoAuthConfig) -> Result<SidecarAuthConfig, String> {
    Ok(credential_to_sidecar_auth(&build_sso_credential(config)?))
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
        validation_error: None,
        authenticated: true,
        method: Some(credential.metadata.method.clone()),
        base_url: Some(credential.metadata.base_url.clone()),
        display_name: credential.metadata.username.clone(),
    }
}

fn unauthenticated_status() -> AuthStatus {
    AuthStatus {
        validation_error: None,
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

/// Store the current credential in the user's app config directory.
pub struct PersistentSecretStore {
    path: Result<PathBuf, String>,
    generation: Mutex<u64>,
}

fn storage_error() -> String {
    AppError::new("AUTH_STORAGE_FAILED").into_invoke_error()
}

pub fn cancelled_auth_error() -> String {
    AppError::new("AUTH_OPERATION_CANCELLED").into_invoke_error()
}

impl Default for PersistentSecretStore {
    fn default() -> Self {
        Self {
            path: dirs::config_dir()
                .map(|path| path.join("export-wiki").join("auth.json"))
                .ok_or_else(storage_error),
            generation: Mutex::new(0),
        }
    }
}

impl PersistentSecretStore {
    fn read(&self) -> Result<Option<InternalCredential>, String> {
        let _guard = self.generation.lock().map_err(|_| storage_error())?;
        match fs::read(self.path.as_ref().map_err(Clone::clone)?) {
            Ok(raw) => {
                let mut credential: InternalCredential =
                    serde_json::from_slice(&raw).map_err(|_| storage_error())?;
                credential.metadata.base_url =
                    normalize_confluence_base_url(&credential.metadata.base_url)
                        .map_err(|_| storage_error())?;
                if credential.secret.trim().is_empty()
                    || (credential.metadata.method == AuthMethod::ApiToken
                        && !credential
                            .metadata
                            .username
                            .as_ref()
                            .is_some_and(|name| !name.trim().is_empty()))
                {
                    return Err(storage_error());
                }
                Ok(Some(credential))
            }
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
            Err(_) => Err(storage_error()),
        }
    }

    fn save(&self, credential: InternalCredential, expected: u64) -> Result<(), String> {
        let mut generation = self.generation.lock().map_err(|_| storage_error())?;
        if *generation != expected {
            return Err(cancelled_auth_error());
        }
        let path = self.path.as_ref().map_err(Clone::clone)?;
        let parent = path.parent().ok_or_else(storage_error)?;
        fs::create_dir_all(parent).map_err(|_| storage_error())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(parent, fs::Permissions::from_mode(0o700))
                .map_err(|_| storage_error())?;
        }
        let raw = serde_json::to_vec_pretty(&credential).map_err(|_| storage_error())?;
        let temporary = parent.join(format!(".auth-{}.tmp", uuid::Uuid::new_v4()));
        let result = (|| {
            let mut options = OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            let mut file = options.open(&temporary)?;
            file.write_all(&raw)?;
            file.sync_all()?;
            drop(file);
            fs::rename(&temporary, path)
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
            return Err(storage_error());
        }
        *generation += 1;
        Ok(())
    }

    fn delete(&self, expected: Option<u64>) -> Result<(), String> {
        let mut generation = self.generation.lock().map_err(|_| storage_error())?;
        if expected.is_some_and(|expected| expected != *generation) {
            return Err(cancelled_auth_error());
        }
        match fs::remove_file(self.path.as_ref().map_err(Clone::clone)?) {
            Ok(()) => {}
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(_) => return Err(storage_error()),
        }
        *generation += 1;
        Ok(())
    }
}

impl SecretStore for PersistentSecretStore {
    fn generation(&self) -> Result<u64, String> {
        Ok(*self.generation.lock().map_err(|_| storage_error())?)
    }

    fn save_manual_auth(&self, config: &ManualAuthConfig, generation: u64) -> Result<(), String> {
        self.save(build_credential(config)?, generation)
    }

    fn save_sso_auth(&self, config: &SsoAuthConfig, generation: u64) -> Result<(), String> {
        self.save(build_sso_credential(config)?, generation)
    }

    fn load_status(&self) -> Result<AuthStatus, String> {
        Ok(match self.read()?.as_ref() {
            Some(credential) => credential_to_status(credential),
            None => unauthenticated_status(),
        })
    }

    fn load_sidecar_auth(&self) -> Result<Option<SidecarAuthConfig>, String> {
        Ok(self.read()?.as_ref().map(credential_to_sidecar_auth))
    }

    fn clear(&self) -> Result<(), String> {
        self.delete(None)
    }

    fn clear_if_unchanged(&self, generation: u64) -> Result<(), String> {
        self.delete(Some(generation))
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::commands::auth::ManualAuthMethod;

    #[test]
    fn persistent_store_roundtrip() {
        let (_directory, store) = test_store();
        store
            .save_manual_auth(
                &ManualAuthConfig {
                    base_url: "https://wiki.example.com".into(),
                    method: ManualAuthMethod::Cookie,
                    username: None,
                    api_token: None,
                    cookie: Some("JSESSIONID=abc".into()),
                },
                0,
            )
            .expect("save credentials");

        let status = store.load_status().expect("load status");
        assert!(status.authenticated);
        store.clear().expect("clear credentials");
        assert!(!store.load_status().expect("load status").authenticated);
    }

    #[test]
    fn status_does_not_include_secret_material() {
        let (_directory, store) = test_store();
        store
            .save_manual_auth(
                &ManualAuthConfig {
                    base_url: "https://example.atlassian.net".into(),
                    method: ManualAuthMethod::ApiToken,
                    username: Some("user@example.com".into()),
                    api_token: Some("secret-token".into()),
                    cookie: None,
                },
                0,
            )
            .expect("save credentials");

        let status = store.load_status().expect("load status");
        let serialized = serde_json::to_string(&status).expect("serialize status");

        assert!(!serialized.contains("secret-token"));
        assert!(status.authenticated);
    }

    pub(crate) fn test_store() -> (tempfile::TempDir, PersistentSecretStore) {
        let directory = tempfile::tempdir().unwrap();
        let store = PersistentSecretStore {
            path: Ok(directory.path().join("export-wiki").join("auth.json")),
            generation: Mutex::new(0),
        };
        (directory, store)
    }

    #[test]
    fn credentials_restore_from_backend_in_new_store_and_logout_deletes_them() {
        let (_directory, store) = test_store();
        store
            .save_sso_auth(
                &SsoAuthConfig {
                    base_url: "https://wiki.example.com".into(),
                    cookie: "session=abc".into(),
                    display_name: None,
                },
                0,
            )
            .unwrap();
        let restored = PersistentSecretStore {
            path: store.path.clone(),
            generation: Mutex::new(0),
        };
        assert_eq!(
            restored
                .load_sidecar_auth()
                .unwrap()
                .unwrap()
                .cookie
                .as_deref(),
            Some("session=abc")
        );
        restored.clear().unwrap();
        assert!(!store.load_status().unwrap().authenticated);
        restored.clear().unwrap();
    }

    #[test]
    fn logout_prevents_in_flight_authentication_from_restoring_credentials() {
        let (_directory, store) = test_store();
        let generation = store.generation().unwrap();
        store.clear().unwrap();
        assert_eq!(
            store
                .save_sso_auth(
                    &SsoAuthConfig {
                        base_url: "https://wiki.example.com".into(),
                        cookie: "session=abc".into(),
                        display_name: None,
                    },
                    generation
                )
                .unwrap_err(),
            cancelled_auth_error()
        );
        assert!(!store.load_status().unwrap().authenticated);
    }

    #[test]
    fn corrupt_file_is_preserved_and_errors_do_not_expose_contents() {
        let (directory, store) = test_store();
        let path = store.path.as_ref().unwrap();
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        let raw = "secret-value invalid json";
        fs::write(path, raw).unwrap();
        let error = store.load_status().unwrap_err();
        assert_eq!(error, storage_error());
        assert!(!error.contains("secret-value"));
        assert_eq!(fs::read_to_string(path).unwrap(), raw);
        drop(directory);
    }

    #[test]
    fn failed_atomic_replace_cleans_up_temporary_file() {
        let (_directory, store) = test_store();
        let path = store.path.as_ref().unwrap();
        fs::create_dir_all(path).unwrap();
        let error = store
            .save_sso_auth(
                &SsoAuthConfig {
                    base_url: "https://wiki.example.com".into(),
                    cookie: "session=secret-value".into(),
                    display_name: None,
                },
                0,
            )
            .unwrap_err();
        assert_eq!(error, storage_error());
        assert_eq!(store.generation().unwrap(), 0);
        let entries: Vec<_> = fs::read_dir(path.parent().unwrap()).unwrap().collect();
        assert_eq!(entries.len(), 1);
        assert!(path.is_dir());
    }

    #[test]
    fn successful_save_atomically_replaces_previous_credentials() {
        let (_directory, store) = test_store();
        let mut config = SsoAuthConfig {
            base_url: "https://wiki.example.com".into(),
            cookie: "session=old".into(),
            display_name: None,
        };
        store.save_sso_auth(&config, 0).unwrap();
        config.cookie = "session=new".into();
        store.save_sso_auth(&config, 1).unwrap();
        assert_eq!(
            store
                .load_sidecar_auth()
                .unwrap()
                .unwrap()
                .cookie
                .as_deref(),
            Some("session=new")
        );
        assert_eq!(
            fs::read_dir(store.path.as_ref().unwrap().parent().unwrap())
                .unwrap()
                .count(),
            1
        );
    }

    #[cfg(unix)]
    #[test]
    fn credentials_file_and_directory_are_private() {
        use std::os::unix::fs::PermissionsExt;
        let (_directory, store) = test_store();
        store
            .save_sso_auth(
                &SsoAuthConfig {
                    base_url: "https://wiki.example.com".into(),
                    cookie: "session=fixture".into(),
                    display_name: None,
                },
                0,
            )
            .unwrap();
        let path = store.path.as_ref().unwrap();
        assert_eq!(
            fs::metadata(path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        assert_eq!(
            fs::metadata(path.parent().unwrap())
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o700
        );
    }

    #[test]
    fn stored_credentials_reject_insecure_urls_before_sending_secrets() {
        let (_directory, store) = test_store();
        let path = store.path.as_ref().unwrap();
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, r#"{"metadata":{"base_url":"http://wiki.example.com","method":"sso","username":null},"secret":"session=fixture"}"#).unwrap();
        assert_eq!(store.load_sidecar_auth().unwrap_err(), storage_error());
    }
}
