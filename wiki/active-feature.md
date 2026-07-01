# Wiki: Active Feature

> This document describes the feature currently in development.
> Update it at the start of every feature and mark it complete when done.

---

## Current Feature: PDF to Image

**Status:** PLANNING
**Started:** 2026-07-01
**Branch:** `feature/pdf-to-image`
**Sessions:** 031 (planning) ← you are here

---

## Feature Summary

Allow a user to upload a single PDF, choose an output image format (PNG or JPEG), and download a ZIP archive containing one image per page, rasterized at a fixed 150 DPI. No authentication required — reuses the full existing pipeline (upload → queue → worker → storage → status/download) established by Merge/Split/Compress, and participates in Job History (ADR-008) exactly like those three tools: automatic `userId` association when logged in, ownership-enforced status/download when a job has an owner, fully unaffected when anonymous.

**Why this feature next:** `TASKS.md`'s Future Backlog names PDF to Image as priority #1, the natural next tool feature now that Job History (backlog item unblocked by auth) is complete.

**Explicitly out of scope for this pass (user-confirmed 2026-07-01):**
- Custom page range selection — v1 always converts every page (no reuse of Split's range-parsing UI/validation)
- User-selectable resolution/DPI or quality tiers (like Compress's Low/Recommended/High) — v1 uses one fixed 150 DPI for all output
- Any rasterization library other than Sharp + bundled PDFium — see ADR-009 for the alternatives considered and why they were rejected for v1
- Single-image output for 1-page PDFs — v1 always produces a ZIP, even for a single page, mirroring Split's existing always-ZIP behavior (no single/multi-page branching)

These are known limitations, not gaps — see ADR-009 for the rasterization library trade-off reasoning specifically.

---

## Scope Decisions (locked 2026-07-01)

| Decision | Choice | Rationale |
|---|---|---|
| Rasterization library | Sharp + bundled PDFium | Already an installed, vetted dependency (ADR-006); PDFium ships in Sharp's official prebuilt binaries — zero new npm or system dependencies. See ADR-009 for alternatives considered. |
| Output format | User chooses PNG or JPEG at submit time | Mirrors Compress's existing level-selector UX pattern; matches the backlog note ("Converts pages to PNG/JPG") |
| Page scope | All pages only | Simplest v1; the backlog note doesn't call for range selection (YAGNI) |
| Resolution | Fixed 150 DPI | Matches the DPI already used for Compress's `RECOMMENDED` tier — a familiar, already-reasoned-about number in this codebase; no new UI control needed |
| Output packaging | Always a ZIP, one image per page | Mirrors `split.ts`'s existing always-ZIP behavior exactly — avoids a single-image-vs-ZIP branch in both worker and frontend |

---

## Database Schema

```prisma
enum JobType {
  MERGE
  SPLIT
  COMPRESS
  PDF_TO_IMAGE
}

enum ImageFormat {
  PNG
  JPEG
}

model Job {
  id               String            @id @default(cuid())
  jobType          JobType
  status           JobStatus         @default(PENDING)
  inputKeys        String[]
  outputKey        String?
  splitRanges      String?
  compressionLevel CompressionLevel?
  imageFormat      ImageFormat?
  errorMessage     String?
  correlationId    String            @unique
  expiresAt        DateTime
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
  userId           String?
  user             User?             @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

**Schema changes from Job History:**
- `JobType` gains `PDF_TO_IMAGE`
- New `ImageFormat` enum: `PNG` | `JPEG`
- `Job` gains a nullable `imageFormat ImageFormat?` — mirrors the existing `compressionLevel` pattern (set for this job type only, `null` for every other job type)
- No changes to `User`, `Account`, `Session`, `VerificationToken`, or any Job History association/authorization mechanism — this feature is a fourth job type plugging into infrastructure that already generalizes over `jobType` (upload routes tag `userId` from session; status/download routes enforce ownership when `userId` is set; `/history` already queries generically by `userId` regardless of `jobType`)

---

## API Contract

### `POST /api/pdf-to-image/jobs` (new route — mirrors `/api/compress/jobs`)

- Accepts one PDF file + `format` (`"PNG"` | `"JPEG"`), validated with Zod at the route boundary
- Calls `auth()` and tags the created `Job` with `session?.user?.id` (same pattern as the other three upload routes since Job History)
- Creates a `Job` row (`jobType: PDF_TO_IMAGE`, `imageFormat: format`), enqueues in BullMQ
- Same response shape/status codes as the other three upload routes (`201` with `jobId`, `400` for validation errors, `413` for oversized files)

### `GET /api/pdf-to-image/jobs/:jobId/status` and `.../download` (new routes — mirror the other three tool types exactly)

- Same `JOB_NOT_FOUND` / ownership-guard (`403 JOB_ACCESS_DENIED`) logic as the six existing status/download routes (ADR-008) — anonymous jobs (`userId` null) unaffected, owned jobs require the matching session
- `download` returns a pre-signed URL to the output ZIP

### `/history` page — no changes required

The existing Server Component (`apps/web/app/history/page.tsx`) queries `prisma.job.findMany({ where: { userId } })` with no `jobType` filter, so `PDF_TO_IMAGE` jobs appear automatically once created. The only change needed elsewhere is described next.

---

## Existing Code Change Required: `history/download-button.tsx` route-slug mapping

`apps/web/app/history/download-button.tsx` currently derives the per-type download URL as `` `/api/${jobType.toLowerCase()}/jobs/${jobId}/download` ``. This has worked so far only because `MERGE`, `SPLIT`, and `COMPRESS` are single words, where `.toLowerCase()` happens to equal the route folder name. `PDF_TO_IMAGE.toLowerCase()` produces `pdf_to_image` (underscore), not the kebab-case `pdf-to-image` route folder Next.js conventions call for here (matching every other route folder in this repo). This is a latent assumption being exposed for the first time by the first multi-word job type, not new instability — fixing it is in scope for this feature (Session 033).

**Fix:** a small `JOB_TYPE_ROUTE_SLUGS: Record<JobType, string>` lookup (or equivalent) replacing the naive `.toLowerCase()` call, mapping `PDF_TO_IMAGE` → `'pdf-to-image'` and the existing three job types to their unchanged lowercase slugs.

---

## Frontend Specification

### `/pdf-to-image` (new tool page — mirrors `/compress`)

- Upload control for a single PDF (same drag/drop + file picker pattern as Merge/Split/Compress)
- Format selector: PNG or JPEG (radio group, mirrors Compress's Low/Recommended/High level selector structurally)
- Same IDLE → UPLOADING → PROCESSING → DONE/ERROR flow, polling, and download UX as every other tool page
- On download, fetches the pre-signed URL for the output ZIP and navigates the browser to it

### `/history`

- No page changes — `PDF_TO_IMAGE` jobs render using existing generic job-type/status/date columns
- `download-button.tsx` gets the route-slug fix described above so its Download control works for this job type too

### Nav / Home page

- No new nav link (Merge/Split/Compress aren't in the nav either — tool pages are reached via the home page's tool list). The home page gains a link/card for `/pdf-to-image` alongside the existing three, matching whatever pattern already lists them there.

---

## Acceptance Criteria

### Upload & Processing

- [ ] AC-01: Uploading a valid PDF with `format: "PNG"` creates a `Job` (`jobType: PDF_TO_IMAGE`, `imageFormat: PNG`) and returns a `jobId`
- [ ] AC-02: Uploading a valid PDF with `format: "JPEG"` behaves identically with `imageFormat: JPEG`
- [ ] AC-03: Uploading a non-PDF file is rejected with a `400` validation error, same pattern as Merge/Split/Compress
- [ ] AC-04: Uploading with a missing/invalid `format` value is rejected with a `400` validation error
- [ ] AC-05: The worker rasterizes every page of the input PDF at 150 DPI, one image per page, in the chosen format
- [ ] AC-06: All page images are packaged into a single ZIP output, regardless of page count (including 1-page PDFs)
- [ ] AC-07: A PDF with N pages produces a ZIP with exactly N image files, named `page-1.{ext}` … `page-N.{ext}`
- [ ] AC-08: A malformed/non-PDF-magic-bytes input fails the job with `status: FAILED` and a descriptive `errorMessage`, same pattern as the other three worker processors

### Status / Download / Ownership

- [ ] AC-09: Status/download for a job submitted while logged in succeeds for the owning user's session, same as the other three tool types
- [ ] AC-10: Status/download for that job returns `403 JOB_ACCESS_DENIED` for no session or a different user's session
- [ ] AC-11: Status/download for an anonymous (`userId` null) `PDF_TO_IMAGE` job behaves identically regardless of requester session state — no regression to the ADR-008 guard logic

### History Integration

- [ ] AC-12: A `PDF_TO_IMAGE` job submitted while logged in appears in `/history` with correct type, status, and created date — no `/history` page code changes required beyond the download-button fix
- [ ] AC-13: The `/history` Download control for a `COMPLETED` `PDF_TO_IMAGE` job successfully downloads the correct output ZIP (validates the route-slug fix)

### Frontend

- [ ] AC-14: `/pdf-to-image` accepts a PDF upload, a format selection, and completes the full IDLE → UPLOADING → PROCESSING → DONE flow with a working download
- [ ] AC-15: An unsupported/invalid file shows a clear inline error, without a page crash, same pattern as the other tool pages
- [ ] AC-16: The home page links to `/pdf-to-image` alongside the existing three tools

### Anonymous Use Unaffected

- [ ] AC-17: `/pdf-to-image` functions identically whether the visitor is logged in or logged out
- [ ] AC-18: All pre-existing Merge/Split/Compress/Auth/Job History unit, integration, and E2E tests continue to pass unmodified

### Quality

- [ ] AC-19: `npm run typecheck` exits with 0 errors
- [ ] AC-20: `npm run lint` exits with 0 errors/warnings
- [ ] AC-21: `npm run test` passes all unit and integration tests
- [ ] AC-22: Playwright E2E test passes: upload a PDF, select a format, download the resulting ZIP, and verify it contains the expected number of correctly-formatted page images
- [ ] AC-23: Playwright E2E test passes: a `PDF_TO_IMAGE` job submitted while logged in appears in `/history` and its Download control succeeds (validates the route-slug fix end-to-end)

---

## Open Questions — Resolved

| Question | Decision | Rationale |
|---|---|---|
| Which rasterization library? | Sharp + bundled PDFium | Zero new dependencies, already vetted (ADR-006/ADR-009) |
| Which output format(s)? | User chooses PNG or JPEG | Matches backlog note; mirrors Compress's selector UX |
| Custom page ranges in v1? | No — all pages only | Not called for by the backlog note; YAGNI |
| Fixed or selectable resolution? | Fixed 150 DPI | No demonstrated need for a selector yet; simplest v1 |

No open questions remain that block implementation.

---

## Session Breakdown

| Session | Title | Status |
|---|---|---|
| 031 | Planning, ADR-009 & Acceptance Criteria | COMPLETE ✅ |
| 032 | Schema (`JobType.PDF_TO_IMAGE`, `ImageFormat`) + Worker Processor + API Routes | Not started |
| 033 | Frontend: `/pdf-to-image` page + `download-button.tsx` route-slug fix | Not started |
| 034 | E2E Tests, Polish & Definition of Done | Not started |

---

*This document will be updated as each session completes.*
