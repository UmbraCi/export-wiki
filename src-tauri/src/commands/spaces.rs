use crate::contracts::{PageNode, SpaceInfo};
use tauri::State;

#[tauri::command]
pub fn get_spaces(_state: State<crate::state::AppState>) -> Result<Vec<SpaceInfo>, String> {
    Ok(vec![])
}

#[tauri::command]
pub fn get_page_tree(space_key: String, _state: State<crate::state::AppState>) -> Result<Vec<PageNode>, String> {
    let _ = space_key;
    Ok(vec![])
}
