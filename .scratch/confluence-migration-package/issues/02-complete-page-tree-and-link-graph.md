# 02: Complete page tree and link graph

**What to build:** A migration operator can export a selected multi-page Confluence subtree with complete ancestry, stable identity and link relationships, including trees that require multiple API pages.

**Blocked by:** 01 — Versioned single-page migration package.

**Status:** ready-for-agent

- [ ] Child-page retrieval follows pagination until the source reports completion rather than stopping at a fixed per-parent limit.
- [ ] The manifest records each selected page's stable ID, parent ID, ancestor path, source URL, source version and content hashes.
- [ ] Deep trees and selected subsets retain enough source structure for a consumer to map navigation without inferring it from filenames.
- [ ] Duplicate page titles remain distinct and cannot overwrite artifacts or manifest entries.
- [ ] Links whose target belongs to the selected batch are represented with the target's stable page identity.
- [ ] Links whose target is outside the selected batch retain the original Confluence URL and are reported for review.
- [ ] Anchors and links to duplicate-titled pages remain unambiguous.
- [ ] Missing or inaccessible required pages make the package incomplete rather than silently removing a branch.
- [ ] Package output remains deterministic for the same selected page versions and converter version.
