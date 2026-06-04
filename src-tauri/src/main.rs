#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app_error;
mod auth;
mod contracts;
mod commands;
mod dev_icon;
mod export;
mod sidecar;
mod state;
mod sync;

use state::AppState;
#[cfg(feature = "dev-connector")]
use tauri::Manager;
#[cfg(feature = "dev-connector")]
const DEV_CONNECTOR_CAPABILITY: &str =
    include_str!("../capabilities-dev/dev-connector.json");

fn main() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init());

    #[cfg(feature = "dev-connector")]
    {
        builder = builder.plugin(tauri_plugin_connector::init());
    }

    builder
        .manage(AppState::default())
        .setup(|app| {
            #[cfg(feature = "dev-connector")]
            app.add_capability(DEV_CONNECTOR_CAPABILITY)
                .map_err(|e| format!("dev-connector capability: {e}"))?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::auth::start_sso_login,
            commands::auth::get_sso_session_status,
            commands::auth::navigate_sso_window,
            commands::auth::complete_sso_login,
            commands::auth::cancel_sso_login,
            commands::auth::save_manual_auth,
            commands::auth::get_auth_status,
            commands::auth::logout,
            commands::spaces::get_spaces,
            commands::spaces::get_page_tree,
            commands::spaces::search_pages,
            commands::spaces::parse_confluence_url_command,
            commands::export::export_pages,
            commands::config::load_config,
            commands::config::save_config,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let tauri::RunEvent::Ready = event {
                dev_icon::set_dev_dock_icon();
            }
        });
}