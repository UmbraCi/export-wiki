"""stdin/stdout JSON-lines entrypoint."""

from __future__ import annotations

import json
import sys

from confluence_export_sidecar.confluence_client import ConfluenceClient
from confluence_export_sidecar.exporter import export_pages as run_export_pages
from confluence_export_sidecar.log import get_logger
from confluence_export_sidecar.protocol import ProtocolError, parse_request, success_response

log = get_logger(__name__)


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

    if req_type in {"get_spaces", "get_page_tree", "get_current_user", "search_pages"}:
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
            if req_type == "search_pages":
                query = payload.get("query")
                if not query:
                    return _error_response(request_id, "query is required")
                return success_response(
                    request_id,
                    {"results": client.search_pages(str(query))},
                )
            return success_response(request_id, {"user": client.fetch_current_user()})
        except Exception as exc:  # noqa: BLE001
            return _error_response(request_id, str(exc))

    if req_type == "export_pages":
        auth = payload.get("auth")
        if not auth:
            return _error_response(request_id, "auth payload is required")

        page_ids = payload.get("page_ids") or []
        if not page_ids:
            return _error_response(request_id, "page_ids is required")

        export_format = str(payload.get("format") or "markdown")
        if export_format not in {"markdown", "html"}:
            return _error_response(request_id, f"unsupported export format {export_format!r}")

        include_attachments = bool(payload.get("include_attachments", True))
        try:
            pages = run_export_pages(
                auth,
                [str(page_id) for page_id in page_ids],
                include_attachments,
                export_format,
            )
            return success_response(request_id, {"pages": pages})
        except Exception as exc:  # noqa: BLE001
            return _error_response(request_id, str(exc))

    return _error_response(request_id, f"unsupported type {req_type!r}")


def main() -> None:
    log.info("sidecar started")
    for raw in sys.stdin:
        stripped = raw.strip()
        if not stripped:
            continue
        req_id = ""
        try:
            req = parse_request(stripped)
            req_id = str(req["request_id"])
            log.debug("request id=%s type=%s", req_id, req.get("type"))
            resp = _dispatch(req)
        except ProtocolError as exc:
            log.warning("protocol error id=%s: %s", req_id, exc)
            resp = _error_response(req_id or "", str(exc))
        if not resp.get("ok"):
            log.error("error response id=%s: %s", req_id, resp.get("error"))
        sys.stdout.write(json.dumps(resp, separators=(",", ":")) + "\n")
        sys.stdout.flush()
    log.info("sidecar exiting")


if __name__ == "__main__":
    main()
