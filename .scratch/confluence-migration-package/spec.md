# Confluence Migration Package Export

**Status:** ready-for-agent
**Related consumer:** `outline: .scratch/confluence-content-migration/spec.md`, Outline ADR-0025

## Problem Statement

公司需要按部门将选定的 Confluence 文档一次性迁移到 Outline。当前 `export-wiki` 已能使用 Confluence Cookie 或 API token 获取页面并转换为 Markdown/HTML，但现有输出不是可供另一个系统可靠消费的迁移包。

页面当前使用标题平铺命名，附件使用原始文件名平铺命名，因此同名页面和附件会发生覆盖。导出结果没有保留稳定页面身份、父子关系、来源 URL、内容版本、内容哈希和转换警告。子页读取有固定上限，整批导出缺少有界重试、逐页失败隔离和完整包的原子发布。用户控制的标题和文件名还可能导致输出路径逃离所选目录。

迁移操作员需要一个可审查、可校验、可重新生成的迁移包，作为 `export-wiki` 与 Outline 之间的稳定契约。任何页面、附件或转换内容的丢失都不能被静默忽略。

## Solution

将 `export-wiki` 收敛为 Confluence-specific 采集和迁移包生成器。工具继续在本地持有 Confluence 凭证，让管理员选择页面，完整读取页面树和被引用的附件，生成一个带版本 manifest 的 ZIP 迁移包。

迁移包以 Confluence page ID 和 attachment ID 作为物理身份，包含 Confluence storage representation、用于人工视觉对照的渲染 HTML、用于 Outline 可编辑导入的 Markdown、被引用的附件，以及页面、树、链接、附件、哈希和转换警告映射。

导出只有在所有必需页面与附件获取成功、路径安全、manifest 与实际文件一致时才原子发布为可用迁移包。永久失败会产生明确的失败报告，不会产生一个看似完整的 ZIP。

## User Stories

1. As a migration operator, I want to authenticate to Confluence with the existing local Cookie or token flow, so that credentials never need to be sent to Outline.
2. As a migration operator, I want to select the pages for one department migration batch, so that migration remains controlled and reviewable.
3. As a migration operator, I want every selected page identified by its stable Confluence page ID, so that duplicate titles cannot overwrite or misidentify pages.
4. As a migration operator, I want every attachment identified by a stable attachment identity, so that duplicate filenames cannot overwrite each other.
5. As a migration operator, I want the complete ancestor and parent relationship retained, so that the consumer can map source navigation without guessing from filenames.
6. As a migration operator, I want all child-page pagination retrieved, so that parents with more than one API page of children are not silently truncated.
7. As a migration operator, I want the source URL and source content version recorded for every page, so that the exported item is traceable.
8. As a migration operator, I want a content hash recorded for every source and converted artifact, so that package corruption or stale conversion can be detected.
9. As a migration operator, I want the Confluence storage representation retained, so that macro semantics remain available for diagnosis and reconversion.
10. As a migration operator, I want rendered HTML retained, so that a human can compare the exported page with its Confluence presentation.
11. As a migration operator, I want converted Markdown retained, so that the exact editable input intended for Outline is inspectable.
12. As a migration operator, I want referenced images and attachments downloaded into stable page-scoped locations, so that every Markdown reference resolves unambiguously.
13. As a migration operator, I want links between selected pages represented by stable page IDs in the manifest, so that the consumer can rewrite them after document creation.
14. As a migration operator, I want links to unselected pages retain their original Confluence URLs, so that external references are not fabricated.
15. As a migration operator, I want supported rich content converted to semantic Markdown, so that headings, lists, tables, code, quotes and task content remain editable downstream.
16. As a migration operator, I want unsupported macros converted to explicit static content or visible placeholders, so that unknown content is never silently discarded.
17. As a migration operator, I want every static conversion, placeholder and unresolved source link recorded as a warning, so that manual review can focus on risky pages.
18. As a migration operator, I want content-bearing conversion loss to fail the package, so that a successful export means required document content is present.
19. As a migration operator, I want transient Confluence requests retried with a bounded policy, so that temporary failures do not immediately abort the batch.
20. As a migration operator, I want permanently failed pages isolated and named in a failure report, so that I can fix or exclude them deliberately.
21. As a migration operator, I want all output paths constrained beneath the chosen directory, so that hostile or unusual titles cannot escape the export root.
22. As a migration operator, I want the package built in a temporary location and published atomically, so that interruption cannot leave a partial package looking complete.
23. As a migration operator, I want the manifest checked against every package file before publication, so that missing, duplicate and unreferenced artifacts are detected locally.
24. As a migration operator, I want deterministic output from the same Confluence versions and settings, so that reruns can be compared by hash.
25. As a migration operator, I want the package schema version recorded, so that an incompatible Outline importer can reject it explicitly.
26. As a migration operator, I want the export report to separate blocking errors from review warnings, so that package readiness is unambiguous.
27. As a business owner, I want representative native and third-party macro usage inventoried before production migration, so that actual conversion risk is known.
28. As a business owner, I want each content category represented in the acceptance sample, so that a simple-page demo cannot masquerade as migration readiness.
29. As a security owner, I want source artifacts and local credentials deleted after the Outline batch is accepted, so that the export workstation does not become a second document repository.
30. As a maintainer, I want the exporter to stop at package generation, so that it does not own Outline authentication, persistence, retry or rollback.
31. As a maintainer, I want no scheduler or background synchronization added, so that a one-time migration does not become a permanent integration product.
32. As a maintainer, I want package behavior tested at the exported contract rather than private conversion helpers, so that tests protect the consumer-visible result.

## Implementation Decisions

- `export-wiki` owns Confluence authentication, source API access, page selection, complete tree discovery, source retrieval, attachment retrieval, source-specific conversion and migration-package generation.
- `export-wiki` does not authenticate to Outline, call Outline import APIs, write the Outline database or decide Outline Folder/Document persistence.
- Preserve the existing local Cookie and API-token authentication approaches. Credential material remains process-local and is not written into the package, manifest, logs or output filenames.
- Define a versioned migration-package manifest as this repository's public output contract. It records batch/schema version, stable page identity, parent identity, source title/path/URL/version, artifact paths and hashes, attachment identity/mapping, link targets, conversion results and warnings.
- Use Confluence page IDs and attachment IDs for physical package paths. Titles and filenames remain display metadata only and must be sanitized before any optional human-readable path component is used.
- Retain three page representations with distinct purposes: storage representation for macro/source semantics, rendered HTML for visual comparison, and Markdown for downstream editable import.
- Download referenced attachments and images into ID-isolated locations. A required attachment fetch failure or hash mismatch blocks package publication.
- Enumerate all selected descendants with complete API pagination. Do not silently treat a fixed per-parent result limit as a complete tree.
- Use bounded retry with backoff for transient source failures. Authentication, authorization, permanent not-found and deterministic conversion failures are not endlessly retried.
- Process page failures independently enough to produce a complete failure report, but publish no importable package while any required page remains failed.
- Convert supported Confluence content into semantic Markdown. Unknown or non-editable macros become explicit static representations or visible placeholders with warnings; content-bearing silent omission is a blocking error.
- Represent same-batch page links with stable target identity in the manifest while keeping converted Markdown inspectable. Preserve original Confluence URLs for targets outside the selected batch.
- Build output under a temporary package root, validate path containment and manifest/file/hash consistency, then atomically publish the final ZIP. Never write directly to a user-controlled joined path without containment verification.
- Keep output deterministic for the same source versions and converter version. Record the converter/package version needed to explain changed hashes across tool upgrades.
- Generate a machine-readable and human-readable report that separates blocking errors, conversion warnings, unresolved external links, static macro conversions and package counts.
- Treat package generation as a finite administrator operation. Do not activate the existing speculative incremental/scheduler settings or add synchronization semantics.
- Delete transient credentials when the application exits and provide an explicit post-acceptance cleanup operation for unpacked source artifacts. Retain only a non-content report when the operator chooses cleanup.

## Testing Decisions

- The primary test seam is the published migration ZIP and its report. Tests inspect the package as a consumer would, rather than asserting internal Python, Rust or UI call structure.
- Maintain a contract fixture that the Outline consumer tests can ingest. Schema-version and required-field tests must fail clearly when producer and consumer contracts diverge.
- Test stable identity and isolation with duplicate page titles, duplicate attachment filenames, non-ASCII titles, Windows-reserved names, separators, `..`, absolute-path forms and control characters.
- Test path containment at the final filesystem boundary and verify no file can be written outside the selected temporary/package root.
- Test page-tree enumeration across multiple API pages, deep ancestry, selected subsets, missing parents and a parent with more than the former fixed child limit.
- Test retry classification: transient timeout/rate-limit recovery, bounded exhaustion, authentication failure without pointless retry and deterministic conversion failure without retry loops.
- Test package atomicity by interrupting or failing page, attachment, manifest and final-write stages; no failed run may leave an importable final ZIP.
- Test manifest integrity: unique page/attachment identities, every referenced artifact present, every hash correct, no unreferenced binary, supported schema version and deterministic ordering.
- Test link classification: same-batch page identity, out-of-batch original URL, anchors, renamed source pages and duplicate titles.
- Test representative conversion semantics for headings, lists, tables, code blocks, quotes, task content, images, attachments and known macros. Assert semantic outcomes, not exact formatting implementation.
- Test unknown macros and failed attachment conversion produce explicit warnings or blocking errors according to content-loss severity; no case silently deletes source content.
- Retain focused unit tests for pure normalization and manifest functions only where they improve failure localization; contract behavior remains the acceptance authority.
- Run a staging export against a representative department corpus before production. Validate 100% of counts, files, hashes and warnings; manually compare every warned page, at least one page per content type and at least 10% of ordinary pages, with full review for batches under 30 pages.

## Out of Scope

- Outline authentication, API calls, database writes, Folder/Document creation, attachment persistence or internal-link rewriting after import.
- Import UI, Import queue state, target knowledge-base validation or rollback.
- Continuous, incremental or bidirectional synchronization.
- Background scheduling or unattended recurring exports.
- Reproducing Confluence permissions, comments, watchers, labels or historical versions.
- Pixel-level recreation of Confluence or interactive reimplementation of Confluence macros.
- Uploading a migration package automatically after generation.
- Long-term storage of exported company documents after migration acceptance.
- A general-purpose export framework for sources other than Confluence.

## Further Notes

- The consumer contract is specified in the Outline repository's Confluence Content Migration spec. Cross-repository integration occurs only through the versioned migration package.
- The current exporter is suitable for representative sampling, not production migration, until title/attachment collisions, tree metadata, pagination, retry/failure isolation, path containment and atomic publication are covered.
- Production readiness requires a representative real Confluence corpus because converter-library unit tests cannot establish third-party macro fidelity.
- Recommended delivery order: package schema and integrity rules; safe deterministic paths; complete tree/source retrieval; representations and attachment mapping; conversion warnings/errors; atomic ZIP/report publication; representative-corpus acceptance.
