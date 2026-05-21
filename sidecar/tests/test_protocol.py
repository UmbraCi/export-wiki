import json

import pytest

from confluence_export_sidecar.protocol import ProtocolError, parse_request, success_response


def test_parse_request_requires_protocol_version():
    with pytest.raises(ProtocolError, match="protocol_version"):
        parse_request(json.dumps({"request_id": "r1", "type": "get_spaces"}))


def test_success_response_keeps_request_id():
    response = success_response("r1", {"spaces": []})

    assert response == {
        "protocol_version": 1,
        "request_id": "r1",
        "ok": True,
        "payload": {"spaces": []},
    }
