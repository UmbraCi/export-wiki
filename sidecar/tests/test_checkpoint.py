import pytest

from confluence_export_sidecar.checkpoint import ExportCheckpoint
from confluence_export_sidecar.exporter import export_pages
from unittest.mock import patch


def test_same_export_cannot_write_concurrently_and_lock_is_released(tmp_path):
    first = ExportCheckpoint(str(tmp_path), {}, ["1"], "markdown", True)
    second = ExportCheckpoint(str(tmp_path), {}, ["1"], "markdown", True)
    with first:
        with pytest.raises(ValueError, match="already running"):
            with second:
                pytest.fail("concurrent export acquired checkpoint")
    with second:
        assert (second.root / "selection.json").is_file()


@pytest.mark.parametrize("format", ["markdown", "html"])
def test_regular_exports_reuse_finished_pages_after_failure(tmp_path, format):
    page = {"pageId": "1", "title": "First", "filename": "First.md", "attachments": []}
    with patch("confluence_export_sidecar.exporter.export_page", side_effect=[page, ConnectionError("offline")]):
        with pytest.raises(ConnectionError):
            export_pages({}, ["1", "2"], True, format, str(tmp_path))
    with patch("confluence_export_sidecar.exporter.export_page", return_value={**page, "pageId": "2"}) as fetch:
        assert len(export_pages({}, ["1", "2"], True, format, str(tmp_path))) == 2
    assert fetch.call_count == 1
    assert fetch.call_args.args[0] == "2"
