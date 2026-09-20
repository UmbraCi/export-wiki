# 04: Content fidelity and conversion report

**What to build:** Exported pages preserve supported document semantics in Markdown and make every unsupported or lossy Confluence construct explicit in static output and the migration report.

**Blocked by:** 01 — Versioned single-page migration package; 03 — Attachment isolation and integrity.

**Status:** ready-for-agent

- [ ] Representative headings, paragraphs, ordered and unordered lists, tables, code blocks, quotes, task content, images, attachments and links retain their document meaning in converted Markdown.
- [ ] The source storage representation and rendered HTML remain available for diagnosis and visual comparison until migration acceptance.
- [ ] Known non-editable macros become an explicit static representation or visible placeholder rather than disappearing.
- [ ] Unknown macros produce a visible placeholder and a report entry containing enough source identity to review the page.
- [ ] A conversion that loses content-bearing source data is classified as blocking and prevents package publication.
- [ ] Expected styling differences, static macro conversion and unresolved out-of-batch links are classified as review warnings.
- [ ] The report lists every static conversion, placeholder, unresolved source link and affected page.
- [ ] Conversion outcomes are deterministic for the same source and converter version.
- [ ] Tests assert semantic output and warning/error classification rather than private converter call structure or brittle whole-file formatting.
