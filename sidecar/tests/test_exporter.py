import hashlib
import json
import zipfile
from pathlib import Path

from confluence_export_sidecar.exporter import build_attachment_manifest, build_exported_page
from confluence_export_sidecar.migration_package import publish_single_page_package


def test_attachment_manifest_uses_obsidian_relative_paths():
    manifest = build_attachment_manifest("Home", [{"filename": "diagram.png", "content": b"abc"}])

    assert manifest[0]["filename"] == "diagram.png"
    assert manifest[0]["relativePath"] == "attachments/diagram.png"
    assert manifest[0]["contentBase64"] == "YWJj"


def test_html_export_uses_html_filename():
    page = build_exported_page(
        page_id="123",
        title="Home",
        content="<h1>Home</h1>",
        format="html",
        attachments=[],
    )

    assert page["filename"] == "Home.html"
    assert page["html"] == "<h1>Home</h1>"


def test_single_page_package_is_self_describing_and_id_scoped(tmp_path):
    package = publish_single_page_package(
        output_dir=tmp_path,
        page={
            "id": "42",
            "title": "../CON\\\x00迁移页面",
            "source_path": ["Root", "../CON\\\x00迁移页面"],
            "source_url": "https://operator:secret@wiki.example.test/pages/42?token=secret#session-token",
            "version": 7,
            "storage": "<p>Source</p>",
            "html": "<p>Rendered</p>",
            "markdown": "Rendered\n",
        },
    )

    assert package.name == "confluence-migration-42.zip"
    with zipfile.ZipFile(package) as archive:
        assert archive.namelist() == [
            "manifest.json",
            "pages/42/content.md",
            "pages/42/rendered.html",
            "pages/42/storage.xml",
            "report.json",
            "report.md",
        ]
        manifest = json.loads(archive.read("manifest.json"))
        report = json.loads(archive.read("report.json"))

    page = manifest["pages"][0]
    assert manifest["schemaVersion"] == 1
    assert manifest["batchId"]
    assert page["id"] == "42"
    assert page["title"] == "../CON\\\x00迁移页面"
    assert page["source"] == {"path": ["Root", "../CON\\\x00迁移页面"], "url": "https://wiki.example.test/pages/42", "version": 7}
    assert page["artifacts"]["markdown"]["path"] == "pages/42/content.md"
    for artifact in page["artifacts"].values():
        with zipfile.ZipFile(package) as archive:
            assert artifact["sha256"] == hashlib.sha256(archive.read(artifact["path"])).hexdigest()
    for artifact in manifest["reports"].values():
        with zipfile.ZipFile(package) as archive:
            assert artifact["sha256"] == hashlib.sha256(archive.read(artifact["path"])).hexdigest()
    assert report == {"status": "success", "blockingErrors": [], "warnings": [], "counts": {"pages": 1}}


def test_invalid_page_identity_does_not_publish_a_zip(tmp_path):
    try:
        publish_single_page_package(
            output_dir=tmp_path,
            page={
                "id": "../42",
                "title": "Home",
                "source_path": ["Home"],
                "source_url": "https://wiki.example.test/pages/42",
                "version": 1,
                "storage": "source",
                "html": "rendered",
                "markdown": "content",
            },
        )
    except ValueError:
        pass
    else:
        raise AssertionError("invalid page identity must fail")

    assert not list(tmp_path.glob("*.zip"))


def test_contract_fixture_has_the_required_single_page_shape():
    fixture = Path(__file__).parent / "fixtures/single-page-migration-package.zip"
    with zipfile.ZipFile(fixture) as archive:
        manifest = json.loads(archive.read("manifest.json"))

    assert manifest["schemaVersion"] == 1
    page = manifest["pages"][0]
    assert {"id", "title", "source", "artifacts", "conversion"} <= page.keys()
    assert {"storage", "renderedHtml", "markdown"} <= page["artifacts"].keys()
    assert {"machineReadable", "humanReadable"} <= manifest["reports"].keys()
    for artifact in [*page["artifacts"].values(), *manifest["reports"].values()]:
        with zipfile.ZipFile(fixture) as archive:
            content = archive.read(artifact["path"])
        assert artifact["sha256"] == hashlib.sha256(content).hexdigest()
