use crate::auth::{MemorySecretStore, webview_auth::SsoSessionManager};

pub struct AppState {
    pub secret_store: MemorySecretStore,
    pub sso_session: SsoSessionManager,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            secret_store: MemorySecretStore::default(),
            sso_session: SsoSessionManager::default(),
        }
    }
}
