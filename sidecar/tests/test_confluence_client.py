from unittest.mock import MagicMock, patch
from threading import Barrier, Lock, get_ident

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

    with patch.object(client, "_build_client", return_value=client._client):
        pages = client.fetch_page_descendants("1")

    assert [page["id"] for page in pages] == ["2", "3"]
    assert client._client.cql.call_args_list[0].kwargs == {"start": 0, "limit": 250, "excerpt": "none"}


def test_descendants_fetches_remaining_pages_with_four_workers():
    client = ConfluenceClient({"base_url": "https://wiki.example.com", "method": "sso", "cookie": "session=fixture"})
    barrier = Barrier(4, timeout=2)
    lock = Lock()
    calls = []
    workers = []

    def worker():
        sdk = MagicMock()

        def fetch(cql, *, start, limit, excerpt=None):
            with lock:
                calls.append((start, get_ident(), id(sdk)))
            if start:
                barrier.wait()
            return {"results": [{"content": {"id": str(i), "title": f"Page {i}"}} for i in range(start + 2, start + 4)], "totalSize": 10}

        sdk.cql.side_effect = fetch
        workers.append(sdk)
        return sdk

    client._client = worker()
    with patch.object(client, "_build_client", side_effect=worker):
        pages = client.fetch_page_descendants("1")

    assert [page["id"] for page in pages] == [str(i) for i in range(2, 12)]
    assert sorted(start for start, _, _ in calls) == [0, 2, 4, 6, 8]
    assert len({thread for start, thread, _ in calls if start}) == 4
    assert len({sdk for start, _, sdk in calls if start}) == 4
    for sdk in workers[1:]:
        sdk.close.assert_called_once()


def test_descendants_cache_expires_without_returning_partial_results():
    client = ConfluenceClient({"base_url": "https://wiki.example.com", "method": "sso", "cookie": "session=fixture"})
    client._client = MagicMock()
    client._client.cql.return_value = {"results": [{"content": {"id": "2", "title": "Child"}}], "totalSize": 1}
    with patch("confluence_export_sidecar.confluence_client.monotonic", return_value=0):
        first = client.fetch_page_descendants("1")
        assert client.fetch_page_descendants("1") == first
    assert client._client.cql.call_count == 1

    with patch("confluence_export_sidecar.confluence_client.monotonic", return_value=301):
        client.fetch_page_descendants("1")
    assert client._client.cql.call_count == 2


def test_descendants_rejects_incomplete_pagination_and_does_not_cache_it():
    client = ConfluenceClient({"base_url": "https://wiki.example.com", "method": "sso", "cookie": "session=fixture"})
    client._client = MagicMock()
    client._client.cql.side_effect = [
        {"results": [{"content": {"id": "2"}}], "totalSize": 2},
        {"results": [{"content": {"id": "2"}}], "totalSize": 2},
    ]
    with patch.object(client, "_build_client", return_value=client._client):
        with pytest.raises(ValueError, match="incomplete"):
            client.fetch_page_descendants("1")

    client._client.cql.side_effect = None
    client._client.cql.return_value = {"results": [], "totalSize": 0}
    assert client.fetch_page_descendants("1") == []


def test_descendants_keeps_sequential_pagination_when_total_is_unknown():
    client = ConfluenceClient({"base_url": "https://wiki.example.com", "method": "sso", "cookie": "session=fixture"})
    client._client = MagicMock()
    client._client.cql.side_effect = [
        {"results": [{"content": {"id": "2"}}], "_links": {"next": "next-page"}},
        {"results": [{"content": {"id": "3"}}]},
    ]
    assert [page["id"] for page in client.fetch_page_descendants("1")] == ["2", "3"]
