# 01: Versioned single-page migration package

**What to build:** A migration operator can select one Confluence page without attachments and receive one safe, versioned, self-describing migration ZIP that the Outline consumer can inspect without knowing exporter internals.

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

- [x] One selected page produces exactly one package containing its storage representation, rendered HTML, converted Markdown, manifest entry and export report.
- [x] The manifest declares a schema version, batch identity, stable page identity, source title/path/URL/version, artifact locations, hashes and conversion status.
- [x] Physical artifact identity is based on the Confluence page ID rather than the page title.
- [x] Titles containing separators, `..`, absolute-path forms, control characters, non-ASCII text or platform-reserved names cannot write outside the package root.
- [x] The package is assembled under a temporary root, validated, and only then published as the final ZIP.
- [x] An interrupted or invalid run leaves no final ZIP that can be mistaken for a complete package.
- [x] A machine-readable and human-readable report clearly identifies success, blocking errors and review warnings.
- [x] A minimal contract fixture is checked in for the Outline consumer without containing real company content or credentials.
- [x] Existing Cookie and API-token authentication continue to work and no credential material appears in the package, report or filenames.
