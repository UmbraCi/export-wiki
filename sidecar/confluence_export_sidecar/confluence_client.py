"""Thin Confluence REST adapter for browse and export commands."""

from __future__ import annotations

import html
import re
from typing import Any

from atlassian import Confluence

_HTML_TAG_RE = re.compile(r"<[^>]+>")


def normalize_spaces(raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep only the fields required by the Tauri browse contract."""
    return [
        {
            "key": space.get("key", ""),
            "name": space.get("name", ""),
            "type": space.get("type", "global"),
        }
        for space in raw
    ]


def normalize_page_node(raw: dict[str, Any]) -> dict[str, Any]:
    children = raw.get("children") or []
    parent_id = raw.get("parent_id", raw.get("parentId"))
    return {
        "id": str(raw.get("id", "")),
        "title": raw.get("title", ""),
        "parentId": parent_id,
        "children": [normalize_page_node(child) for child in children],
    }


def normalize_page_tree(raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [normalize_page_node(page) for page in raw]


def _strip_html_excerpt(value: str) -> str:
    without_tags = _HTML_TAG_RE.sub("", value)
    return html.unescape(without_tags).strip()


def normalize_search_results(raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Map sidecar search hits to the Tauri SearchResult contract."""
    normalized: list[dict[str, Any]] = []
    for item in raw:
        page_id = str(item.get("pageId") or item.get("id") or "")
        normalized.append(
            {
                "pageId": page_id,
                "title": item.get("title", ""),
                "spaceKey": item.get("spaceKey", ""),
                "excerpt": _strip_html_excerpt(str(item.get("excerpt", ""))),
            }
        )
    return normalized


class ConfluenceClient:
    """Authenticated Confluence client built from a sidecar auth payload."""

    def __init__(self, auth: dict[str, Any]) -> None:
        self._auth = auth
        self._client = self._build_client()

    def _build_client(self) -> Confluence:
        base_url = str(self._auth.get("base_url", "")).rstrip("/")
        if not base_url:
            raise ValueError("auth.base_url is required")

        method = str(self._auth.get("method", ""))
        wiki_url = f"{base_url}/wiki" if "/wiki" not in base_url else base_url
        cloud = ".atlassian.net" in base_url

        if method == "api_token":
            username = self._auth.get("username") or ""
            api_token = self._auth.get("api_token") or ""
            if not username or not api_token:
                raise ValueError("API token auth requires username and api_token")
            return Confluence(
                url=wiki_url,
                username=username,
                password=api_token,
                cloud=cloud,
            )

        cookie = self._auth.get("cookie") or ""
        if method in {"cookie", "sso"} and cookie:
            client = Confluence(url=wiki_url, cloud=cloud)
            client.session.headers["Cookie"] = cookie
            return client

        raise ValueError(f"Unsupported or incomplete auth method: {method!r}")

    def fetch_spaces(self) -> list[dict[str, Any]]:
        raw_spaces: list[dict[str, Any]] = []
        start = 0
        limit = 50

        while True:
            response = self._client.get_all_spaces(
                start=start,
                limit=limit,
                expand="description",
            )
            batch = response.get("results", [])
            raw_spaces.extend(batch)
            if len(batch) < limit:
                break
            start += limit

        return normalize_spaces(
            [
                {
                    "key": space.get("key", ""),
                    "name": space.get("name", ""),
                    "type": space.get("type", "global"),
                }
                for space in raw_spaces
            ]
        )

    def fetch_page_tree(self, space_key: str) -> list[dict[str, Any]]:
        space = self._client.get_space(space_key, expand="homepage")
        homepage = space.get("homepage") or {}
        homepage_id = homepage.get("id")
        if homepage_id is None:
            return []

        root = self._build_page_node(str(homepage_id), None)
        return normalize_page_tree([root])

    def search_pages(self, query: str, limit: int = 25) -> list[dict[str, Any]]:
        trimmed = query.strip()
        if not trimmed:
            return []

        escaped = trimmed.replace('"', '\\"')
        cql = f'type=page AND title ~ "{escaped}*"'
        response = self._client.cql(cql, limit=limit)
        raw_results: list[dict[str, Any]] = []

        for item in response.get("results", []):
            content = item.get("content") or {}
            page_id = content.get("id") or item.get("id")
            if page_id is None:
                continue

            space = item.get("space") or content.get("space") or {}
            space_key = ""
            if isinstance(space, dict):
                space_key = space.get("key", "")

            raw_results.append(
                {
                    "id": str(page_id),
                    "title": item.get("title") or content.get("title", ""),
                    "spaceKey": space_key,
                    "excerpt": item.get("excerpt", ""),
                }
            )

        return normalize_search_results(raw_results)

    def fetch_current_user(self) -> dict[str, Any]:
        user = self._client.get("rest/api/user/current")
        return {
            "displayName": user.get("displayName") or user.get("username") or "",
            "accountId": user.get("accountId") or user.get("account_id") or "",
        }

    def _build_page_node(self, page_id: str, parent_id: str | None) -> dict[str, Any]:
        page = self._client.get_page_by_id(page_id, expand="title")
        children_raw = self._client.get_page_child_by_type(page_id, type="page", limit=250)
        if isinstance(children_raw, dict):
            child_items = children_raw.get("results", [])
        else:
            child_items = children_raw or []

        children = [
            self._build_page_node(str(child.get("id")), page_id)
            for child in child_items
            if child.get("id") is not None
        ]

        return {
            "id": str(page_id),
            "title": page.get("title", ""),
            "parent_id": parent_id,
            "children": children,
        }
