"""Plain Markdown ZIPs for Outline's hierarchical Markdown importer."""

from __future__ import annotations

import os
import posixpath
import re
import tempfile
import zipfile
from itertools import accumulate
from pathlib import Path
from typing import Any
from urllib.parse import quote, unquote, urlsplit

import yaml
from markdown_it import MarkdownIt


def _name(value: str) -> str:
    value = re.sub(r'[<>:"/\\|?*\x00-\x1f\x7f]', "_", value).strip(" .")
    value = value.encode("utf-8")[:180].decode("utf-8", errors="ignore")
    if not value or value.casefold() in {"attachments", "__macosx", "con", "prn", "aux", "nul"} or re.fullmatch(r"(?i)(com|lpt)[1-9]", value):
        value = f"_{value or 'Untitled'}"
    return value


def _with_title(markdown: str, title: str) -> str:
    # Preserve page properties while making the Confluence title authoritative.
    metadata: dict[str, Any] = {}
    if markdown.startswith("---\n"):
        end = markdown.find("\n---\n", 4)
        if end >= 0:
            loaded = yaml.safe_load(markdown[4:end])
            if isinstance(loaded, dict):
                metadata = loaded
                markdown = markdown[end + 5:]
    metadata["title"] = title
    return "---\n" + yaml.safe_dump(metadata, allow_unicode=True, sort_keys=False) + "---\n\n" + markdown


def publish_markdown_package(*, output_dir: str | Path, pages: list[dict[str, Any]]) -> Path:
    if not pages or len({str(page['id']) for page in pages}) != len(pages):
        raise ValueError("migration package requires unique pages")
    if any(not re.fullmatch(r"[A-Za-z0-9_-]+", str(page["id"])) for page in pages):
        raise ValueError("invalid page id")

    nodes: dict[tuple[str, ...], str] = {}
    used: dict[tuple[str, ...], set[str]] = {}
    paths: dict[str, str] = {}
    titles: dict[str, str] = {}
    for page in pages:
        source = page["source_path"] or [page["title"]]
        identities = page.get("source_ids", source)
        if len(identities) != len(source):
            raise ValueError("source identities must match source path")
        parts = []
        for index, title in enumerate(source):
            key = tuple(str(identity) for identity in identities[:index + 1])
            parent = key[:-1]
            if key not in nodes:
                candidate = _name(str(title))
                taken = used.setdefault(parent, set())
                if candidate.casefold() in taken:
                    candidate += f" [{_name(str(identities[index]))}]"
                while candidate.casefold() in taken:
                    candidate += "_"
                nodes[key] = candidate
                taken.add(candidate.casefold())
            parts.append(nodes[key])
        page_id = str(page["id"])
        paths[page_id] = "/".join(parts) + ".md"
        titles[page_id] = parts[-1]

    files: dict[str, bytes] = {}
    links = {f"{key}.md": value for key, value in paths.items()}
    attachment_names: set[str] = set()
    for page in pages:
        document_path = paths[str(page["id"])]
        parent = posixpath.dirname(document_path)

        for attachment in page.get("attachments", []):
            old_path = attachment["path"]
            if old_path in links:
                if files[links[old_path]] != attachment["content"]:
                    raise ValueError(f"duplicate attachment path: {old_path}")
                continue
            filename = _name(attachment.get("title") or Path(old_path).name)
            if filename.casefold() in attachment_names:
                filename = f"{Path(filename).stem} [{Path(old_path).stem}]{Path(filename).suffix}"
            while filename.casefold() in attachment_names:
                filename = "_" + filename
            attachment_names.add(filename.casefold())
            target = posixpath.join(document_path.split("/")[0], "attachments", filename) if parent else f"attachments/{filename}"
            content = attachment["content"]
            if target in files and files[target] != content:
                raise ValueError(f"duplicate attachment path: {target}")
            files[target] = content
            links[old_path] = target

    for page in pages:
        page_id = str(page["id"])
        document_path = paths[page_id]
        parent = posixpath.dirname(document_path)

        offsets = [0, *accumulate(len(line) for line in page["markdown"].splitlines(keepends=True))]
        code_ranges = [(offsets[token.map[0]], offsets[token.map[1]])
                       for token in MarkdownIt("commonmark").parse(page["markdown"])
                       if token.type in {"fence", "code_block"} and token.map]

        def rewrite(match: re.Match[str]) -> str:
            if match.group("code") or any(start <= match.start() < end for start, end in code_ranges):
                return match.group(0)
            href = match.group("href")
            parsed = urlsplit(unquote(href.strip("<>")))
            target = links.get(parsed.path) if not parsed.scheme and not parsed.netloc else None
            if target:
                href = quote(posixpath.relpath(target, parent or "."), safe="/._-~")
                if parsed.fragment:
                    href += "#" + quote(parsed.fragment)
            elif not parsed.scheme and not parsed.netloc and re.fullmatch(r"[0-9]+\.md", parsed.path):
                href = page["base_url"] + "/pages/viewpage.action?pageId=" + parsed.path[:-3]
                if parsed.fragment:
                    href += "#" + quote(parsed.fragment)
            return match.group("prefix") + href

        markdown = re.sub(
            r"(?P<code>(?P<ticks>`+)[^`]*?(?P=ticks))"
            r"|(?P<prefix>\]\(|^ {0,3}\[[^\]\n]+\]:[ \t]*)(?P<href><?[^\s)>]+>?)",
            rewrite, page["markdown"], flags=re.MULTILINE,
        )
        files[document_path] = _with_title(markdown, titles[page_id]).encode("utf-8")

    destination = Path(output_dir).resolve()
    destination.mkdir(parents=True, exist_ok=True)
    final_path = destination / f"confluence-migration-{pages[0]['id']}-{len(pages)}.zip"
    with tempfile.TemporaryDirectory(dir=destination, prefix=".confluence-migration-") as temporary:
        archive_path = Path(temporary) / final_path.name
        with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for path, content in sorted(files.items()):
                archive.writestr(path, content)
        with zipfile.ZipFile(archive_path) as archive:
            if archive.testzip() is not None:
                raise ValueError("migration package contents are invalid")
        os.replace(archive_path, final_path)
    return final_path
