use crate::auth::{MemorySecretStore, webview_auth::SsoSessionManager};
use std::sync::atomic::AtomicBool;

pub struct AppState {
    pub secret_store: MemorySecretStore,
    pub sso_session: SsoSessionManager,
    pub export_cancelled: AtomicBool,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            secret_store: MemorySecretStore::default(),
            sso_session: SsoSessionManager::default(),
            export_cancelled: AtomicBool::new(false),
        }
    }
}
