from confluence_export_sidecar.confluence_client import normalize_page_tree, normalize_spaces


def test_normalize_spaces_keeps_required_fields():
    raw = [{"key": "ENG", "name": "Engineering", "type": "global"}]

    assert normalize_spaces(raw) == [{"key": "ENG", "name": "Engineering", "type": "global"}]


def test_normalize_page_tree_uses_camel_case_parent_id():
    raw = [{"id": "123", "title": "Home", "parent_id": None, "children": []}]

    assert normalize_page_tree(raw) == [
        {"id": "123", "title": "Home", "parentId": None, "children": []}
    ]
