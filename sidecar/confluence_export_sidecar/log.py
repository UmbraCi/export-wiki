"""File-based logging for the sidecar (stdout is reserved for IPC)."""

from __future__ import annotations

import logging
import sys
from pathlib import Path

_LOG_DIR = Path(__file__).resolve().parent.parent.parent / "logs"
_LOG_FILE = _LOG_DIR / "sidecar.log"

_configured = False


def get_logger(name: str) -> logging.Logger:
    """Return a logger that writes to ``logs/sidecar.log``."""
    global _configured  # noqa: PLW0603
    if not _configured:
        _LOG_DIR.mkdir(parents=True, exist_ok=True)
        handler = logging.FileHandler(_LOG_FILE, encoding="utf-8")
        handler.setFormatter(
            logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
        )
        root = logging.getLogger("cme-sidecar")
        root.setLevel(logging.DEBUG)
        root.addHandler(handler)
        _configured = True
    return logging.getLogger(f"cme-sidecar.{name}")
