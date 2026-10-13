from unittest.mock import MagicMock, patch

import pytest

from confluence_export_sidecar.confluence_client import (
    ConfluenceClient,
    normalize_instance_url,
    normalize_page_tree,
    normalize_spaces,
)


def test_normalize_instance_url_strips_viewpage_path_and_query():
    url = "https://wiki.heytea.com/pages/viewpage.action?pageId=110888526"

    assert normalize_instance_url(url) == "https://wiki.heytea.com"


def test_normalize_spaces_keeps_required_fields():
    raw = [{"key": "ENG", "name": "Engineering", "type": "global"}]

    assert normalize_spaces(raw) == [{"key": "ENG", "name": "Engineering", "type": "global"}]


def test_normalize_page_tree_uses_camel_case_parent_id():
    raw = [{"id": "123", "title": "Home", "parent_id": None, "children": []}]

    assert normalize_page_tree(raw) == [
        {
            "id": "123",
            "title": "Home",
            "parentId": None,
            "children": [],
            "childrenLoaded": True,
            "hasChildren": False,
        }
    ]


def test_fetch_current_user_rejects_anonymous_session():
    client = ConfluenceClient({"base_url": "https://wiki.example.com", "method": "sso", "cookie": "JSESSIONID=abc"})
    client._client = MagicMock()
    client._client.get.return_value = {"displayName": "Anonymous", "accountId": ""}

    with pytest.raises(ValueError, match="not authenticated"):
        client.fetch_current_user()


def test_sso_uses_session_cookie_jar():
    with patch("confluence_export_sidecar.confluence_client.Confluence") as confluence:
        ConfluenceClient(
            {
                "base_url": "https://wiki.example.com",
                "method": "sso",
                "cookie": "JSESSIONID=abc; route=a=b",
            }
        )

    session = confluence.call_args.kwargs["session"]
    assert session.cookies.get_dict() == {"JSESSIONID": "abc", "route": "a=b"}


def test_fetch_page_tree_uses_menu_metadata_only():
    client = ConfluenceClient({"base_url": "https://wiki.example.com", "method": "sso", "cookie": "JSESSIONID=abc"})
    client._client = MagicMock()
    client._client.get_space.return_value = {
        "homepage": {"id": "1", "title": "Home"},
    }
    client._client.get_page_child_by_type.return_value = {
        "results": [{"id": "2", "title": "Child"}],
    }

    pages = client.fetch_page_tree("ENG")

    assert pages[0]["title"] == "Home"
    assert pages[0]["children"][0]["title"] == "Child"
    client._client.get_page_by_id.assert_not_called()


def test_fetch_page_descendants_uses_paged_cql():
    client = ConfluenceClient({"base_url": "https://wiki.example.com", "method": "sso", "cookie": "JSESSIONID=abc"})
    client._client = MagicMock()
    client._client.cql.side_effect = [
        {"results": [{"content": {"id": "2", "title": "Child"}}], "totalSize": 2},
        {"results": [{"content": {"id": "3", "title": "Grandchild"}}], "totalSize": 2},
    ]

    pages = client.fetch_page_descendants("1")

    assert [page["id"] for page in pages] == ["2", "3"]
    assert client._client.cql.call_args_list[0].kwargs == {"start": 0, "limit": 250}
    assert client._client.cql.call_args_list[1].kwargs == {"start": 1, "limit": 250}
