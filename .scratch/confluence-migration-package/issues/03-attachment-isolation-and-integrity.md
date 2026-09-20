# 03: Attachment isolation and integrity

**What to build:** Referenced Confluence images and attachments are exported into stable, collision-free package locations with verifiable ownership and content integrity.

**Blocked by:** 01 — Versioned single-page migration package.

**Status:** ready-for-agent

- [ ] Every referenced attachment has a stable manifest identity, source page identity, original filename, package location, media type and content hash.
- [ ] Physical paths use stable page and attachment identities; duplicate filenames from one or multiple pages never overwrite one another.
- [ ] Converted Markdown references the correct packaged attachment even when filenames are duplicated or contain non-ASCII characters.
- [ ] Images and general attachments are both represented without relying on title-based global directories.
- [ ] Missing, inaccessible, truncated or hash-mismatched required attachments block package publication.
- [ ] Attachment warnings and blocking failures identify the source page and attachment without exposing credentials.
- [ ] Unreferenced binary artifacts are rejected or omitted so the manifest and package remain mutually complete.
- [ ] Package validation proves that every attachment reference resolves to exactly one included binary.
- [ ] Tests cover duplicate names, unusual filenames, missing content and content-integrity failure at the published package seam.
