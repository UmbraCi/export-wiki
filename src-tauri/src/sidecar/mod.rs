//! Sidecar stdin/stdout JSON protocol helpers and subprocess wrapper.

pub mod client;
#[cfg(feature = "dev-sidecar")]
mod dev;
pub mod protocol;
