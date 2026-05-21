use crate::auth::KeyringSecretStore;

#[derive(Default)]
pub struct AppState {
    pub secret_store: KeyringSecretStore,
}
