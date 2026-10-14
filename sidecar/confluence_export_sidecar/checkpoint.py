"""Private, atomic checkpoints for unfinished exports; credentials never go to disk here."""

import hashlib
import json
import os
from pathlib import Path
from typing import Any


def write_json(path: Path, value: Any) -> None:
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
    temporary.replace(path)


class ExportCheckpoint:
    def __init__(self, output_dir: str, auth: dict, page_ids: list[str], format: str,
                 include_attachments: bool):
        if not page_ids or any(not str(id).isdecimal() for id in page_ids):
            raise ValueError("export requires numeric page ids")
        if len(set(page_ids)) != len(page_ids):
            raise ValueError("export requires unique page ids")
        identity = [auth.get("base_url"), auth.get("method"), auth.get("username"),
                    auth.get("cookie") or auth.get("api_token"), page_ids, format, include_attachments]
        key = hashlib.sha256(json.dumps(identity).encode()).hexdigest()
        self.root = Path(output_dir).resolve() / ".export-wiki-resume" / key
        self.downloads = self.root / "attachments"
        self.selection = {"page_ids": page_ids, "format": format,
                          "include_attachments": include_attachments}

    def __enter__(self):
        self.root.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.root.parent.chmod(0o700)
        self.lock = (self.root.parent / f"{self.root.name}.lock").open("a+b")
        try:
            if os.name == "nt":
                import msvcrt
                self.lock.seek(0)
                self.lock.write(b"0")
                self.lock.flush()
                self.lock.seek(0)
                msvcrt.locking(self.lock.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            self.lock.close()
            raise ValueError("This export is already running; wait for it to stop before resuming") from exc
        try:
            self.root.mkdir(exist_ok=True, mode=0o700)
            self.downloads.mkdir(exist_ok=True, mode=0o700)
            write_json(self.root / "selection.json", self.selection)
        except Exception:
            self.lock.close()
            raise
        return self

    def __exit__(self, *args):
        self.lock.close()

    def load_page(self, page_id: str) -> dict | None:
        path = self.root / f"{page_id}.json"
        if not path.exists():
            return None
        page = json.loads(path.read_text(encoding="utf-8"))
        for attachment in page.get("attachments", []):
            if "checkpoint_file" in attachment:
                file = self.downloads / attachment.pop("checkpoint_file")
                if not file.is_file():
                    return None
                attachment["content"] = file.read_bytes()
        return page

    def save_page(self, page_id: str, page: dict) -> None:
        saved = dict(page)
        saved["attachments"] = []
        for index, attachment in enumerate(page.get("attachments", [])):
            item = dict(attachment)
            if "content" in item:
                name = f"page-{page_id}-{index}.bin"
                temporary = self.downloads / f"{name}.tmp"
                temporary.write_bytes(item.pop("content"))
                temporary.replace(self.downloads / name)
                item["checkpoint_file"] = name
            saved["attachments"].append(item)
        write_json(self.root / f"{page_id}.json", saved)
