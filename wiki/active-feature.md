# Wiki: Active Feature

> This document describes the feature currently in development.
> Update it at the start of every feature and mark it complete when done.

---

## Current Feature: Image to PDF

**Status:** IN PROGRESS — Session 035 (Planning)
**Started:** 2026-07-01
**Branch:** `feature/image-to-pdf` (not yet created)
**Sessions:** 035 (planning) → 036 (schema + worker + API routes) → 037 (frontend) → 038 (E2E tests, polish, DoD)

---

## Feature Summary

Allow a user to upload one or more images (PNG or JPEG), and download a single PDF containing one page per image, in upload order, via a new `/image-to-pdf` page. No authentication required — reuses the full existing pipeline (upload → queue → worker → storage → status/download) established by Merge/Split/Compress/PDF to Image, and participates in Job History (ADR-008) exactly like those four tools: automatic `userId` association when logged in, ownership-enforced status/download when a job has an owner, fully unaffected when anonymous.

**Why this feature next:** `TASKS.md`'s Future Backlog names Image to PDF as priority #1 — the natural inverse of PDF to Image (just completed), and unlike every other backlog item beyond it, requires no new dependencies (see ADR-010).

**Explicitly out of scope for this pass (user-confirmed 2026-07-01):**
- Any image format beyond PNG/JPEG (e.g. WEBP, GIF, BMP) — `pdf-lib` only embeds PNG/JPEG natively; broader format support would require a Sharp conversion step, which is unneeded scope for v1 (see ADR-010)
- Fixed/standard page size (e.g. A4) with image scaling or centering — v1 sizes each page to match its source image's exact pixel dimensions, full-bleed, no scaling math or whitespace margins (see ADR-010)
- Page reordering UI beyond upload order — mirrors Merge's existing behavior; no drag-to-reorder control
- Any output packaging beyond a single direct-download PDF — this is not a ZIP-output feature (unlike Split/PDF to Image), since there is always exactly one output file regardless of how many images are uploaded

These are known limitations, not gaps — see ADR-010 for the embedding-library and page-sizing trade-off reasoning specifically.

---

## Scope Decisions (locked 2026-07-01)

| Decision | Choice | Rationale |
|---|---|---|
| Embedding library | `pdf-lib` (already installed) | Verified against the installed package's typings to support `embedPng`/`embedJpg`/`drawImage` — zero new dependencies (ADR-010) |
| Input formats | PNG and JPEG only | Matches `pdf-lib`'s native embed support exactly; zero new dependencies; mirrors the existing `ImageFormat` enum's two values |
| Page sizing | Page size = image pixel dimensions, full-bleed | Simplest v1; no scaling/centering/margin logic; preserves image fidelity exactly (ADR-010) |
| File count | 1–10 images per job | Unlike Merge's 2-file minimum, a single image is a valid, common use case; upper bound mirrors Merge's existing `MAX_FILES` cap |
| Ordering | Upload/form order | Mirrors Merge's existing multi-file ordering — no reordering UI |
| Output packaging | Single direct-download PDF (no ZIP) | Exactly one output file always exists, regardless of input count — mirrors Merge's output shape, not Split's/PDF to Image's always-ZIP behavior |

---

## Database Schema

```prisma
enum JobType {
  MERGE
  SPLIT
  COMPRESS
  PDF_TO_IMAGE
  IMAGE_TO_PDF
}
```

**Schema changes from PDF to Image:**
- `JobType` gains `IMAGE_TO_PDF`
- No new columns on `Job` — `inputKeys` (already a `String[]`) holds the ordered list of uploaded image storage keys, and `outputKey` holds the resulting PDF's storage key, same as Merge. No new enum field is needed (unlike `imageFormat` for PDF to Image / Compress's `compressionLevel`), since this job type has no user-selectable processing option.
- No changes to `User`, `Account`, `Session`, `VerificationToken`, or any Job History association/authorization mechanism — this feature is a fifth job type plugging into infrastructure that already generalizes over `jobType`.

---

## API Contract

### `POST /api/image-to-pdf/jobs` (new route — mirrors `/api/merge/jobs`)

- Accepts 1–10 image files (`files` form field, same multi-file pattern as Merge), validated at the route boundary:
  - Each file's declared `type` must be `image/png` or `image/jpeg`
  - Each file re-validated server-side against magic bytes (PNG: `89 50 4E 47`; JPEG: `FF D8 FF`), same defense-in-depth pattern as every other upload route
  - Per-file size limit (`env.MAX_FILE_SIZE_BYTES`) and combined total size limit (`env.MAX_TOTAL_SIZE_BYTES`), same as Merge
- Calls `auth()` and tags the created `Job` with `session?.user?.id` (same pattern as the other four upload routes since Job History)
- Creates a `Job` row (`jobType: IMAGE_TO_PDF`, `inputKeys` in upload order), enqueues in BullMQ
- Same response shape/status codes as the other upload routes (`202` with `jobId`, `400` for validation errors, `413` for oversized files)

### `GET /api/image-to-pdf/jobs/:jobId/status` and `.../download` (new routes — mirror the other four tool types exactly)

- Same `JOB_NOT_FOUND` / ownership-guard (`403 JOB_ACCESS_DENIED`) logic as the existing status/download routes (ADR-008) — anonymous jobs (`userId` null) unaffected, owned jobs require the matching session
- `download` returns a pre-signed URL to the output PDF (`application/pdf`, not a ZIP)

### `/history` page — no changes required to the page itself

The existing Server Component queries `prisma.job.findMany({ where: { userId } })` with no `jobType` filter, so `IMAGE_TO_PDF` jobs appear automatically once created. Two small existing lookup tables need a new entry — see next section.

---

## Existing Code Changes Required

### `apps/web/app/history/download-button.tsx` — `JOB_TYPE_ROUTE_SLUGS`

This map was added in Session 033 specifically to handle multi-word job types correctly (fixing the `PDF_TO_IMAGE` → `pdf_to_image` vs `pdf-to-image` bug). `IMAGE_TO_PDF` is also multi-word, so it needs an entry: `IMAGE_TO_PDF: 'image-to-pdf'`. This is exactly the case that map was built to generalize over — no new bug class, just a new entry.

### `apps/web/app/history/page.tsx` — `JOB_TYPE_LABELS`

Session 034 added this map so `/history` shows a friendly label instead of the raw enum string. Needs a new entry: `IMAGE_TO_PDF: 'Image to PDF'`.

### `apps/web/app/page.tsx` — home page tool cards

Currently renders four tool cards (Merge/Split/Compress/PDF to Image, added Session 033). Needs a fifth card for `/image-to-pdf`.

---

## Frontend Specification

### `/image-to-pdf` (new tool page — mirrors `/merge`)

- Multi-file upload control (drag/drop + file picker), same pattern as `/merge`, accepting 1–10 PNG/JPEG images
- No format/level selector needed — output is always a PDF, no user-selectable processing option (unlike Compress/PDF to Image)
- Same IDLE → UPLOADING → PROCESSING → DONE/ERROR flow, polling, and download UX as every other tool page
- On download, fetches the pre-signed URL for the output PDF and navigates the browser to it

### `/history`

- No page-layout changes — `IMAGE_TO_PDF` jobs render using existing generic job-type/status/date columns
- `download-button.tsx` and `page.tsx` get the lookup-table entries described above

### Home page

- Gains a fifth tool card for `/image-to-pdf`, alongside the existing four

---

## Acceptance Criteria

### Upload & Processing

- [ ] AC-01: Uploading 1 valid PNG creates a `Job` (`jobType: IMAGE_TO_PDF`, `inputKeys` length 1) and returns a `jobId`
- [ ] AC-02: Uploading multiple valid PNG/JPEG images (mixed formats) creates a `Job` with `inputKeys` in upload order
- [ ] AC-03: Uploading 0 files is rejected with a `400` validation error
- [ ] AC-04: Uploading more than 10 files is rejected with a `400` validation error
- [ ] AC-05: Uploading a file that is not PNG/JPEG (by declared type or magic bytes) is rejected with a `400` validation error, same pattern as Merge/Split/Compress/PDF to Image
- [ ] AC-06: Uploading a file exceeding `MAX_FILE_SIZE_BYTES`, or a combined set exceeding `MAX_TOTAL_SIZE_BYTES`, is rejected with a `413` error, same pattern as Merge
- [ ] AC-07: The worker embeds each input image as a full-bleed page sized to that image's pixel dimensions, in upload order
- [ ] AC-08: A job with N input images produces a single PDF with exactly N pages, in upload order
- [ ] AC-09: A malformed/non-image input (passing the API boundary check but failing to decode) fails the job with `status: FAILED` and a descriptive `errorMessage`, same pattern as the other worker processors

### Status / Download / Ownership

- [ ] AC-10: Status/download for a job submitted while logged in succeeds for the owning user's session, same as the other four tool types
- [ ] AC-11: Status/download for that job returns `403 JOB_ACCESS_DENIED` for no session or a different user's session
- [ ] AC-12: Status/download for an anonymous (`userId` null) `IMAGE_TO_PDF` job behaves identically regardless of requester session state — no regression to the ADR-008 guard logic

### History Integration

- [ ] AC-13: An `IMAGE_TO_PDF` job submitted while logged in appears in `/history` with the friendly label "Image to PDF", correct status, and created date
- [ ] AC-14: The `/history` Download control for a `COMPLETED` `IMAGE_TO_PDF` job successfully downloads the correct output PDF (validates the `JOB_TYPE_ROUTE_SLUGS` entry)

### Frontend

- [ ] AC-15: `/image-to-pdf` accepts 1–10 image uploads and completes the full IDLE → UPLOADING → PROCESSING → DONE flow with a working PDF download
- [ ] AC-16: An unsupported/invalid file, or a file count outside 1–10, shows a clear inline error, without a page crash, same pattern as the other tool pages
- [ ] AC-17: The home page links to `/image-to-pdf` alongside the existing four tools

### Anonymous Use Unaffected

- [ ] AC-18: `/image-to-pdf` functions identically whether the visitor is logged in or logged out
- [ ] AC-19: All pre-existing Merge/Split/Compress/Auth/Job History/PDF to Image unit, integration, and E2E tests continue to pass unmodified

### Quality

- [ ] AC-20: `npm run typecheck` exits with 0 errors
- [ ] AC-21: `npm run lint` exits with 0 errors/warnings
- [ ] AC-22: `npm run test` passes all unit and integration tests
- [ ] AC-23: Playwright E2E test passes: upload multiple images, download the resulting PDF, and verify it has the expected page count in the expected order
- [ ] AC-24: Playwright E2E test passes: an `IMAGE_TO_PDF` job submitted while logged in appears in `/history` and its Download control succeeds

---

## Open Questions — Resolved

| Question | Decision | Rationale |
|---|---|---|
| Which embedding library? | `pdf-lib` (already installed) | Verified against installed typings; zero new dependencies (ADR-010) |
| How should each page be sized? | Page size = image pixel dimensions, full-bleed | Simplest v1, no demonstrated need for fixed-page scaling (ADR-010) |
| Which input formats? | PNG and JPEG only | Matches `pdf-lib`'s native capability; zero new dependencies |
| Minimum file count? | 1 (unlike Merge's 2) | A single image to PDF is a valid, common use case |

No open questions remain that block implementation.

---

## Session Breakdown

| Session | Title | Status |
|---|---|---|
| 035 | Planning, ADR-010 & Acceptance Criteria | COMPLETE ✅ |
| 036 | Schema (`JobType.IMAGE_TO_PDF`) + Worker Processor + API Routes | Not started |
| 037 | Frontend: `/image-to-pdf` page + home page card + history label/route-slug entries | Not started |
| 038 | E2E Tests, Polish & Definition of Done | Not started |

---

*This document will be updated as each session completes.*
