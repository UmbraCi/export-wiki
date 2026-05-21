use crate::auth::SecretStore;
use crate::contracts::{ConfluenceUrlTarget, PageNode, SearchResult, SpaceInfo};
use crate::sidecar::client::SidecarClient;
use crate::state::AppState;
use serde::Deserialize;
use tauri::{State, Url};

const AUTH_REQUIRED: &str = "Authentication required";
pub const INVALID_CONFLUENCE_URL: &str = "Enter a Confluence page or space URL";

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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SidecarSearchResult {
    page_id: String,
    title: String,
    space_key: String,
    excerpt: String,
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

pub(crate) fn map_search_results_from_payload(
    payload: &serde_json::Value,
) -> Result<Vec<SearchResult>, String> {
    let raw = payload
        .get("results")
        .ok_or_else(|| "sidecar response missing results".to_string())?;

    let results: Vec<SidecarSearchResult> =
        serde_json::from_value(raw.clone()).map_err(|error| format!("decode search results: {error}"))?;

    Ok(results
        .into_iter()
        .map(|result| SearchResult {
            page_id: result.page_id,
            title: result.title,
            space_key: result.space_key,
            excerpt: result.excerpt,
        })
        .collect())
}

pub fn parse_confluence_url(url: &str) -> Result<ConfluenceUrlTarget, String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err(INVALID_CONFLUENCE_URL.to_string());
    }

    let parsed = Url::parse(trimmed).map_err(|_| INVALID_CONFLUENCE_URL.to_string())?;
    if parsed.scheme() != "https" && parsed.scheme() != "http" {
        return Err(INVALID_CONFLUENCE_URL.to_string());
    }

    let segments: Vec<&str> = parsed
        .path()
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();

    if let Some(space_index) = segments.iter().position(|segment| *segment == "spaces") {
        if let Some(space_key) = segments.get(space_index + 1) {
            if segments.get(space_index + 2) == Some(&"pages") {
                if let Some(page_id) = segments.get(space_index + 3) {
                    if page_id.chars().all(|ch| ch.is_ascii_digit()) {
                        return Ok(ConfluenceUrlTarget {
                            page_id: Some(page_id.to_string()),
                            space_key: Some(space_key.to_string()),
                        });
                    }
                }
            }

            return Ok(ConfluenceUrlTarget {
                page_id: None,
                space_key: Some(space_key.to_string()),
            });
        }
    }

    if parsed.path().ends_with("/viewpage.action") {
        for (key, value) in parsed.query_pairs() {
            if key == "pageId" && !value.is_empty() {
                return Ok(ConfluenceUrlTarget {
                    page_id: Some(value.into_owned()),
                    space_key: None,
                });
            }
        }
    }

    if let Some(display_index) = segments.iter().position(|segment| *segment == "display") {
        if let Some(space_key) = segments.get(display_index + 1) {
            return Ok(ConfluenceUrlTarget {
                page_id: None,
                space_key: Some(space_key.to_string()),
            });
        }
    }

    Err(INVALID_CONFLUENCE_URL.to_string())
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

#[tauri::command]
pub async fn search_pages(query: String, state: State<'_, AppState>) -> Result<Vec<SearchResult>, String> {
    let auth = require_sidecar_auth(&state)?;
    let client = SidecarClient::resolve_default()?;
    let response = client.search_pages(&auth, &query).await?;

    map_search_results_from_payload(&response.payload)
}

#[tauri::command]
pub fn parse_confluence_url_command(url: String) -> Result<ConfluenceUrlTarget, String> {
    parse_confluence_url(&url)
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

    #[test]
    fn maps_sidecar_search_results_payload() {
        let payload = json!({
            "results": [
                {
                    "pageId": "123",
                    "title": "Home",
                    "spaceKey": "ENG",
                    "excerpt": "Hello"
                }
            ]
        });

        let results = map_search_results_from_payload(&payload).expect("search results");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].page_id, "123");
        assert_eq!(results[0].space_key, "ENG");
        assert_eq!(results[0].excerpt, "Hello");
    }

    #[test]
    fn parse_cloud_page_url() {
        let target = parse_confluence_url(
            "https://example.atlassian.net/wiki/spaces/ENG/pages/123456/Home",
        )
        .expect("page url");

        assert_eq!(target.page_id.as_deref(), Some("123456"));
        assert_eq!(target.space_key.as_deref(), Some("ENG"));
    }

    #[test]
    fn parse_cloud_space_url() {
        let target =
            parse_confluence_url("https://example.atlassian.net/wiki/spaces/ENG/overview")
                .expect("space url");

        assert!(target.page_id.is_none());
        assert_eq!(target.space_key.as_deref(), Some("ENG"));
    }

    #[test]
    fn parse_server_page_url() {
        let target = parse_confluence_url(
            "https://confluence.example.com/pages/viewpage.action?pageId=98765",
        )
        .expect("server page url");

        assert_eq!(target.page_id.as_deref(), Some("98765"));
        assert!(target.space_key.is_none());
    }

    #[test]
    fn parse_server_space_url() {
        let target = parse_confluence_url("https://confluence.example.com/display/ENG")
            .expect("server space url");

        assert!(target.page_id.is_none());
        assert_eq!(target.space_key.as_deref(), Some("ENG"));
    }

    #[test]
    fn rejects_non_confluence_urls() {
        let error = parse_confluence_url("https://example.com/docs/page").expect_err("invalid url");

        assert_eq!(error, INVALID_CONFLUENCE_URL);
    }
}
