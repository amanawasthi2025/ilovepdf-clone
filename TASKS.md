# TASKS.md — Feature Tracker

> There is exactly ONE Current Feature at any time.
> Never begin the next feature until the current one is explicitly approved and marked Done.

---

## Current Feature

**Feature:** PDF Merge
**Status:** PLANNED — begins next session
**Branch:** `feature/pdf-merge` (to be created)
**Started:** —

### Description
Allow users to upload two or more PDF files and download them combined into a single PDF. No authentication required. Full spec to be written at the start of the next session.

### Acceptance Criteria
- TBD — to be defined at the start of the next session

### Blocked Items
None.

---

## Previous Feature (Approved)

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
| — | — | — | None yet |

---

## Future Backlog

> Items here are not committed. They represent potential direction only.
> Order suggests rough priority but is subject to change.

| Priority | Feature | Notes |
|---|---|---|
| 1 | **PDF Merge** | Core tool; exercises full pipeline (upload → process → download) |
| 2 | **PDF Split** | Complements merge; high user demand |
| 3 | **PDF Compress** | High demand; reduces file size |
| 4 | **User Authentication** | Required before job history or rate limiting |
| 5 | **PDF to Image** | Converts pages to PNG/JPG |
| 6 | **Image to PDF** | Inverse of above |
| 7 | **PDF Rotate** | Simple but commonly needed |
| 8 | **Job History** | Requires auth; allows users to re-download outputs |
| 9 | **PDF to Word** | Complex conversion; requires LibreOffice |
| 10 | **Word to PDF** | Inverse of above |
| 11 | **Subscription / Payments** | Monetization; requires auth |
| 12 | **PDF Watermark** | Add text/image watermark |
| 13 | **PDF Unlock** | Remove password protection |
| 14 | **PDF Protect** | Add password protection |
| 15 | **Developer API** | Programmatic access; requires auth + subscriptions |

---

## Notes

- Backlog items marked 1–3 are tool features that **do not require user auth**.
- Item 4 (auth) is intentionally placed after initial tools to allow anonymous usage validation.
- Items 9–10 require LibreOffice headless — architectural complexity increases there.
- Items 11+ require payment infrastructure — significant scope jump.

---

*Last updated: 2026-06-30 — Session 001 (Project Initialization)*
