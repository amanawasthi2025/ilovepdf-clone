# TASKS.md — Feature Tracker

> There is exactly ONE Current Feature at any time.
> Never begin the next feature until the current one is explicitly approved and marked Done.

---

## Current Feature

**None — awaiting explicit approval for the next feature.**

Per the One-Feature-at-a-Time Rule, PDF Compress is now COMPLETE (see below) and no new feature has been started. See the Future Backlog for candidates.

---

## Previous Feature (Approved)

**Feature:** PDF Compress
**Status:** COMPLETE ✅
**Branch:** `feature/pdf-compress`
**Completed:** 2026-07-01
**Spec:** `wiki/active-feature.md`

### Description
Allow a user to upload a single PDF and a compression level (Low / Recommended / High), recompress its embedded images via pdf-lib + Sharp (ADR-006) and optimize its object structure, and download the resulting smaller PDF. No authentication required. Reuses the full pipeline established by Merge/Split.

### Session Breakdown
| Session | Title | Status |
|---|---|---|
| 018 | Planning, ADR-006 & Acceptance Criteria | COMPLETE ✅ |
| 019 | Compress API (`POST /api/compress/jobs`, validation) | COMPLETE ✅ |
| 020 | Worker: pdf-lib Image Extraction + Sharp Recompression Processor | COMPLETE ✅ |
| 021 | Frontend: `/compress` Upload, Level Selector, Polling & Download UI | COMPLETE ✅ |
| 022 | E2E Tests, Polish & Definition of Done | COMPLETE ✅ |

### Acceptance Criteria
All 40 criteria verified — see `wiki/active-feature.md`.

### Blocked Items
None.

---

**Feature:** PDF Split
**Status:** COMPLETE ✅
**Branch:** `feature/pdf-split`
**Completed:** 2026-07-01

---

**Feature:** PDF Merge
**Status:** COMPLETE ✅
**Branch:** `feature/pdf-merge`
**Completed:** 2026-06-30

---

**Feature:** Project Initialization & Engineering Foundation
**Status:** COMPLETE ✅
**Branch:** `master`
**Completed:** 2026-06-30

### Description
Establish all project documentation, repository structure, technology stack decisions, and development process infrastructure. No application code is written in this phase.

### Acceptance Criteria
- [x] `CLAUDE.md` created with complete operating manual
- [x] `PROJECT.md` created with product vision and engineering handbook
- [x] `TASKS.md` created with current structure
- [x] `CHANGELOG.md` created
- [x] `wiki/` directory created with all required documents
- [x] `docs/adr/` created with ADR template
- [x] `docs/session-notes/` created with first session note
- [x] Technology stack documented and justified in `wiki/architecture.md`
- [x] First feature identified, justified, and added to backlog
- [x] Human approval received

### Blocked Items
None.

---

## Completed Features

| # | Feature | Completed | Notes |
|---|---|---|---|
| 0 | Project Initialization & Engineering Foundation | 2026-06-30 | Docs, stack, process only |
| 1 | PDF Merge | 2026-06-30 | Full pipeline; 36 ACs; 25 unit tests + 1 E2E |
| 2 | PDF Split | 2026-07-01 | Custom ranges, ZIP output; 38 ACs; 75 unit tests + 4 E2E |
| 3 | PDF Compress | 2026-07-01 | pdf-lib + Sharp image recompression, 3 levels; 40 ACs; 104 unit tests + 11 E2E |

---

## Future Backlog

> Items here are not committed. They represent potential direction only.
> Order suggests rough priority but is subject to change.

| Priority | Feature | Notes |
|---|---|---|
| 1 | **User Authentication** | Required before job history or rate limiting |
| 2 | **PDF to Image** | Converts pages to PNG/JPG |
| 3 | **Image to PDF** | Inverse of above |
| 4 | **PDF Rotate** | Simple but commonly needed |
| 5 | **Job History** | Requires auth; allows users to re-download outputs |
| 6 | **PDF to Word** | Complex conversion; requires LibreOffice |
| 7 | **Word to PDF** | Inverse of above |
| 8 | **Subscription / Payments** | Monetization; requires auth |
| 9 | **PDF Watermark** | Add text/image watermark |
| 10 | **PDF Unlock** | Remove password protection |
| 11 | **PDF Protect** | Add password protection |
| 12 | **Developer API** | Programmatic access; requires auth + subscriptions |

---

## Notes

- Merge, Split, and Compress (the initial anonymous-usage tool set) are all complete.
- Item 1 (auth) is next up now that anonymous usage across three tools has been validated.
- Items 6–7 require LibreOffice headless — architectural complexity increases there.
- Items 8+ require payment infrastructure — significant scope jump.

---

*Last updated: 2026-07-01 — Session 022 (PDF Compress: E2E, Polish & Definition of Done — feature complete)*
