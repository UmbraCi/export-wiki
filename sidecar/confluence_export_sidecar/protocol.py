"""JSON-RPC-style request validation for the sidecar stdin/stdout protocol."""

from __future__ import annotations

import json
from typing import Any


class ProtocolError(Exception):
    """Raised when a request line violates the negotiated protocol."""

    pass


def parse_request(raw: str) -> dict[str, Any]:
    """Parse one JSON request line (dict) enforcing protocol headers."""
    stripped = raw.strip()
    try:
        data = json.loads(stripped)
    except json.JSONDecodeError as exc:
        raise ProtocolError("invalid_json") from exc

    if not isinstance(data, dict):
        raise ProtocolError("request_must_be_object")

    if data.get("protocol_version") != 1:
        raise ProtocolError("protocol_version")

    if not data.get("request_id"):
        raise ProtocolError("request_id")

    if not data.get("type"):
        raise ProtocolError("type")

    return data


def success_response(request_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Successful response envelope consumed by the Rust IPC client."""
    return {
        "protocol_version": 1,
        "request_id": request_id,
        "ok": True,
        "payload": payload,
    }
