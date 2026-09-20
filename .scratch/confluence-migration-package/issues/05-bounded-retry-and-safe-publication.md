# 05: Bounded retry and safe publication

**What to build:** Large export batches tolerate transient Confluence failures, report permanent failures per page, and publish a final migration ZIP only when every required artifact is complete and valid.

**Blocked by:** 02 — Complete page tree and link graph; 03 — Attachment isolation and integrity; 04 — Content fidelity and conversion report.

**Status:** ready-for-agent

- [ ] Transient timeouts, rate limits and retryable server failures use a bounded backoff policy.
- [ ] Authentication, authorization, permanent not-found and deterministic conversion failures do not enter endless retry loops.
- [ ] A page or attachment failure is isolated sufficiently to produce a complete failure report naming every known failed item.
- [ ] Any unresolved required failure prevents publication of an importable final ZIP.
- [ ] Failures during page fetch, attachment fetch, conversion, manifest assembly, validation or final write leave no misleading completed package.
- [ ] Successful retry does not duplicate pages, attachments, warnings or report entries.
- [ ] Large attachment data is not unnecessarily accumulated into one unbounded process response when a streaming or bounded approach is available.
- [ ] Process stderr/output handling and cancellation cannot deadlock the export indefinitely.
- [ ] Temporary package data can be cleaned safely without deleting an already validated final package.
