"""stdin/stdout JSON-lines entrypoint."""

from __future__ import annotations

import json
import sys

from confluence_export_sidecar.confluence_client import ConfluenceClient
from confluence_export_sidecar.protocol import ProtocolError, parse_request, success_response


def _error_response(request_id: str, message: str) -> dict:
    return {
        "protocol_version": 1,
        "request_id": request_id,
        "ok": False,
        "payload": {},
        "error": message,
    }


def _dispatch(req: dict) -> dict:
    req_type = req["type"]
    request_id = str(req["request_id"])
    payload = req.get("payload") or {}

    if req_type == "ping":
        return success_response(request_id, {"status": "ok"})

    if req_type in {"get_spaces", "get_page_tree", "get_current_user"}:
        auth = payload.get("auth")
        if not auth:
            return _error_response(request_id, "auth payload is required")

        try:
            client = ConfluenceClient(auth)
            if req_type == "get_spaces":
                return success_response(request_id, {"spaces": client.fetch_spaces()})
            if req_type == "get_page_tree":
                space_key = payload.get("space_key")
                if not space_key:
                    return _error_response(request_id, "space_key is required")
                return success_response(
                    request_id,
                    {"pages": client.fetch_page_tree(str(space_key))},
                )
            return success_response(request_id, {"user": client.fetch_current_user()})
        except Exception as exc:  # noqa: BLE001
            return _error_response(request_id, str(exc))

    return _error_response(request_id, f"unsupported type {req_type!r}")


def main() -> None:
    for raw in sys.stdin:
        stripped = raw.strip()
        if not stripped:
            continue
        req_id = ""
        try:
            req = parse_request(stripped)
            req_id = str(req["request_id"])
            resp = _dispatch(req)
        except ProtocolError as exc:
            resp = _error_response(req_id or "", str(exc))
        sys.stdout.write(json.dumps(resp, separators=(",", ":")) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
