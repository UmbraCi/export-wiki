import zipfile
from unittest.mock import patch

from confluence_export_sidecar.exporter import (
    _configure_cme,
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
