import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace
from unittest.mock import patch

import pytest
import requests

from confluence_export_sidecar.attachment_download import download_attachment


@pytest.fixture
def server():
    state = SimpleNamespace(body=b"abcdef01" * 65536, requests=[], interruptions=0,
                            ignore_range=False, changed=False, invalid_range=False,
                            status=200, validator=True)

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            state.requests.append(dict(self.headers))
            offset = int(self.headers.get("Range", "bytes=0-")[6:-1])
            if state.ignore_range or state.changed:
                offset = 0
            body = state.body[offset:]
            self.send_response(206 if offset else state.status)
            self.send_header("Content-Length", str(len(body)))
            if state.validator:
                self.send_header("ETag", '"new"' if state.changed else '"original"')
            if offset:
                start = offset + 1 if state.invalid_range else offset
                self.send_header("Content-Range", f"bytes {start}-{len(state.body)-1}/{len(state.body)}")
            self.end_headers()
            if state.interruptions:
                state.interruptions -= 1
                body = body[:65536]
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass
            self.close_connection = True

        def log_message(self, *args):
            pass

    httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    with requests.Session() as session:
        client = SimpleNamespace(session=session, url=f"http://127.0.0.1:{httpd.server_port}",
                                 verify_ssl=True, proxies=None, cert=None)
        with patch("confluence_export_sidecar.attachment_download.sleep"):
            yield state, client
    httpd.shutdown()
    httpd.server_close()
    thread.join()


attachment = SimpleNamespace(id="99", download_link="/video.mp4", version=SimpleNamespace(number=1))


def test_real_http_interruption_resumes_saved_bytes(server, tmp_path):
    state, client = server
    state.interruptions = 1
    assert download_attachment(client, attachment, tmp_path) == state.body
    assert state.requests[1]["Range"] == "bytes=65536-"
    assert state.requests[1]["If-Range"] == '"original"'
    # A completed attachment is reused without another HTTP request.
    assert download_attachment(client, attachment, tmp_path) == state.body
    assert len(state.requests) == 2


@pytest.mark.parametrize("scenario", ["ignore_range", "changed", "invalid_range", "no_validator"])
def test_resume_never_appends_incompatible_content(server, tmp_path, scenario):
    state, client = server
    state.interruptions = 3
    if scenario == "no_validator":
        state.validator = False
    with pytest.raises(requests.RequestException):
        download_attachment(client, attachment, tmp_path)
    if scenario != "no_validator":
        setattr(state, scenario, True)
    if scenario == "changed":
        state.body = b"new body" * 65536
    assert download_attachment(client, attachment, tmp_path) == state.body
    assert len(list(tmp_path.glob("*.bin"))) == 1


def test_exhausted_retries_preserve_partial_for_next_run(server, tmp_path):
    state, client = server
    state.interruptions = 3
    with pytest.raises(requests.RequestException):
        download_attachment(client, attachment, tmp_path)
    assert len(state.requests) == 3
    assert next(tmp_path.glob("*.part")).stat().st_size == 3 * 65536
    assert download_attachment(client, attachment, tmp_path) == state.body
    assert state.requests[3]["Range"] == f"bytes={3 * 65536}-"


def test_permission_denied_does_not_retry(server, tmp_path):
    state, client = server
    state.status = 403
    with pytest.raises(requests.HTTPError):
        download_attachment(client, attachment, tmp_path)
    assert len(state.requests) == 1
    assert not list(tmp_path.glob("*.bin"))
