from unittest.mock import MagicMock, patch

from confluence_export_sidecar import __main__ as main


def test_browse_requests_reuse_client_and_reset_cache_when_credentials_change():
    auth = {"base_url": "https://wiki.example.com", "method": "cookie", "cookie": "session=fixture"}
    first = MagicMock()
    second = MagicMock()
    first.fetch_page_descendants.return_value = []
    second.fetch_page_descendants.return_value = []
    with patch.object(main, "_browse_client", None), patch.object(main, "_browse_auth", None), patch.object(main, "ConfluenceClient", side_effect=[first, second]) as factory:
        request = {"type": "get_page_descendants", "request_id": "test", "payload": {"auth": auth, "page_id": "1"}}
        assert main._dispatch(request)["ok"]
        assert main._dispatch(request)["ok"]
        assert factory.call_count == 1
        request["payload"]["auth"] = {**auth, "cookie": "session=replacement"}
        assert main._dispatch(request)["ok"]
        assert factory.call_count == 2
        first.close.assert_called_once()
