# 06: Producer contract and offline release gate

**What to build:** Maintainers have one deterministic, credential-free contract fixture and offline verification gate proving that a complete producer package satisfies the versioned consumer contract.

**Blocked by:** 05 — Bounded retry and safe publication.

**Status:** ready-for-agent

- [ ] The contract fixture covers a multi-level source tree, duplicate titles, duplicate attachment filenames, rich content, a static macro, a visible placeholder, same-batch links and out-of-batch links.
- [ ] The fixture contains no real company content, live URL secrets, Cookie data or API tokens.
- [ ] Manifest schema, required fields, hashes, identity uniqueness, ordering and package/file consistency are validated through the published ZIP boundary.
- [ ] Rebuilding the fixture from identical source versions and converter version produces equivalent manifest identities and hashes.
- [ ] The documented schema version matches the fixture and provides an explicit incompatibility signal for consumers.
- [ ] The complete offline test command exercises package generation, integrity validation and failure cases without Confluence access.
- [ ] The Outline repository can consume the fixture without importing exporter code or depending on exporter-internal layouts beyond the public package contract.
- [ ] The export report provides counts for pages, artifacts, attachments, warnings and blockers that a consumer can reconcile.
- [ ] Existing exporter behavior unrelated to migration-package generation remains covered or demonstrably unchanged.
