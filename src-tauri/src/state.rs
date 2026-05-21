use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct AuthConfig {
    pub base_url: String,
    pub username: String,
    pub api_token: String,
}

#[derive(Debug, Default)]
pub struct AppState {
    pub auth_config: Mutex<Option<AuthConfig>>,
}