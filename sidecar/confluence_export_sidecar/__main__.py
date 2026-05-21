"""stdin/stdout JSON-lines entrypoint."""

from __future__ import annotations

import json
import sys

from confluence_export_sidecar.protocol import ProtocolError, parse_request, success_response


def _dispatch(req: dict) -> dict:
    if req["type"] == "ping":
        return success_response(req["request_id"], {"status": "ok"})
    return {
        "protocol_version": 1,
        "request_id": req["request_id"],
        "ok": False,
        "payload": {},
        "error": f"unsupported type {req['type']!r}",
    }


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
            resp = {
                "protocol_version": 1,
                "request_id": req_id or "",
                "ok": False,
                "payload": {},
                "error": str(exc),
            }
        sys.stdout.write(json.dumps(resp, separators=(",", ":")) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
