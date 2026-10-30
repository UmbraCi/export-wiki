import zipfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from urllib.parse import unquote

import pytest
import yaml

from confluence_export_sidecar.exporter import export_migration_package
from confluence_export_sidecar.migration_package import publish_markdown_package


def page(id, path, markdown="body", **kwargs):
    return {"id": str(id), "title": path[-1], "source_path": path,
            "base_url": "https://wiki.example.test/wiki", "markdown": markdown, **kwargs}


def test_plain_markdown_zip_hierarchy_utf8_titles_and_relative_links(tmp_path):
    package = publish_markdown_package(output_dir=tmp_path, pages=[
        page(1, ["产品文档", "使用指南"], "[常见问题](2.md)\n![截图](attachments/99.png)",
             attachments=[{"path": "attachments/99.png", "title": "screenshot.png", "content": b"image"}]),
        page(2, ["产品文档", "使用指南", "常见问题"], "[指南](1.md#安装)"),
        page(3, ["团队制度", "报销规则"]),
    ])
    with zipfile.ZipFile(package) as archive:
        assert set(archive.namelist()) == {
            "产品文档/使用指南.md", "产品文档/使用指南/常见问题.md",
            "产品文档/attachments/screenshot.png", "团队制度/报销规则.md",
        }
        assert all(info.flag_bits & 0x800 for info in archive.infolist())
        guide = unquote(archive.read("产品文档/使用指南.md").decode("utf-8"))
        faq = unquote(archive.read("产品文档/使用指南/常见问题.md").decode("utf-8"))
        assert "[常见问题](使用指南/常见问题.md)" in guide
        assert "![截图](attachments/screenshot.png)" in guide
        assert "[指南](../使用指南.md#安装)" in faq
        assert archive.read("产品文档/attachments/screenshot.png") == b"image"
        assert yaml.safe_load(guide.split("---")[1])["title"] == "使用指南"


def test_title_overrides_h1_and_keeps_yaml_properties(tmp_path):
    package = publish_markdown_package(output_dir=tmp_path, pages=[
        page(1, ["指南"], "---\ntitle: Wrong\ntags: [one]\n---\n# Other\n正文"),
    ])
    with zipfile.ZipFile(package) as archive:
        markdown = archive.read("指南.md").decode()
    assert yaml.safe_load(markdown.split("---")[1]) == {"title": "指南", "tags": ["one"]}
    assert "# Other\n正文" in markdown


def test_same_named_siblings_and_their_children_are_disambiguated(tmp_path):
    package = publish_markdown_package(output_dir=tmp_path, pages=[
        page(1, ["产品", "指南"], source_ids=["space", "1"]),
        page(2, ["产品", "指南"], source_ids=["space", "2"]),
        page(3, ["产品", "指南", "问题"], source_ids=["space", "2", "3"]),
    ])
    with zipfile.ZipFile(package) as archive:
        assert set(archive.namelist()) == {"产品/指南.md", "产品/指南 [2].md", "产品/指南 [2]/问题.md"}
        assert "title: 指南 [2]" in archive.read("产品/指南 [2].md").decode()


def test_names_cannot_escape_zip_or_be_hidden_or_attachment_folders(tmp_path):
    package = publish_markdown_package(output_dir=tmp_path, pages=[
        page(1, ["__MACOSX", ".hidden", "../恶意\\路径"]),
        page(2, ["attachments", "CON"]),
    ])
    with zipfile.ZipFile(package) as archive:
        for name in archive.namelist():
            assert not name.startswith("/")
            assert all(not part.startswith(".") and part != "__MACOSX" for part in name.split("/"))
        assert "_attachments/_CON.md" in archive.namelist()


def test_long_unicode_titles_fit_filesystem_filename_limits(tmp_path):
    package = publish_markdown_package(output_dir=tmp_path, pages=[page(1, ["产品", "指南" * 100])])
    with zipfile.ZipFile(package) as archive:
        assert all(len(part.encode("utf-8")) <= 255 for name in archive.namelist() for part in name.split("/"))


def test_reference_links_external_links_and_unselected_pages(tmp_path):
    package = publish_markdown_package(output_dir=tmp_path, pages=[
        page(1, ["产品", "指南"], "[faq][f]\n[f]: 2.md\n[web](https://example.test/2.md)\n[other](999.md)"),
        page(2, ["产品", "常见问题"]),
    ])
    with zipfile.ZipFile(package) as archive:
        markdown = unquote(archive.read("产品/指南.md").decode())
    assert "[f]: 常见问题.md" in markdown
    assert "https://example.test/2.md" in markdown
    assert "https://wiki.example.test/wiki/pages/viewpage.action?pageId=999" in markdown


def test_code_examples_are_not_rewritten_and_cross_page_attachments_resolve(tmp_path):
    code = "`[example](2.md)`\n```md\n[x](2.md)\n```\n    [indented](2.md)\n"
    package = publish_markdown_package(output_dir=tmp_path, pages=[
        page(1, ["产品", "指南"], code + "![截图](attachments/99.png)"),
        page(2, ["产品", "问题"], attachments=[{"path": "attachments/99.png", "content": b"image"}]),
    ])
    with zipfile.ZipFile(package) as archive:
        markdown = archive.read("产品/指南.md").decode()
    assert code in markdown
    assert "![截图](attachments/99.png)" in markdown


def test_duplicate_attachment_titles_remain_unique_and_links_follow_renames(tmp_path):
    package = publish_markdown_package(output_dir=tmp_path, pages=[
        page(1, ["产品", "指南"], "![a](attachments/99.png)",
             attachments=[{"path": "attachments/99.png", "title": "screenshot.png", "content": b"one"}]),
        page(2, ["团队", "制度"], "![b](attachments/100.png)\n![a](attachments/99.png)",
             attachments=[{"path": "attachments/100.png", "title": "screenshot.png", "content": b"two"}]),
    ])
    with zipfile.ZipFile(package) as archive:
        assert archive.read("产品/attachments/screenshot.png") == b"one"
        assert archive.read("团队/attachments/screenshot [100].png") == b"two"
        markdown = unquote(archive.read("团队/制度.md").decode())
        assert "![b](attachments/screenshot [100].png)" in markdown
        assert "![a](../产品/attachments/screenshot.png)" in markdown


def test_nested_list_images_are_rewritten_without_changing_indented_code(tmp_path):
    markdown = "- Topic\n\n  - Detail\n\n      ![](attachments/99.png)\n\nOutside\n\n    [example](2.md)\n"
    package = publish_markdown_package(output_dir=tmp_path, pages=[
        page(1, ["Space", "Guide"], markdown, attachments=[{"path": "attachments/99.png", "title": "image.png", "content": b"image"}]),
        page(2, ["Space", "Other"]),
    ])
    with zipfile.ZipFile(package) as archive:
        result = archive.read("Space/Guide.md").decode()
    assert "      ![](attachments/image.png)" in result
    assert "    [example](2.md)" in result


@pytest.mark.parametrize("merged", [False, True])
def test_real_confluence_converter_produces_resolvable_links(tmp_path, merged):
    from confluence_markdown_exporter.confluence import Page, Space, Attachment

    space = Space.model_construct(name="产品文档", key="P", homepage=None)
    attachment = Attachment.model_construct(id="99", title="screenshot.png", file_id="", comment="",
                                            media_type="image/png", space=space, ancestors=[], version=None,
                                            base_url="https://wiki.test/wiki")
    guide = Page.model_construct(id=1, title="使用指南", space=space, ancestors=[], version=None,
                                base_url="https://wiki.test/wiki", labels=[], attachments=[attachment], editor2="",
                                body='<p><a href="/wiki/pages/viewpage.action?pageId=2">常见问题</a></p><img src="/download/attachments/1/screenshot.png" data-linked-resource-id="99" alt="截图">', body_export="")
    faq = Page.model_construct(id=2, title="常见问题", space=space, ancestors=[guide], version=None,
                              base_url="https://wiki.test/wiki", labels=[], attachments=[], editor2="",
                              body="<p>正文</p>", body_export="")
    if merged:
        guide.body = '<table><tr><td colspan="2">' + guide.body + '</td></tr></table>'
    client = MagicMock()
    client.get_page_by_id.return_value = {"id": 2, "title": "常见问题",
                                          "_expandable": {"space": "/rest/api/space/P"}}
    client.get_space.return_value = {"key": "P", "name": "产品文档", "homepage": {"id": None}}
    with patch("confluence_export_sidecar.exporter.ApiClientFactory.create_confluence"), \
         patch("confluence_markdown_exporter.confluence.get_thread_confluence", return_value=client), \
         patch("confluence_export_sidecar.exporter.Page.from_id", side_effect=lambda id, url: {1: guide, 2: faq}[id]), \
             patch("confluence_markdown_exporter.confluence._link_target", side_effect=lambda id, url: {1: guide, 2: faq}[id]), \
         patch("confluence_export_sidecar.exporter._download_attachment_content", return_value=b"image"):
        result = export_migration_package(page_ids=["1", "2"], auth={"base_url": "https://wiki.test", "method": "sso", "cookie": "test"}, output_dir=str(tmp_path))
    with zipfile.ZipFile(result["package_path"]) as archive:
        markdown = unquote(archive.read("产品文档/使用指南.md").decode())
        if merged:
            from bs4 import BeautifulSoup
            table = BeautifulSoup(markdown, "html.parser").table
            assert table.td["colspan"] == "2"
            assert table.a["href"] == "使用指南/常见问题.md"
            assert table.img["src"] == "attachments/screenshot.png"
            assert markdown.count("常见问题</a>") == 1
        else:
            assert "[常见问题](使用指南/常见问题.md)" in markdown
        assert "attachments/screenshot.png" in markdown
        assert "产品文档/使用指南/常见问题.md" in archive.namelist()


@pytest.mark.parametrize("pages", [[], [page("../1", ["bad"])], [page(1, ["a"]), page(1, ["b"])]])
def test_invalid_pages_do_not_publish(tmp_path, pages):
    with pytest.raises(ValueError):
        publish_markdown_package(output_dir=tmp_path, pages=pages)
    assert not list(tmp_path.glob("*.zip"))


def test_failed_attachment_does_not_replace_existing_package(tmp_path):
    target = tmp_path / "confluence-migration-1-1.zip"
    target.write_bytes(b"existing")
    attachment = SimpleNamespace(id="99", title="99.png", export_path=Path("attachments/99.png"))
    source = SimpleNamespace(id=1, title="指南", _attachments_for_export=lambda: [attachment])
    with patch("confluence_export_sidecar.exporter._configure_cme", return_value="https://wiki.test"), \
         patch("confluence_export_sidecar.exporter.Page.from_id", return_value=source), \
         patch("confluence_export_sidecar.exporter._download_attachment_content", return_value=None):
        with pytest.raises(ValueError, match="could not be downloaded"):
            export_migration_package(page_ids=["1"], auth={}, output_dir=str(tmp_path))
    assert target.read_bytes() == b"existing"


def test_failed_export_resumes_completed_pages_and_keeps_original_package(tmp_path):
    first = SimpleNamespace(id=1, title="First", space=SimpleNamespace(name="Space", key="P"),
                            ancestors=[], markdown="first", _attachments_for_export=lambda: [])
    second = SimpleNamespace(id=2, title="Second", space=first.space, ancestors=[],
                             markdown="second", _attachments_for_export=lambda: [])
    def fail_second_page():
        raise ConnectionError("offline")

    target = tmp_path / "confluence-migration-1-2.zip"
    target.write_bytes(b"existing")
    with patch("confluence_export_sidecar.exporter._configure_cme", return_value="https://wiki.test"), \
         patch("confluence_export_sidecar.exporter.Page.from_id", side_effect=lambda page_id, _url: first if page_id == 1 else fail_second_page()):
        with pytest.raises(ConnectionError):
            export_migration_package(page_ids=["1", "2"], auth={}, output_dir=str(tmp_path))
    assert target.read_bytes() == b"existing"
    with patch("confluence_export_sidecar.exporter._configure_cme", return_value="https://wiki.test"), \
         patch("confluence_export_sidecar.exporter.Page.from_id", return_value=second) as fetch:
        result = export_migration_package(page_ids=["1", "2"], auth={}, output_dir=str(tmp_path))
    fetch.assert_called_once_with(2, "https://wiki.test")
    with zipfile.ZipFile(result["package_path"]) as archive:
        assert set(archive.namelist()) == {"Space/First.md", "Space/Second.md"}
    assert not [path for path in (tmp_path / ".export-wiki-resume").iterdir() if path.is_dir()]


def test_interrupted_attachment_download_recovers_and_publishes_complete_package(tmp_path):
    from unittest.mock import Mock
    from requests.exceptions import ChunkedEncodingError

    attachment = SimpleNamespace(id="99", title="99.png", filename=".png",
                                 download_link="/download/attachments/1/99.png",
                                 export_path=Path("attachments/99.png"))
    source = SimpleNamespace(id=1, title="指南", space=SimpleNamespace(name="产品", key="P"),
                             ancestors=[], markdown="![截图](attachments/99.png)",
                             _attachments_for_export=lambda: [attachment])
    response = Mock(status_code=200, headers={})
    response.iter_content.return_value = [b"complete image"]
    client = Mock(url="https://wiki.test")
    client.session.get.side_effect = [
        ChunkedEncodingError("Connection broken: IncompleteRead(39227 bytes read, 214969 more expected)"),
        response,
    ]
    with patch("confluence_export_sidecar.exporter._configure_cme", return_value=client.url), \
         patch("confluence_export_sidecar.exporter.Page.from_id", return_value=source), \
         patch("confluence_export_sidecar.exporter.get_thread_confluence", return_value=client), \
         patch("confluence_export_sidecar.attachment_download.sleep"):
        result = export_migration_package(page_ids=["1"], auth={}, output_dir=str(tmp_path))
    assert client.session.get.call_count == 2
    assert result["attachments"] == 1
    with zipfile.ZipFile(result["package_path"]) as archive:
        assert archive.read("产品/attachments/99.png") == b"complete image"


def test_exporter_uses_stable_converter_paths_and_preserves_ancestor_identity(tmp_path):
    from confluence_markdown_exporter import confluence as cme

    attachment = SimpleNamespace(id="99", title="99.png", export_path=Path("attachments/99.png"))
    source = SimpleNamespace(id=1, title="指南", space=SimpleNamespace(name="产品", key="P"),
                             ancestors=[SimpleNamespace(id=10, title="首页")],
                             markdown="![截图](attachments/99.png)", _attachments_for_export=lambda: [attachment])
    with patch("confluence_export_sidecar.exporter.ApiClientFactory.create_confluence"), \
         patch("confluence_export_sidecar.exporter.Page.from_id", return_value=source), \
         patch("confluence_export_sidecar.exporter._download_attachment_content", return_value=b"image"):
        result = export_migration_package(page_ids=["1"], auth={"base_url": "https://wiki.test", "method": "sso", "cookie": "test"}, output_dir=str(tmp_path))
        assert cme.settings.export.page_path == "{page_id}.md"
        assert cme.settings.export.attachment_path == "attachments/{attachment_id}{attachment_extension}"
    assert result["attachments"] == 1
    with zipfile.ZipFile(result["package_path"]) as archive:
        assert "产品/首页/指南.md" in archive.namelist()
        assert "![截图](../attachments/99.png)" in archive.read("产品/首页/指南.md").decode()


def test_migration_export_fetches_pages_concurrently_and_keeps_selection_order(tmp_path):
    from threading import Barrier

    ready = Barrier(4, timeout=2)
    directories = []
    attachment = SimpleNamespace(id="99", title="shared.png", export_path=Path("attachments/99.png"))
    def download(attachment, base_url, directory):
        assert directory.is_dir()
        directories.append(directory)
        return b"shared image"

    def fetch(page_id, base_url):
        ready.wait()
        return SimpleNamespace(id=page_id, title=f"Page {page_id}",
                               space=SimpleNamespace(name="Space", key="P"),
                               ancestors=[], markdown=str(page_id),
                               _attachments_for_export=lambda: [attachment])

    with patch("confluence_export_sidecar.exporter._configure_cme", return_value="https://wiki.test"), \
         patch("confluence_export_sidecar.exporter.Page.from_id", side_effect=fetch), \
         patch("confluence_export_sidecar.exporter._download_attachment_content", side_effect=download):
        result = export_migration_package(page_ids=["4", "3", "2", "1"], auth={}, output_dir=str(tmp_path))
    assert Path(result["package_path"]).name == "confluence-migration-4-4.zip"
    with zipfile.ZipFile(result["package_path"]) as archive:
        assert len(archive.namelist()) == 5
    assert len(set(directories)) == 4


def test_slow_first_page_does_not_block_idle_workers_from_fetching_next_page(tmp_path):
    from threading import Event

    fifth_started = Event()
    def fetch(page_id, base_url):
        if page_id == 1:
            assert fifth_started.wait(2), "idle workers must continue beyond the first batch"
        if page_id == 5:
            fifth_started.set()
        return SimpleNamespace(id=page_id, title=f"Page {page_id}",
                               space=SimpleNamespace(name="Space", key="P"),
                               ancestors=[], markdown=str(page_id),
                               _attachments_for_export=lambda: [])
    with patch("confluence_export_sidecar.exporter._configure_cme", return_value="https://wiki.test"), \
         patch("confluence_export_sidecar.exporter.Page.from_id", side_effect=fetch):
        export_migration_package(page_ids=["1", "2", "3", "4", "5"], auth={}, output_dir=str(tmp_path))


def test_html_assets_and_wiki_relative_links_are_rewritten_without_touching_code(tmp_path):
    markdown = '''<img src="attachments/99.png" width="80">
<a href="viewpage.action?pageId=2">child</a>
[profile](%20%20/display/~someone)
[external attachment](/download/attachments/77/manual.pdf?version=2)
`<img src="attachments/99.png">`

```html
<img src="attachments/99.png">
```
'''
    package = publish_markdown_package(output_dir=tmp_path, pages=[
        page(1, ["Space", "Guide"], markdown, attachments=[{"path": "attachments/99.png", "title": "image.png", "content": b"image"}]),
        page(2, ["Space", "Child"]),
    ])
    with zipfile.ZipFile(package) as archive:
        content = archive.read("Space/Guide.md").decode()
    assert '<img src="attachments/image.png" width="80">' in content
    assert '<a href="Child.md">child</a>' in content
    assert '[profile](https://wiki.example.test/display/~someone)' in content
    assert '(https://wiki.example.test/download/attachments/77/manual.pdf?version=2)' in content
    assert '`<img src="attachments/99.png">`' in content
    assert '```html\n<img src="attachments/99.png">\n```' in content


def test_template_literals_in_fences_do_not_hide_images_between_code_blocks(tmp_path):
    markdown = '```js\nconst x = `hello`;\n```\n\n![](attachments/99.png)\n\n```js\nconst y = `world`;\n```\n'
    package = publish_markdown_package(output_dir=tmp_path, pages=[
        page(1, ["Space", "Guide"], markdown, attachments=[{"path": "attachments/99.png", "title": "image.png", "content": b"image"}]),
    ])
    with zipfile.ZipFile(package) as archive:
        content = archive.read("Space/Guide.md").decode()
    assert '![](attachments/image.png)' in content
    assert '```js\nconst x = `hello`;\n```' in content
    assert '```js\nconst y = `world`;\n```' in content


def test_html_data_attributes_and_unclosed_backticks_do_not_hide_real_assets(tmp_path):
    markdown = '<img data-image-src="attachments/99.png" src="attachments/99.png">\n\n<font>```![](attachments/99.png)</font>\n\n`ordinary code`\n'
    package = publish_markdown_package(output_dir=tmp_path, pages=[
        page(1, ["Space", "Guide"], markdown, attachments=[{"path": "attachments/99.png", "title": "image.png", "content": b"image"}]),
    ])
    with zipfile.ZipFile(package) as archive:
        content = archive.read("Space/Guide.md").decode()
    assert 'src="attachments/image.png">' in content
    assert '<font>```![](attachments/image.png)</font>' in content
    assert '`ordinary code`' in content


def test_packaged_converter_preserves_highlighted_numbered_cells_and_bold(tmp_path):
    from bs4 import BeautifulSoup
    from markdown_it import MarkdownIt
    from confluence_markdown_exporter.confluence import Page
    from confluence_markdown_exporter.utils.app_data_store import ExportConfig

    source = (
        '<table><tr><th>现状</th><th>计划</th></tr><tr>'
        '<td data-highlight-colour="#ffebe6"><ol><li>示例A</li><li>示例B</li></ol></td>'
        '<td data-highlight-colour="#e3fcef"><strong>阶段：</strong>继续</td>'
        '</tr></table>'
    )
    with patch("confluence_markdown_exporter.confluence.settings") as settings:
        settings.export = ExportConfig(convert_text_highlights=True)
        markdown = Page.Converter(SimpleNamespace(html="")).convert(source)
    package = publish_markdown_package(
        output_dir=tmp_path,
        pages=[page(1, ["Space", "Example"], markdown, attachments=[])],
    )
    with zipfile.ZipFile(package) as archive:
        exported = archive.read("Space/Example.md").decode("utf-8")
    body = exported.split("---", 2)[2]
    rendered = BeautifulSoup(MarkdownIt("commonmark", {"html": True}).enable("table").render(body), "html.parser")
    cells = rendered.select("tbody td")
    assert len(cells) == 2
    assert cells[0].get_text() == "1. 示例A2. 示例B"
    assert len(cells[0].find_all("br")) == 1
    assert cells[0].mark["style"] == "background: #ffebe6;"
    assert cells[1].strong.get_text() == "阶段："
    assert cells[1].get_text() == "阶段：继续"
    assert cells[1].mark["style"] == "background: #e3fcef;"
