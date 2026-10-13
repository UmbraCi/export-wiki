from unittest.mock import patch

import pytest
from requests import HTTPError, Response, Timeout

from confluence_export_sidecar.__main__ import _dispatch
from confluence_export_sidecar.confluence_client import AuthenticationRequired


@pytest.mark.parametrize("error,expired", [
    (AuthenticationRequired("anonymous user"), True),
    (Timeout("network unavailable"), False),
])
def test_session_check_distinguishes_expiration_from_network_failure(error, expired):
    with patch("confluence_export_sidecar.__main__.ConfluenceClient") as client:
        client.return_value.fetch_current_user.side_effect = error
        response = _dispatch({
            "type": "get_current_user", "request_id": "auth-check",
            "payload": {"auth": {"base_url": "https://wiki.example.com", "method": "sso", "cookie": "session=fixture"}},
        })
    assert response["ok"] is False
    assert (response["error"] == '{"code":"AUTH_REQUIRED"}') is expired


@pytest.mark.parametrize("status,expired", [(401, True), (403, False), (500, False)])
def test_http_authentication_errors_do_not_treat_permission_or_server_errors_as_expired(status, expired):
    response = Response()
    response.status_code = status
    with patch("confluence_export_sidecar.__main__.ConfluenceClient") as client:
        client.return_value.fetch_current_user.side_effect = HTTPError("HTTP failure", response=response)
        result = _dispatch({
            "type": "get_current_user", "request_id": "auth-check",
            "payload": {"auth": {"method": "cookie"}},
        })
    assert (result["error"] == '{"code":"AUTH_REQUIRED"}') is expired
