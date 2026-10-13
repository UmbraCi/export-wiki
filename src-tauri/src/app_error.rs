use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<Value>,
}

impl AppError {
    pub fn new(code: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            params: None,
        }
    }

    pub fn with_params(code: impl Into<String>, params: Value) -> Self {
        Self {
            code: code.into(),
            params: Some(params),
        }
    }

    pub fn into_invoke_error(self) -> String {
        serde_json::to_string(&self).unwrap_or_else(|_| self.code)
    }
}

pub mod codes {
    pub const AUTH_REQUIRED: &str = "AUTH_REQUIRED";
    pub const INVALID_CONFLUENCE_URL: &str = "INVALID_CONFLUENCE_URL";
    pub const INVALID_HTTPS_URL: &str = "INVALID_HTTPS_URL";
    pub const EMPTY_SELECTION: &str = "EMPTY_SELECTION";
    pub const OUTPUT_DIR_REQUIRED: &str = "OUTPUT_DIR_REQUIRED";
    pub const API_TOKEN_REQUIRED: &str = "API_TOKEN_REQUIRED";
    pub const COOKIE_REQUIRED: &str = "COOKIE_REQUIRED";
    pub const COOKIE_VALIDATION_FAILED: &str = "COOKIE_VALIDATION_FAILED";
    pub const SSO_COOKIE_FALLBACK: &str = "SSO_COOKIE_FALLBACK";
    pub const WIKI_SESSION_REQUIRED: &str = "WIKI_SESSION_REQUIRED";
    pub const SSO_REQUIRES_SESSION_COOKIES: &str = "SSO_REQUIRES_SESSION_COOKIES";
    pub const NAVIGATION_HTTPS_REQUIRED: &str = "NAVIGATION_HTTPS_REQUIRED";
}

pub fn auth_required() -> String {
    AppError::new(codes::AUTH_REQUIRED).into_invoke_error()
}

pub fn invalid_confluence_url() -> String {
    AppError::new(codes::INVALID_CONFLUENCE_URL).into_invoke_error()
}

pub fn invalid_https_url() -> String {
    AppError::new(codes::INVALID_HTTPS_URL).into_invoke_error()
}

pub fn cookie_validation_failed(detail: &str) -> String {
    AppError::with_params(
        codes::COOKIE_VALIDATION_FAILED,
        json!({ "detail": detail }),
    )
    .into_invoke_error()
}
