"""Markdown conversion and Obsidian-compatible attachment manifests."""

from __future__ import annotations

import base64
import re
import tempfile
from pathlib import Path
from typing import Any

from confluence_markdown_exporter.api_clients import _thread_local, get_thread_confluence
from confluence_markdown_exporter.confluence import Page, normalize_instance_url
from confluence_markdown_exporter.utils.app_data_store import (
    ApiDetails,
    AppSettings,
    AuthConfig,
    ExportConfig,
)
from pydantic import SecretStr

from confluence_export_sidecar.confluence_client import ConfluenceClient

_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")
_WINDOWS_RESERVED = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}


def sanitize_filename(filename: str) -> str:
    """Sanitize a filename for cross-platform filesystem writes."""
    sanitized = _CONTROL_CHARS.sub("", filename).rstrip(" .")
    stem = Path(sanitized).stem.upper()
    if stem in _WINDOWS_RESERVED:
        sanitized = f"{sanitized}_"
    return sanitized[:255] or "untitled"


def build_attachment_manifest(
    page_title: str,
    attachments: list[dict[str, Any]],
) -> list[dict[str, str]]:
    """Build Obsidian-compatible attachment entries for Rust file writes."""
    _ = page_title
    manifest: list[dict[str, str]] = []
    for attachment in attachments:
        filename = str(attachment["filename"])
        content = attachment["content"]
        if isinstance(content, str):
            content_bytes = content.encode("utf-8")
        else:
            content_bytes = bytes(content)
        manifest.append(
            {
                "filename": filename,
                "relativePath": f"attachments/{filename}",
                "contentBase64": base64.b64encode(content_bytes).decode("ascii"),
            }
        )
    return manifest


def _wiki_base_url(auth: dict[str, Any]) -> str:
    base_url = str(auth.get("base_url", "")).rstrip("/")
    if not base_url:
        raise ValueError("auth.base_url is required")
    if "/wiki" not in base_url:
        return f"{base_url}/wiki"
    return base_url


def _configure_cme(auth: dict[str, Any], include_attachments: bool) -> str:
    base_url = normalize_instance_url(_wiki_base_url(auth))
    export_config = ExportConfig(
        output_path=Path(tempfile.gettempdir()) / "cme-sidecar-export",
        page_path="{page_title}.md",
        attachment_path="attachments/{attachment_title}{attachment_extension}",
        attachment_href="relative",
        attachments_export="referenced" if include_attachments else "disabled",
        skip_unchanged=False,
        cleanup_stale=False,
    )

    confluence_auth: dict[str, ApiDetails] = {}
    method = str(auth.get("method", ""))
    if method == "api_token":
        confluence_auth[base_url] = ApiDetails(
            username=SecretStr(str(auth.get("username") or "")),
            api_token=SecretStr(str(auth.get("api_token") or "")),
        )

    app_settings = AppSettings(
        export=export_config,
        auth=AuthConfig(confluence=confluence_auth),
    )

    import confluence_markdown_exporter.confluence as cme_confluence

    cme_confluence.settings = app_settings

    client = ConfluenceClient(auth)._client
    if not hasattr(_thread_local, "clients"):
        _thread_local.clients = {}
    _thread_local.clients[base_url] = client
    return base_url


def _download_attachment_content(attachment: Any, base_url: str) -> bytes | None:
    client = get_thread_confluence(base_url)
    try:
        response = client.request(
            method="GET",
            path=client.url + attachment.download_link,
            absolute=True,
            advanced_mode=True,
        )
        response.raise_for_status()
    except Exception:  # noqa: BLE001
        return None
    return response.content


def build_exported_page(
    *,
    page_id: str,
    title: str,
    content: str,
    format: str = "markdown",
    attachments: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Build a sidecar export payload for Markdown or HTML output."""
    safe_title = sanitize_filename(title)
    manifest = build_attachment_manifest(title, attachments or [])

    if format == "html":
        return {
            "pageId": page_id,
            "title": title,
            "filename": f"{safe_title}.html",
            "html": content,
            "attachments": manifest,
        }

    return {
        "pageId": page_id,
        "title": title,
        "filename": f"{safe_title}.md",
        "markdown": content,
        "attachments": manifest,
    }


def export_page(
    page_id: str,
    auth: dict[str, Any],
    include_attachments: bool,
    export_format: str = "markdown",
) -> dict[str, Any]:
    """Export one Confluence page to Markdown or HTML and attachment manifests."""
    base_url = _configure_cme(auth, include_attachments)
    page = Page.from_id(int(page_id), base_url)
    if page.title == "Page not accessible":
        raise ValueError(f"Page {page_id} is not accessible")

    content = page.html if export_format == "html" else page.markdown
    raw_attachments: list[dict[str, Any]] = []
    if include_attachments:
        for attachment in page._attachments_for_export():  # noqa: SLF001
            attachment_content = _download_attachment_content(attachment, base_url)
            if attachment_content is None:
                continue
            filename = sanitize_filename(attachment.filename)
            raw_attachments.append({"filename": filename, "content": attachment_content})

    return build_exported_page(
        page_id=str(page_id),
        title=page.title,
        content=content,
        format=export_format,
        attachments=raw_attachments,
    )


def export_pages(
    auth: dict[str, Any],
    page_ids: list[str],
    include_attachments: bool,
    export_format: str = "markdown",
) -> list[dict[str, Any]]:
    """Export multiple pages for the sidecar export_pages command."""
    return [
        export_page(page_id, auth, include_attachments, export_format)
        for page_id in page_ids
    ]
