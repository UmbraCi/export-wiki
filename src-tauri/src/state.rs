use crate::auth::{webview_auth::SsoSessionManager, PersistentSecretStore};
use std::sync::atomic::AtomicBool;

pub struct AppState {
    pub secret_store: PersistentSecretStore,
    pub sso_session: SsoSessionManager,
    pub export_cancelled: AtomicBool,
    pub export_running: AtomicBool,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            secret_store: PersistentSecretStore::default(),
            sso_session: SsoSessionManager::default(),
            export_cancelled: AtomicBool::new(false),
            export_running: AtomicBool::new(false),
        }
    }
}
