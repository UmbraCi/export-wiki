import json
import logging
import sys
from pathlib import Path
import pytest

from confluence_export_sidecar.log import JsonLogFormatter, SafeFileFormatter, set_log_secrets, get_log_dir


@pytest.mark.parametrize("platform,variable,relative", [
    ("darwin", None, "Library/Application Support/com.exportwiki.app/logs"),
    ("win32", "APPDATA", "app-data/com.exportwiki.app/logs"),
    ("linux", "XDG_DATA_HOME", "app-data/com.exportwiki.app/logs"),
])
def test_log_directory_uses_app_data_instead_of_source_or_executable(monkeypatch, tmp_path, platform, variable, relative):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    monkeypatch.setattr(sys, "platform", platform)
    if variable:
        monkeypatch.setenv(variable, str(tmp_path / "app-data"))
    assert get_log_dir() == tmp_path / relative


def test_linux_log_directory_ignores_relative_xdg_path(monkeypatch, tmp_path):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    monkeypatch.setattr(sys, "platform", "linux")
    monkeypatch.setenv("XDG_DATA_HOME", "logs")
    assert get_log_dir() == tmp_path / ".local/share/com.exportwiki.app/logs"


def test_streams_structured_levels_and_redacts_credentials_and_traceback():
    set_log_secrets({"api_token": "private-api-value", "cookie": "SID=private-session; X=other-session"})
    try:
        raise ValueError("private-session private-api-value")
    except ValueError:
        import sys
        record = logging.LogRecord("cme-sidecar.export", logging.ERROR, "", 1,
                                  "failed SID=%s", ("private-session",), sys.exc_info())
    streamed = json.loads(JsonLogFormatter().format(record))
    assert streamed["level"] == "error"
    assert streamed["source"] == "cme-sidecar.export"
    assert "Traceback" in streamed["message"]
    for formatter in (JsonLogFormatter(), SafeFileFormatter()):
        output = formatter.format(record)
        assert "private-session" not in output
        assert "private-api-value" not in output
        assert "[redacted]" in output
    set_log_secrets({})


def test_hides_headers_even_without_known_credentials():
    set_log_secrets({})
    record = logging.LogRecord("cme-sidecar.export", logging.WARNING, "", 1,
                              "HTTP 401\nSet-Cookie: SID=new-private-session\nAuthorization: Bearer private-auth", (), None)
    streamed = json.loads(JsonLogFormatter().format(record))
    assert streamed["level"] == "warn"
    assert "HTTP 401" in streamed["message"]
    assert "new-private-session" not in streamed["message"]
    assert "private-auth" not in streamed["message"]


def test_http_diagnostics_include_status_and_duration_without_query_credentials(caplog):
    from datetime import timedelta
    from types import SimpleNamespace
    from confluence_export_sidecar.exporter import _log_response
    response = SimpleNamespace(ok=False, request=SimpleNamespace(method="GET"),
                               url="https://wiki.example.com/rest/api/content/1?token=private-query",
                               status_code=403, elapsed=timedelta(milliseconds=120))
    logger = logging.getLogger("cme-sidecar.confluence_export_sidecar.exporter")
    logger.addHandler(caplog.handler)
    try:
        assert _log_response(response) is response
        assert "403 (120 ms)" in caplog.text
        assert "/rest/api/content/1" in caplog.text
        assert "private-query" not in caplog.text
    finally:
        logger.removeHandler(caplog.handler)
