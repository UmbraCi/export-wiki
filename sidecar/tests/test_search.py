from confluence_export_sidecar.confluence_client import normalize_search_results


def test_normalize_search_results_strips_html_excerpt():
    raw = [{"id": "123", "title": "Home", "spaceKey": "ENG", "excerpt": "<strong>Hello</strong>"}]

    assert normalize_search_results(raw)[0]["excerpt"] == "Hello"
