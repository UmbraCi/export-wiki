import zipfile
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest
from requests.exceptions import ChunkedEncodingError, ConnectionError, HTTPError, Timeout

from confluence_export_sidecar.exporter import (
    _configure_cme,
    _download_attachment_content,
    build_attachment_manifest,
    build_exported_page,
)



def test_attachment_manifest_uses_obsidian_relative_paths():
    manifest = build_attachment_manifest("Home", [{"filename": "diagram.png", "content": b"abc"}])

    assert manifest[0]["filename"] == "diagram.png"
    assert manifest[0]["relativePath"] == "attachments/diagram.png"
    assert manifest[0]["contentBase64"] == "YWJj"


def test_html_export_uses_html_filename():
    page = build_exported_page(
        page_id="123",
        title="Home",
        content="<h1>Home</h1>",
        format="html",
        attachments=[],
    )

    assert page["filename"] == "Home.html"
    assert page["html"] == "<h1>Home</h1>"


def test_sso_export_uses_official_session_cookie_config():
    with patch(
        "confluence_export_sidecar.exporter.ApiClientFactory.create_confluence"
    ) as create_confluence:
        _configure_cme(
            {
                "base_url": "https://wiki.example.com",
                "method": "sso",
                "cookie": "JSESSIONID=abc",
            },
            include_attachments=False,
        )

    auth = create_confluence.call_args.args[1]
    assert auth.session_cookies.get_secret_value() == "JSESSIONID=abc"


def test_cme_get_retries_interrupted_chunked_response():
    import requests

    session = requests.Session()
    complete = Mock(status_code=200)
    request = Mock(side_effect=[ChunkedEncodingError("truncated"), complete])
    session.request = request
    client = SimpleNamespace(session=session)
    with patch("confluence_export_sidecar.exporter.ApiClientFactory.create_confluence", return_value=client), \
         patch("confluence_export_sidecar.exporter.sleep") as sleep:
        _configure_cme(
            {"base_url": "https://wiki.example.com", "method": "sso", "cookie": "JSESSIONID=abc"},
            include_attachments=False,
        )
        assert client.session.request(
            method="GET", url="https://wiki.example.com/rest/api/content/search"
        ) is complete

    assert request.call_count == 2
    sleep.assert_called_once_with(1)


@pytest.mark.parametrize("error", [ChunkedEncodingError, ConnectionError, Timeout])
def test_attachment_network_failures_have_bounded_retries(error):
    attachment = SimpleNamespace(id="99", filename="99.png", download_link="/download/99.png")
    client = Mock(url="https://wiki.test")
    client.session.get.side_effect = error("interrupted")
    with patch("confluence_export_sidecar.exporter.get_thread_confluence", return_value=client), \
         patch("confluence_export_sidecar.attachment_download.sleep") as sleep:
        assert _download_attachment_content(attachment, client.url) is None
    assert client.session.get.call_count == 3
    assert [call.args[0] for call in sleep.call_args_list] == [1, 2]


def test_attachment_http_failure_is_not_retried():
    attachment = SimpleNamespace(id="99", filename="99.png", download_link="/download/99.png")
    response = Mock(status_code=403)
    response.raise_for_status.side_effect = HTTPError("403 Forbidden")
    client = Mock(url="https://wiki.test")
    client.session.get.return_value = response
    with patch("confluence_export_sidecar.exporter.get_thread_confluence", return_value=client), \
         patch("confluence_export_sidecar.attachment_download.sleep") as sleep:
        assert _download_attachment_content(attachment, client.url) is None
    client.session.get.assert_called_once()
    response.close.assert_called_once()
    sleep.assert_not_called()


def test_attachment_body_interruption_retries_and_closes_responses():
    attachment = SimpleNamespace(id="99", filename="99.png", download_link="/download/99.png")
    interrupted = Mock(status_code=200, headers={})
    interrupted.iter_content.side_effect = ChunkedEncodingError("incomplete body")
    complete = Mock(status_code=200, headers={})
    complete.iter_content.return_value = [b"image"]
    client = Mock(url="https://wiki.test")
    client.session.get.side_effect = [interrupted, complete]
    with patch("confluence_export_sidecar.exporter.get_thread_confluence", return_value=client), \
         patch("confluence_export_sidecar.attachment_download.sleep"):
        assert _download_attachment_content(attachment, client.url) == b"image"
    interrupted.close.assert_called_once()
    complete.close.assert_called_once()


def test_wiki_export_preserves_jira_link_without_requesting_jira_credentials():
    from bs4 import BeautifulSoup
    from confluence_markdown_exporter.confluence import Page

    source = SimpleNamespace(base_url="https://wiki.test")
    element = BeautifulSoup('<span data-jira-key="FE-123"><a class="jira-issue-key" href="https://jira.test/browse/FE-123">FE-123</a></span>', "html.parser").span
    with patch("confluence_export_sidecar.exporter.ApiClientFactory.create_confluence"), \
         patch("confluence_markdown_exporter.confluence.JiraIssue._fetch_cached", side_effect=AssertionError("Wiki export must not request Jira")):
        _configure_cme({"base_url": "https://wiki.test", "method": "cookie", "cookie": "test"}, False)
        result = Page.Converter(source).convert_jira_issue(element, "FE-123", [])
    assert "FE-123" in result
    assert "https://jira.test/browse/FE-123" in result
