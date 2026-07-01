# TASKS.md — Feature Tracker

> There is exactly ONE Current Feature at any time.
> Never begin the next feature until the current one is explicitly approved and marked Done.

---

## Current Feature

**Feature:** PDF to Image
**Status:** PLANNING
**Branch:** `feature/pdf-to-image`
**Spec:** `wiki/active-feature.md`

### Description
Allow a user to upload a single PDF, choose PNG or JPEG output, and download a ZIP containing one rasterized image per page (fixed 150 DPI, all pages, no ranges) via a new `/pdf-to-image` page (ADR-009). Reuses the full Merge/Split/Compress pipeline and participates in Job History (ADR-008) as a fourth job type — automatic association, ownership-enforced status/download, appears in `/history` with no page-level changes needed.

### Session Breakdown
| Session | Title | Status |
|---|---|---|
| 031 | Planning, ADR-009 & Acceptance Criteria | COMPLETE ✅ |
| 032 | Schema + Worker Processor + API Routes | Not started |
| 033 | Frontend: `/pdf-to-image` page + `download-button.tsx` route-slug fix | Not started |
| 034 | E2E Tests, Polish & Definition of Done | Not started |

### Acceptance Criteria
23 criteria defined — see `wiki/active-feature.md`. None yet verified (planning session only).

### Blocked Items
None.

---

## Previous Feature (Approved)

**Feature:** Job History
**Status:** COMPLETE ✅
**Branch:** `feature/job-history`
**Completed:** 2026-07-01
**Spec:** `wiki/active-feature.md`

### Description
Allow a logged-in user to see a list of their submitted Merge/Split/Compress jobs and re-download completed outputs via a new `/history` page (ADR-008). Association is automatic based on session presence at submit time; anonymous submissions are unaffected. Once a job has an owner, its status/download endpoints require the matching session — anonymous (unowned) jobs keep working exactly as today. No change to file/job retention, no new job types, no pagination in v1.

### Session Breakdown
| Session | Title | Status |
|---|---|---|
| 027 | Planning, ADR-008 & Acceptance Criteria | COMPLETE ✅ |
| 028 | Schema (`Job.userId`) + Association + Ownership Enforcement | COMPLETE ✅ |
| 029 | Frontend: `/history` page, nav "History" link | COMPLETE ✅ |
| 030 | E2E Tests, Polish & Definition of Done | COMPLETE ✅ |

### Acceptance Criteria
All 24 criteria verified — see `wiki/active-feature.md`.

### Notes
- Session 029 also fixed a pre-existing bug in `lib/auth.ts` (missing `jwt`/`session` callbacks meant `session.user.id` was never populated at runtime) found during manual browser verification — see `wiki/lessons-learned.md`. This was silently breaking Session 028's association/ownership mechanism in production despite its unit tests passing.

### Blocked Items
None.

---

## Previous Feature (Approved)

**Feature:** User Authentication
**Status:** COMPLETE ✅
**Branch:** `feature/user-auth`
**Completed:** 2026-07-01
**Spec:** `wiki/active-feature.md`

### Description
Allow a user to sign up with email/password, log in, and log out through a browser interface, with sessions via a signed JWT cookie through Auth.js v5 + Credentials provider (ADR-007, corrected by its Session 024 Addendum from the originally-planned database sessions — Auth.js does not support database sessions for a Credentials-only setup). Purely additive: Merge/Split/Compress remain fully anonymous and unchanged. No OAuth, no email verification, no password reset, and no new UI beyond the auth forms and a session-aware nav — all explicitly deferred per user-confirmed scope.

### Session Breakdown
| Session | Title | Status |
|---|---|---|
| 023 | Planning, ADR-007 & Acceptance Criteria | COMPLETE ✅ |
| 024 | Schema (User/Account/Session/VerificationToken) + Signup/Login API | COMPLETE ✅ |
| 025 | Frontend: `/signup`, `/login`, session-aware nav | COMPLETE ✅ |
| 026 | E2E Tests, Polish & Definition of Done | COMPLETE ✅ |

### Acceptance Criteria
All 28 criteria verified — see `wiki/active-feature.md`.

### Blocked Items
None.

---

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
| 4 | User Authentication | 2026-07-01 | Auth.js v5 + Credentials provider, JWT sessions; signup/login/logout, session-aware nav; 28 ACs; 124 unit tests (108 web + 16 worker) + 13 E2E (13/13 monorepo-wide) |
| 5 | Job History | 2026-07-01 | Automatic job-user association, per-owner authorization on status/download, `/history` page; 24 ACs; 168 unit tests (152 web + 16 worker) + 16 E2E (16/16 monorepo-wide) |

---

## Future Backlog

> Items here are not committed. They represent potential direction only.
> Order suggests rough priority but is subject to change.

| Priority | Feature | Notes |
|---|---|---|
| 1 | **Image to PDF** | Inverse of PDF to Image |
| 2 | **PDF Rotate** | Simple but commonly needed |
| 3 | **PDF to Word** | Complex conversion; requires LibreOffice |
| 4 | **Word to PDF** | Inverse of above |
| 5 | **Subscription / Payments** | Monetization; requires auth |
| 6 | **PDF Watermark** | Add text/image watermark |
| 7 | **PDF Unlock** | Remove password protection |
| 8 | **PDF Protect** | Add password protection |
| 9 | **Developer API** | Programmatic access; requires auth + subscriptions |

---

## Notes

- Merge, Split, Compress, User Authentication, and Job History are all complete.
- PDF to Image is the Current Feature, in PLANNING (Session 031 complete; Sessions 032–034 remain, per `wiki/active-feature.md`).
- Items 3–4 require LibreOffice headless — architectural complexity increases there.
- Items 5+ require payment infrastructure — significant scope jump.

---

*Last updated: 2026-07-01 — Session 031 (PDF to Image: Planning, ADR-009 & Acceptance Criteria)*
