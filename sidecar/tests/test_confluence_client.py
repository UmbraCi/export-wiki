from unittest.mock import MagicMock

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
        {"id": "123", "title": "Home", "parentId": None, "children": []}
    ]


def test_fetch_current_user_rejects_anonymous_session():
    client = ConfluenceClient({"base_url": "https://wiki.example.com", "method": "sso", "cookie": "JSESSIONID=abc"})
    client._client = MagicMock()
    client._client.get.return_value = {"displayName": "Anonymous", "accountId": ""}

    with pytest.raises(ValueError, match="not authenticated"):
        client.fetch_current_user()
