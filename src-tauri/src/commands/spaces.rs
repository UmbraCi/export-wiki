use crate::auth::SecretStore;
use crate::contracts::{PageNode, SpaceInfo};
use crate::sidecar::client::SidecarClient;
use crate::state::AppState;
use serde::Deserialize;
use tauri::State;

const AUTH_REQUIRED: &str = "Authentication required";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SidecarPageNode {
    id: String,
    title: String,
    parent_id: Option<String>,
    children: Vec<SidecarPageNode>,
}

#[derive(Debug, Deserialize)]
struct SidecarSpace {
    key: String,
    name: String,
    #[serde(rename = "type")]
    space_type: String,
}

fn require_sidecar_auth(state: &AppState) -> Result<crate::auth::SidecarAuthConfig, String> {
    let status = state.secret_store.load_status()?;
    if !status.authenticated {
        return Err(AUTH_REQUIRED.to_string());
    }

    state
        .secret_store
        .load_sidecar_auth()?
        .ok_or_else(|| AUTH_REQUIRED.to_string())
}

pub(crate) fn map_spaces_from_payload(payload: &serde_json::Value) -> Result<Vec<SpaceInfo>, String> {
    let raw = payload
        .get("spaces")
        .ok_or_else(|| "sidecar response missing spaces".to_string())?;

    let spaces: Vec<SidecarSpace> =
        serde_json::from_value(raw.clone()).map_err(|error| format!("decode spaces: {error}"))?;

    Ok(spaces
        .into_iter()
        .map(|space| SpaceInfo {
            key: space.key,
            name: space.name,
            space_type: space.space_type,
        })
        .collect())
}

pub(crate) fn map_page_tree_from_payload(payload: &serde_json::Value) -> Result<Vec<PageNode>, String> {
    let raw = payload
        .get("pages")
        .ok_or_else(|| "sidecar response missing pages".to_string())?;

    let pages: Vec<SidecarPageNode> =
        serde_json::from_value(raw.clone()).map_err(|error| format!("decode pages: {error}"))?;

    Ok(pages.into_iter().map(map_page_node).collect())
}

fn map_page_node(node: SidecarPageNode) -> PageNode {
    PageNode {
        id: node.id,
        title: node.title,
        parent_id: node.parent_id,
        children: node.children.into_iter().map(map_page_node).collect(),
    }
}

#[tauri::command]
pub async fn get_spaces(state: State<'_, AppState>) -> Result<Vec<SpaceInfo>, String> {
    let auth = require_sidecar_auth(&state)?;
    let client = SidecarClient::resolve_default()?;
    let response = client.get_spaces(&auth).await?;

    map_spaces_from_payload(&response.payload)
}

#[tauri::command]
pub async fn get_page_tree(
    space_key: String,
    state: State<'_, AppState>,
) -> Result<Vec<PageNode>, String> {
    let auth = require_sidecar_auth(&state)?;
    let client = SidecarClient::resolve_default()?;
    let response = client.get_page_tree(&auth, &space_key).await?;

    map_page_tree_from_payload(&response.payload)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn maps_sidecar_spaces_payload() {
        let payload = json!({
            "spaces": [
                {"key": "ENG", "name": "Engineering", "type": "global"}
            ]
        });

        let spaces = map_spaces_from_payload(&payload).expect("spaces");

        assert_eq!(spaces.len(), 1);
        assert_eq!(spaces[0].key, "ENG");
        assert_eq!(spaces[0].name, "Engineering");
        assert_eq!(spaces[0].space_type, "global");
    }

    #[test]
    fn maps_nested_page_tree_payload() {
        let payload = json!({
            "pages": [
                {
                    "id": "1",
                    "title": "Home",
                    "parentId": null,
                    "children": [
                        {
                            "id": "2",
                            "title": "Child",
                            "parentId": "1",
                            "children": []
                        }
                    ]
                }
            ]
        });

        let pages = map_page_tree_from_payload(&payload).expect("pages");

        assert_eq!(pages.len(), 1);
        assert_eq!(pages[0].title, "Home");
        assert_eq!(pages[0].children.len(), 1);
        assert_eq!(pages[0].children[0].parent_id.as_deref(), Some("1"));
    }

    #[test]
    fn unauthenticated_guard_message_is_stable() {
        assert_eq!(AUTH_REQUIRED, "Authentication required");
    }
}
