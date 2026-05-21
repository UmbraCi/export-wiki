#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod contracts;
mod commands;
mod state;

use state::AppState;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::auth::auth_configure,
            commands::auth::auth_test,
            commands::export::get_spaces,
            commands::export::get_pages,
            commands::export::start_export,
            commands::config::save_config,
            commands::config::load_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}