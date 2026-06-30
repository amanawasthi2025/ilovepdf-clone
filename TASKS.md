# TASKS.md — Feature Tracker

> There is exactly ONE Current Feature at any time.
> Never begin the next feature until the current one is explicitly approved and marked Done.

---

## Current Feature

**Feature:** PDF Merge — Session 005: File Upload API
**Status:** IN PROGRESS
**Branch:** `feature/pdf-merge`
**Started:** 2026-06-30

### Description
Implement `POST /api/merge/jobs` — a multipart file upload endpoint that validates PDF files, stores them in MinIO, creates a Job record in PostgreSQL, and enqueues a BullMQ merge job.

### Session Breakdown

| Session | Scope | Status |
|---|---|---|
| 002 | Planning, spec, ADRs | ✅ Complete |
| 003 | Monorepo scaffolding, Docker Compose | ✅ Complete |
| 004 | Database schema, Prisma, health endpoint | ✅ Complete |
| 005 | File Upload API (`POST /api/merge/jobs`) | 🔄 Current |
| 006 | Worker & pdf-lib merge processor | — |
| 007 | Job Status & Download API | — |
| 008 | Frontend Upload UI | — |
| 009 | Frontend Status Polling & Download | — |
| 010 | E2E Tests, Polish, Definition of Done | — |

### Completed Session ACs

**Session 003 ACs (all ✅):**
- [x] `npm run typecheck` passes on all 3 workspaces
- [x] `npm run lint` passes on all 3 workspaces
- [x] `npm run test --passWithNoTests` passes
- [x] `docker compose up` — all services healthy

**Session 004 ACs (all ✅):**
- [x] `prisma/schema.prisma` matches the approved spec exactly
- [x] `npm run db:generate` succeeds without errors
- [x] `npm run db:migrate` creates migration file and applies to PostgreSQL
- [x] `GET /api/health` returns `{"status":"ok","database":"ok"}` when DB is reachable
- [x] `GET /api/health` returns `{"status":"degraded","database":"error"}` (503) when DB is unreachable
- [x] 2 unit tests pass covering both health states
- [x] `npm run typecheck` and `npm run test` still pass

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
