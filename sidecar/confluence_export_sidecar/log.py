"""File-based logging for the sidecar (stdout is reserved for IPC)."""

from __future__ import annotations

import json
import logging
from logging.handlers import RotatingFileHandler
from datetime import datetime, timezone
import sys
import os
import re
from pathlib import Path

def get_log_dir() -> Path:
    """Use the platform's application data directory, independent of the executable."""
    home = Path.home()
    if sys.platform == "darwin":
        root = home / "Library" / "Application Support"
    elif sys.platform == "win32":
        root = Path(os.environ.get("APPDATA") or home / "AppData" / "Roaming")
    else:
        root = Path(os.environ.get("XDG_DATA_HOME") or home / ".local" / "share")
        if not root.is_absolute():
            root = home / ".local" / "share"
    return root / "com.exportwiki.app" / "logs"


_LOG_DIR = get_log_dir()
_LOG_FILE = _LOG_DIR / "sidecar.log"

_configured = False
_secrets: list[str] = []


def set_log_secrets(auth: dict) -> None:
    global _secrets
    _secrets = [str(auth[key]) for key in ("api_token", "cookie") if auth.get(key)]
    for part in str(auth.get("cookie") or "").split(";"):
        if "=" in part:
            value = part.split("=", 1)[1].strip()
            if value:
                _secrets.append(value)


def redact_log_message(message: str) -> str:
    for secret in sorted(_secrets, key=len, reverse=True):
        message = message.replace(secret, "[redacted]")
    return re.sub(
        r"(?i)(authorization|cookie|set-cookie|api_token|access_token|password|secret)(['\"]?\s*[:=]\s*)([^\r\n]+)",
        r"\1\2[redacted]", message,
    )


class SafeFileFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        return redact_log_message(super().format(record))


class JsonLogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        message = record.getMessage()
        if record.exc_info:
            message += "\n" + self.formatException(record.exc_info)
        return json.dumps({
            "timestamp": datetime.fromtimestamp(record.created, timezone.utc).isoformat(),
            "level": {"WARNING": "warn", "CRITICAL": "error"}.get(record.levelname, record.levelname.lower()),
            "source": record.name,
            "message": redact_log_message(message),
        }, ensure_ascii=False)


def get_logger(name: str) -> logging.Logger:
    """Return a logger that streams diagnostics and writes to the app's logs directory."""
    global _configured  # noqa: PLW0603
    if not _configured:
        root = logging.getLogger("cme-sidecar")
        root.setLevel(logging.DEBUG)
        root.propagate = False
        stream = logging.StreamHandler(sys.stderr)
        stream.setFormatter(JsonLogFormatter())
        root.addHandler(stream)
        # Keep streaming diagnostics if the user's data directory is unavailable.
        try:
            _LOG_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
            handler = RotatingFileHandler(_LOG_FILE, maxBytes=2_000_000, backupCount=2, encoding="utf-8")
            handler.setFormatter(SafeFileFormatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
            root.addHandler(handler)
        except OSError:
            root.warning("File logging unavailable; diagnostics are streamed to the app")
        exporter = logging.getLogger("confluence_markdown_exporter")
        exporter.setLevel(logging.DEBUG)
        exporter.propagate = False
        for handler in root.handlers:
            exporter.addHandler(handler)
        _configured = True
    return logging.getLogger(f"cme-sidecar.{name}")
