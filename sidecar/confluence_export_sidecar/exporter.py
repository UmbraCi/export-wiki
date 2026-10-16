"""Markdown conversion and Obsidian-compatible attachment manifests."""

from __future__ import annotations

import base64
import re
import shutil
import tempfile
from concurrent.futures import ThreadPoolExecutor
from contextlib import nullcontext
from pathlib import Path
from time import sleep
from typing import Any
from urllib.parse import urlsplit

from confluence_markdown_exporter.api_clients import (
    ApiClientFactory,
    _thread_local,
    get_thread_confluence,
)
from confluence_markdown_exporter.confluence import Page, normalize_instance_url
from confluence_markdown_exporter.utils.app_data_store import (
    ApiDetails,
    AppSettings,
    AuthConfig,
    ExportConfig,
)
from pydantic import SecretStr
from requests.exceptions import ChunkedEncodingError, ConnectionError, Timeout

from confluence_export_sidecar.attachment_download import download_attachment
from confluence_export_sidecar.checkpoint import ExportCheckpoint

from confluence_export_sidecar.log import get_logger
from confluence_export_sidecar.migration_package import publish_markdown_package

log = get_logger(__name__)


def _log_response(response: Any, *_args: Any, **_kwargs: Any) -> Any:
    (log.debug if response.ok else log.warning)(
        "HTTP %s %s → %s (%.0f ms)",
        response.request.method, urlsplit(response.url).path,
        response.status_code, response.elapsed.total_seconds() * 1000,
    )
    return response


def _retry_interrupted_gets(client: Any) -> None:
    request = client.session.request

    def request_with_retry(*args: Any, **kwargs: Any) -> Any:
        method = args[0] if args else kwargs.get("method", "")
        url = args[1] if len(args) > 1 else kwargs.get("url", "")
        if (str(method).upper() != "GET"
                or not urlsplit(str(url)).path.endswith("/rest/api/content/search")):
            return request(*args, **kwargs)
        for attempt in range(3):
            try:
                return request(*args, **kwargs)
            except (ChunkedEncodingError, ConnectionError, Timeout):
                if attempt == 2:
                    raise
                sleep(attempt + 1)

    client.session.request = request_with_retry

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


def _configure_cme(auth: dict[str, Any], include_attachments: bool, *, migration: bool = False) -> str:
    base_url = normalize_instance_url(_wiki_base_url(auth))
    export_config = ExportConfig(
        output_path=Path(tempfile.gettempdir()) / "cme-sidecar-export",
        page_path="{page_id}.md" if migration else "{page_title}.md",
        attachment_path=("attachments/{attachment_id}{attachment_extension}" if migration
                         else "attachments/{attachment_title}{attachment_extension}"),
        attachment_href="relative",
        attachments_export="referenced" if include_attachments else "disabled",
        skip_unchanged=False,
        cleanup_stale=False,
        enable_jira_enrichment=False,
    )

    confluence_auth: dict[str, ApiDetails] = {}
    method = str(auth.get("method", ""))
    if method == "api_token":
        confluence_auth[base_url] = ApiDetails(
            username=SecretStr(str(auth.get("username") or "")),
            api_token=SecretStr(str(auth.get("api_token") or "")),
        )
    elif method in {"cookie", "sso"}:
        cookie = str(auth.get("cookie") or "")
        if not cookie:
            raise ValueError("SSO auth requires cookie")
        confluence_auth[base_url] = ApiDetails(session_cookies=SecretStr(cookie))
    else:
        raise ValueError(f"Unsupported or incomplete auth method: {method!r}")

    app_settings = AppSettings(
        export=export_config,
        auth=AuthConfig(confluence=confluence_auth),
    )

    import confluence_markdown_exporter.confluence as cme_confluence

    cme_confluence.settings = app_settings

    client = ApiClientFactory(app_settings.connection_config).create_confluence(
        base_url,
        confluence_auth[base_url],
    )
    _retry_interrupted_gets(client)
    client.session.hooks.setdefault("response", []).append(_log_response)
    if not hasattr(_thread_local, "clients"):
        _thread_local.clients = {}
    _thread_local.clients[base_url] = client
    return base_url


def _download_attachment_content(attachment: Any, base_url: str, directory: Path | None = None) -> bytes | None:
    log.info("downloading attachment: id=%s filename=%s", attachment.id, attachment.filename)
    client = get_thread_confluence(base_url)
    try:
        if directory is not None:
            return download_attachment(client, attachment, directory)
        with tempfile.TemporaryDirectory(prefix="wiki-attachment-") as temporary:
            return download_attachment(client, attachment, Path(temporary))
    except Exception as exc:  # noqa: BLE001
        log.warning("attachment download failed: id=%s filename=%s — %s", attachment.id, attachment.filename, exc)
        return None


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
    download_dir: Path | None = None,
) -> dict[str, Any]:
    """Export one Confluence page to Markdown or HTML and attachment manifests."""
    log.info("exporting page_id=%s format=%s attachments=%s", page_id, export_format, include_attachments)
    base_url = _configure_cme(auth, include_attachments)
    log.info("fetching page_id=%s", page_id)
    page = Page.from_id(int(page_id), base_url)
    if page.title == "Page not accessible":
        raise ValueError(f"Page {page_id} is not accessible")

    log.info("converting page_id=%s to %s", page_id, export_format)
    content = page.html if export_format == "html" else page.markdown
    log.info("page title=%r content_len=%d", page.title, len(content))
    raw_attachments: list[dict[str, Any]] = []
    if include_attachments:
        attachments_list = list(page._attachments_for_export())  # noqa: SLF001
        log.info("found %d attachment(s) for page %s", len(attachments_list), page_id)
        for attachment in attachments_list:
            attachment_content = _download_attachment_content(attachment, base_url, download_dir)
            if attachment_content is None:
                raise ValueError(f"Attachment {attachment.id} could not be downloaded")
            # Confluence DC/Server doesn't populate fileId, so filename
            # may be just an extension (e.g. ".png").  Fall back to id.
            raw_name = attachment.filename
            if raw_name.startswith(".") or not Path(raw_name).stem:
                raw_name = f"{attachment.id}{attachment.extension}"
                log.debug("filename fallback: id=%s title=%r -> %s", attachment.id, attachment.title, raw_name)
            filename = sanitize_filename(raw_name)
            log.debug("attachment resolved: %r -> %s (%d bytes)", attachment.title, filename, len(attachment_content))
            raw_attachments.append({"filename": filename, "content": attachment_content})
        log.info("exported %d/%d attachment(s) for page %s", len(raw_attachments), len(attachments_list), page_id)

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
    output_dir: str | None = None,
) -> list[dict[str, Any]]:
    """Export multiple pages for the sidecar export_pages command."""
    log.info("export selection: format=%s page_ids=%s", export_format, page_ids)
    checkpoint = ExportCheckpoint(output_dir, auth, page_ids, export_format, include_attachments) if output_dir else None
    with checkpoint if checkpoint else nullcontext():
        return _export_pages(auth, page_ids, include_attachments, export_format, checkpoint)


def _export_pages(auth, page_ids, include_attachments, export_format, checkpoint):
    pages = []
    for page_id in page_ids:
        exported = checkpoint.load_page(page_id) if checkpoint else None
        if exported is None:
            exported = export_page(page_id, auth, include_attachments, export_format,
                                   checkpoint.downloads if checkpoint else None)
            if checkpoint:
                checkpoint.save_page(page_id, exported)
        else:
            log.info("resuming saved page_id=%s", page_id)
        pages.append(exported)
        _log_checkpoint_progress(page_id, len(pages), len(page_ids), pages)
    return pages



def export_migration_package(
    *, page_ids: list[str], auth: dict[str, Any], output_dir: str,
    include_attachments: bool = True,
) -> dict[str, Any]:
    """Fetch selected pages and publish a hierarchical Markdown ZIP."""
    log.info("export selection: format=migration_package page_ids=%s", page_ids)
    with ExportCheckpoint(output_dir, auth, page_ids, "migration_package", include_attachments) as checkpoint:
        return _export_migration_package(page_ids, auth, output_dir, include_attachments, checkpoint)


def _export_migration_package(page_ids, auth, output_dir, include_attachments, checkpoint):
    base_url = _configure_cme(auth, include_attachments, migration=True)
    pages = []
    def fetch(page_id):
        saved = checkpoint.load_page(page_id)
        if saved is not None:
            log.info("resuming saved page_id=%s", page_id)
            return saved
        # Separate partial files when pages reference the same attachment concurrently.
        downloads = checkpoint.downloads / page_id
        downloads.mkdir(exist_ok=True, mode=0o700)
        exported = _fetch_migration_page(page_id, base_url, include_attachments, downloads)
        checkpoint.save_page(page_id, exported)
        return exported

    with ThreadPoolExecutor(
        max_workers=4,
        initializer=lambda: _configure_cme(auth, include_attachments, migration=True),
    ) as executor:
        for page_id, exported in zip(page_ids, executor.map(fetch, page_ids)):
            pages.append(exported)
            _log_checkpoint_progress(page_id, len(pages), len(page_ids), pages)
    log.info("writing migration package (%d pages)", len(pages))
    package_path = publish_markdown_package(output_dir=output_dir, pages=pages)
    shutil.rmtree(checkpoint.root)
    return {
        "package_path": str(package_path),
        "attachments": len({attachment["path"]
                            for page in pages for attachment in page["attachments"]}),
    }


def _fetch_migration_page(page_id, base_url, include_attachments, download_dir):
    log.info("fetching migration page_id=%s", page_id)
    page = Page.from_id(int(page_id), base_url)
    if page.title == "Page not accessible":
        raise ValueError(f"Page {page_id} is not accessible")
    attachments = []
    if include_attachments:
        for attachment in page._attachments_for_export():  # noqa: SLF001
            content = _download_attachment_content(attachment, base_url, download_dir)
            if content is None:
                raise ValueError(f"Attachment {attachment.id} could not be downloaded")
            attachments.append({"path": attachment.export_path.as_posix(), "title": attachment.title, "content": content})
    log.info("converting migration page_id=%s", page_id)
    return {
        "id": str(page.id),
        "title": page.title,
        "source_path": [page.space.name, *(ancestor.title for ancestor in page.ancestors), page.title],
        "source_ids": [f"space:{page.space.key}", *(str(ancestor.id) for ancestor in page.ancestors), str(page.id)],
        "base_url": base_url,
        "markdown": page.markdown,
        "attachments": attachments,
    }


def _log_checkpoint_progress(page_id: str, completed: int, total: int, pages: list[dict]) -> None:
    attachments = sum(len(page["attachments"]) for page in pages)
    log.info("saved page_id=%s completed=%d/%d attachments=%d", page_id, completed, total, attachments,
             extra={"export_progress": {
                 "pageId": page_id, "status": "fetching", "progress": completed * 95 // total,
                 "stats": {"total": total, "exported": completed, "skipped": 0,
                           "failed": 0, "attachments": attachments},
                 "messageKey": "export.checkpoint", "messageParams": {"completed": completed, "total": total},
             }})
