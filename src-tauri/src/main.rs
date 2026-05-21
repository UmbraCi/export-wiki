#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod contracts;
mod commands;
mod export;
mod sidecar;
mod state;
mod sync;

use state::AppState;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::auth::start_sso_login,
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}