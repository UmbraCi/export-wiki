#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod contracts;
mod commands;
mod sidecar;
mod state;

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
            commands::export::export_pages,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}