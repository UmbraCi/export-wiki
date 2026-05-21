use crate::commands::auth::{ManualAuthConfig, ManualAuthMethod};
use crate::contracts::{AuthMethod, AuthStatus};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

const SERVICE_NAME: &str = "export-wiki";
const METADATA_ACCOUNT: &str = "auth-metadata";
const SECRET_ACCOUNT: &str = "auth-secret";

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

pub struct StoredCredential {
    pub base_url: String,
    pub method: AuthMethod,
    pub username: Option<String>,
}

pub trait SecretStore {
    fn save_manual_auth(&self, config: &ManualAuthConfig) -> Result<StoredCredential, String>;
    fn load_status(&self) -> Result<AuthStatus, String>;
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

fn credential_to_stored(credential: &InternalCredential) -> StoredCredential {
    StoredCredential {
        base_url: credential.metadata.base_url.clone(),
        method: credential.metadata.method.clone(),
        username: credential.metadata.username.clone(),
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
    Ok(InternalCredential {
        metadata: StoredMetadata {
            base_url: config.base_url.clone(),
            method: manual_method_to_auth_method(&config.method),
            username: config.username.clone(),
        },
        secret: extract_secret(config)?,
    })
}

#[derive(Default)]
pub struct InMemorySecretStore {
    credential: Mutex<Option<InternalCredential>>,
}

impl SecretStore for InMemorySecretStore {
    fn save_manual_auth(&self, config: &ManualAuthConfig) -> Result<StoredCredential, String> {
        let credential = build_credential(config)?;
        let stored = credential_to_stored(&credential);
        *self.credential.lock().map_err(|e| e.to_string())? = Some(credential);
        Ok(stored)
    }

    fn load_status(&self) -> Result<AuthStatus, String> {
        let guard = self.credential.lock().map_err(|e| e.to_string())?;
        Ok(match guard.as_ref() {
            Some(credential) => credential_to_status(credential),
            None => unauthenticated_status(),
        })
    }

    fn clear(&self) -> Result<(), String> {
        *self.credential.lock().map_err(|e| e.to_string())? = None;
        Ok(())
    }
}

#[derive(Default)]
pub struct KeyringSecretStore;

impl KeyringSecretStore {
    fn metadata_entry() -> Result<Entry, String> {
        Entry::new(SERVICE_NAME, METADATA_ACCOUNT).map_err(|e| e.to_string())
    }

    fn secret_entry() -> Result<Entry, String> {
        Entry::new(SERVICE_NAME, SECRET_ACCOUNT).map_err(|e| e.to_string())
    }

    fn load_credential(&self) -> Result<Option<InternalCredential>, String> {
        let metadata_entry = Self::metadata_entry()?;
        let secret_entry = Self::secret_entry()?;

        let metadata_json = match metadata_entry.get_password() {
            Ok(value) => value,
            Err(keyring::Error::NoEntry) => return Ok(None),
            Err(error) => return Err(error.to_string()),
        };

        let secret = match secret_entry.get_password() {
            Ok(value) => value,
            Err(keyring::Error::NoEntry) => return Ok(None),
            Err(error) => return Err(error.to_string()),
        };

        let metadata: StoredMetadata =
            serde_json::from_str(&metadata_json).map_err(|e| e.to_string())?;

        Ok(Some(InternalCredential { metadata, secret }))
    }
}

impl SecretStore for KeyringSecretStore {
    fn save_manual_auth(&self, config: &ManualAuthConfig) -> Result<StoredCredential, String> {
        let credential = build_credential(config)?;
        let stored = credential_to_stored(&credential);

        let metadata_json =
            serde_json::to_string(&credential.metadata).map_err(|e| e.to_string())?;

        Self::metadata_entry()?
            .set_password(&metadata_json)
            .map_err(|e| e.to_string())?;
        Self::secret_entry()?
            .set_password(&credential.secret)
            .map_err(|e| e.to_string())?;

        Ok(stored)
    }

    fn load_status(&self) -> Result<AuthStatus, String> {
        Ok(match self.load_credential()? {
            Some(credential) => credential_to_status(&credential),
            None => unauthenticated_status(),
        })
    }

    fn clear(&self) -> Result<(), String> {
        let metadata_result = Self::metadata_entry()?.delete_credential();
        if !matches!(metadata_result, Ok(()) | Err(keyring::Error::NoEntry)) {
            return Err(metadata_result.unwrap_err().to_string());
        }

        let secret_result = Self::secret_entry()?.delete_credential();
        if !matches!(secret_result, Ok(()) | Err(keyring::Error::NoEntry)) {
            return Err(secret_result.unwrap_err().to_string());
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::auth::ManualAuthMethod;

    #[test]
    fn status_does_not_include_secret_material() {
        let store = InMemorySecretStore::default();
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
