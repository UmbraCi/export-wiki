"""Versioned Confluence migration package output."""

from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
import uuid
import zipfile
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

_PAGE_ID = re.compile(r"^[A-Za-z0-9_-]+$")


def _sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _artifact(path: str, content: str) -> tuple[dict[str, str], bytes]:
    encoded = content.encode("utf-8")
    return {"path": path, "sha256": _sha256(encoded)}, encoded


def _public_url(url: str) -> str:
    """Keep source URLs traceable without serializing URL credentials."""
    parsed = urlsplit(url)
    return urlunsplit((parsed.scheme, parsed.netloc.rsplit("@", 1)[-1], parsed.path, "", ""))


def _validate_package(path: Path) -> None:
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError("migration package contents are invalid")

        manifest = json.loads(archive.read("manifest.json"))
        artifacts = [artifact for page in manifest["pages"] for artifact in page["artifacts"].values()]
        artifacts.extend(manifest["reports"].values())
        if set(names) != {"manifest.json", *(artifact["path"] for artifact in artifacts)}:
            raise ValueError("migration package contents are invalid")
        for artifact in artifacts:
            content = archive.read(artifact["path"])
            if _sha256(content) != artifact["sha256"]:
                raise ValueError(f"migration package artifact mismatch: {artifact['path']}")


def publish_single_page_package(*, output_dir: str | Path, page: dict[str, Any]) -> Path:
    """Atomically publish the ticket-01 package for one already-converted page."""
    page_id = str(page["id"])
    if not _PAGE_ID.fullmatch(page_id):
        raise ValueError("page id must contain only letters, digits, underscores, or hyphens")

    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=True)
    destination = destination.resolve()
    final_path = destination / f"confluence-migration-{page_id}.zip"

    storage, storage_bytes = _artifact(f"pages/{page_id}/storage.xml", str(page["storage"]))
    rendered, rendered_bytes = _artifact(f"pages/{page_id}/rendered.html", str(page["html"]))
    markdown, markdown_bytes = _artifact(f"pages/{page_id}/content.md", str(page["markdown"]))
    batch_id = _sha256(
        "\0".join((page_id, str(page["version"]), storage["sha256"], rendered["sha256"], markdown["sha256"])).encode()
    )
    manifest = {
        "schemaVersion": 1,
        "batchId": batch_id,
        "pages": [
            {
                "id": page_id,
                "title": str(page["title"]),
                "source": {
                    "path": list(page["source_path"]),
                    "url": _public_url(str(page["source_url"])),
                    "version": page["version"],
                },
                "artifacts": {"storage": storage, "renderedHtml": rendered, "markdown": markdown},
                "conversion": {"status": "success", "warnings": []},
            }
        ],
    }
    report = {"status": "success", "blockingErrors": [], "warnings": [], "counts": {"pages": 1}}
    report_markdown = "# Confluence migration export report\n\nStatus: success\n\n- Pages: 1\n- Blocking errors: 0\n- Warnings: 0\n"
    report_json, report_json_bytes = _artifact("report.json", json.dumps(report, indent=2, sort_keys=True) + "\n")
    report_md, report_md_bytes = _artifact("report.md", report_markdown)
    manifest["reports"] = {"machineReadable": report_json, "humanReadable": report_md}
    files = {
        "manifest.json": json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True).encode() + b"\n",
        storage["path"]: storage_bytes,
        rendered["path"]: rendered_bytes,
        markdown["path"]: markdown_bytes,
        report_json["path"]: report_json_bytes,
        report_md["path"]: report_md_bytes,
    }

    with tempfile.TemporaryDirectory(dir=destination, prefix=".confluence-migration-") as temporary:
        temporary_path = Path(temporary)
        archive_path = temporary_path / final_path.name
        with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for path, content in sorted(files.items()):
                archive.writestr(path, content)

        _validate_package(archive_path)

        temporary_final = temporary_path / f".{final_path.name}.{uuid.uuid4().hex}.tmp"
        os.replace(archive_path, temporary_final)
        os.replace(temporary_final, final_path)

    return final_path


def publish_flat_migration_package(
    *, output_dir: str | Path, pages: list[dict[str, Any],], flatten: bool
) -> Path:
    """Publish a v2 package that Outline imports into one-level Folder(s)."""
    if not pages:
        raise ValueError("migration package requires at least one page")

    page_ids = [str(page["id"]) for page in pages]
    if len(page_ids) != len(set(page_ids)) or any(
        not _PAGE_ID.fullmatch(page_id) for page_id in page_ids
    ):
        raise ValueError("page ids must be unique and contain only letters, digits, underscores, or hyphens")

    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=True)
    destination = destination.resolve()
    final_path = destination / f"confluence-migration-{page_ids[0]}-{len(pages)}.zip"

    source_paths = [list(page["source_path"]) for page in pages]
    common_path: list[str] = []
    for names in zip(*source_paths):
        if len(set(names)) != 1:
            break
        common_path.append(names[0])
    default_folder = common_path[-1] if common_path else str(pages[0]["title"])

    folder_by_page_id: dict[str, str] = {}
    for page, source_path in zip(pages, source_paths):
        relative_path = source_path[len(common_path) :]
        folder_by_page_id[str(page["id"])] = (
            default_folder if flatten or not relative_path else relative_path[0]
        )

    duplicate_titles = {
        (folder_by_page_id[str(page["id"])], str(page["title"]))
        for page in pages
        if sum(
            folder_by_page_id[str(other["id"])] == folder_by_page_id[str(page["id"])]
            and str(other["title"]) == str(page["title"])
            for other in pages
        ) > 1
    }

    files: dict[str, bytes] = {}
    manifest_pages = []
    batch_parts = ["2", str(flatten)]
    for page, source_path in zip(pages, source_paths):
        page_id = str(page["id"])
        storage, storage_bytes = _artifact(f"pages/{page_id}/storage.xml", str(page["storage"]))
        rendered, rendered_bytes = _artifact(f"pages/{page_id}/rendered.html", str(page["html"]))
        markdown, markdown_bytes = _artifact(f"pages/{page_id}/content.md", str(page["markdown"]))
        folder_name = folder_by_page_id[page_id]
        title = str(page["title"])
        if (folder_name, title) in duplicate_titles:
            title = f"{' / '.join(source_path)} [{page_id}]"
        manifest_pages.append(
            {
                "id": page_id,
                "title": title,
                "targetFolder": folder_name,
                "source": {
                    "path": source_path,
                    "url": _public_url(str(page["source_url"])),
                    "version": page["version"],
                },
                "artifacts": {"storage": storage, "renderedHtml": rendered, "markdown": markdown},
                "conversion": {"status": "success", "warnings": []},
            }
        )
        files.update(
            {
                storage["path"]: storage_bytes,
                rendered["path"]: rendered_bytes,
                markdown["path"]: markdown_bytes,
            }
        )
        batch_parts.extend((page_id, str(page["version"]), storage["sha256"], rendered["sha256"], markdown["sha256"]))

    batch_id = _sha256("\0".join(batch_parts).encode())
    report = {
        "status": "success",
        "blockingErrors": [],
        "warnings": [],
        "counts": {"pages": len(pages)},
    }
    report_json, report_json_bytes = _artifact("report.json", json.dumps(report, indent=2, sort_keys=True) + "\n")
    report_md, report_md_bytes = _artifact(
        "report.md",
        f"# Confluence migration export report\n\nStatus: success\n\n- Pages: {len(pages)}\n- Flattened: {'yes' if flatten else 'no'}\n",
    )
    manifest = {
        "schemaVersion": 2,
        "batchId": batch_id,
        "pages": manifest_pages,
        "reports": {"machineReadable": report_json, "humanReadable": report_md},
    }
    files.update(
        {
            "manifest.json": json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True).encode() + b"\n",
            report_json["path"]: report_json_bytes,
            report_md["path"]: report_md_bytes,
        }
    )

    with tempfile.TemporaryDirectory(dir=destination, prefix=".confluence-migration-") as temporary:
        archive_path = Path(temporary) / final_path.name
        with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for path, content in sorted(files.items()):
                archive.writestr(path, content)
        _validate_package(archive_path)
        os.replace(archive_path, final_path)

    return final_path
