# 07: Representative Confluence corpus acceptance

**What to build:** A human migration operator validates the production candidate exporter against one representative department corpus and produces an accepted migration package for downstream staging import.

**Blocked by:** 06 — Producer contract and offline release gate.

**Status:** ready-for-human

- [ ] The selected corpus includes deep page trees, more than one API page of children where available, duplicate titles, duplicate attachment names, non-ASCII content, large pages and large attachments.
- [ ] The corpus includes every native and third-party macro category actually used by the selected department.
- [ ] Exported page and attachment counts are reconciled 100% against the selected Confluence source.
- [ ] Every package artifact and manifest hash passes integrity validation.
- [ ] Every page with a warning, static conversion, placeholder or unresolved link is manually compared with Confluence.
- [ ] At least one page per content category and at least 10% of remaining ordinary pages are manually compared; batches under 30 pages receive full review.
- [ ] No credential data appears in the package, report or retained logs.
- [ ] The resulting package is accepted as the production candidate or rejected with a concrete conversion/fetch defect list.
- [ ] Source artifacts and credentials remain available only until the corresponding Outline staging migration is accepted, after which the documented cleanup is performed.
