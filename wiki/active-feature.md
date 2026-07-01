# Wiki: Active Feature

> This document describes the feature currently in development.
> Update it at the start of every feature and mark it complete when done.

---

## Current Feature: PDF Compress

**Status:** COMPLETE ✅
**Started:** 2026-07-01
**Completed:** 2026-07-01
**Branch:** `feature/pdf-compress`
**Sessions:** 018 (planning) → 019–022 (implementation)

---

## Feature Summary

Allow a user to upload a single PDF and a compression level (Low / Recommended / High) through a browser interface. The system recompresses embedded raster images and optimizes the PDF's object structure, producing a single smaller output PDF for download. No authentication required.

**Why this feature next:**
- Backlog priority #3 — high demand, continues the no-auth tool track before introducing accounts (backlog #4)
- Reuses the entire pipeline proven by Merge/Split (upload → queue → worker → storage → download, anonymous `jobId` access) with no new infrastructure
- Introduces the project's first genuinely new processing capability (image recompression via Sharp, ADR-006) rather than another pdf-lib-only page operation

---

## Scope Decisions (locked 2026-07-01)

| Decision | Choice | Rationale |
|---|---|---|
| Compression levels | Three presets: **Low**, **Recommended**, **High** — see table below for exact parameters | Matches user expectations for this tool category (mirrors the "less compression / recommended / extreme" pattern common to this product category); an open-ended quality slider is unnecessary complexity for a first version |
| Non-image optimization | Always applied (`useObjectStreams: true` + duplicate/unused object removal via pdf-lib), regardless of selected level | Free, lossless, no reason to gate it behind a level |
| Image color-space/filter scope (v1) | Only RGB/Grayscale JPEG (`DCTDecode`) and raw/Flate bitmap (`FlateDecode`) image XObjects are recompressed. CMYK, Indexed-color, JPEG2000 (`JPXDecode`), and CCITT fax (`CCITTFaxDecode`) images are left untouched | See ADR-006 — round-tripping those color spaces/filters through Sharp reliably is materially more work and not required for a useful first version; explicitly documented, not a silent gap |
| Encrypted/password-protected PDFs | Rejected at upload with `400 UNSUPPORTED_ENCRYPTED_PDF` | pdf-lib cannot load encrypted PDFs; explicit error code since this is a foreseeable case for a compress tool (scanned/protected documents are common inputs) |
| PDFs with nothing compressible (pure text/vector, or only untouched color spaces) | Job still succeeds; output may be nearly the same size as input | Compression is best-effort, not guaranteed — consistent with how tools in this category behave; not treated as an error |
| Output delivery | Single PDF, reusing `Job.outputKey` unchanged | Compress is one-file-in, one-file-out — no schema branching needed, same shape as Merge |
| New dependency | `sharp`, added to `apps/worker` only | See ADR-006 |

### Compression Level Parameters

| Level | Max image DPI (downsample target) | JPEG re-encode quality |
|---|---|---|
| Low | 200 | 85 |
| Recommended | 150 | 75 |
| High | 96 | 60 |

DPI is applied relative to the image's placed size on the PDF page (derived from the image XObject's pixel dimensions and its transform matrix); images already at or below the target DPI are not upscaled (`withoutEnlargement: true`).

---

## Constraints

### File Constraints

| Constraint | Value | Env Variable |
|---|---|---|
| Files accepted | Exactly 1 | — |
| Max size | 50 MB | `MAX_FILE_SIZE_BYTES` (reused from Merge/Split) |
| Accepted type | PDF only | — |

PDF validation: both MIME type (`application/pdf`) and magic bytes (`%PDF`) must match. Extension alone is not sufficient. Same validation approach as Merge/Split.

### Compression Level Input

- Submitted as a single string field, e.g. `level=RECOMMENDED`
- Must be one of `LOW`, `RECOMMENDED`, `HIGH` (case-sensitive)
- Defaults to `RECOMMENDED` if omitted

### File Retention

Same as Merge/Split — input file and output PDF retained 1 hour (`FILE_TTL_SECONDS`), job record retained 24 hours. TTL enforcement remains out of scope (deferred to a future cleanup worker).

### Rate Limiting & Authentication

Not implemented, same as Merge/Split. `jobId` is the anonymous access token.

---

## Job Lifecycle

Same as Merge/Split:

```
PENDING → PROCESSING → COMPLETED
                     ↘ FAILED
```

---

## Database Schema

```prisma
model Job {
  id                String            @id @default(cuid())
  jobType           JobType
  status            JobStatus         @default(PENDING)
  inputKeys         String[]
  outputKey         String?
  splitRanges       String?
  compressionLevel  CompressionLevel?
  errorMessage      String?
  correlationId     String            @unique
  expiresAt         DateTime
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt
}

enum JobType {
  MERGE
  SPLIT
  COMPRESS
}

enum JobStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}

enum CompressionLevel {
  LOW
  RECOMMENDED
  HIGH
}
```

**Schema changes from Split:**
- `JobType` enum: added `COMPRESS`
- New enum `CompressionLevel`: `LOW | RECOMMENDED | HIGH`
- `Job.compressionLevel: CompressionLevel?` — the validated level requested; `null` for `MERGE`/`SPLIT` jobs. Persisted for the same reason `splitRanges` is: a durable record of what was requested, for debugging and observability, not just the BullMQ payload
- `inputKeys` reused as-is: for `COMPRESS` jobs it always contains exactly 1 entry
- `outputKey` reused as-is: for `COMPRESS` jobs it holds the compressed output PDF's storage key

---

## API Contract

### POST /api/compress/jobs

Create a new compress job by uploading a file and a compression level.

**Request:**
```
Content-Type: multipart/form-data
Field name: file (single)
Field name: level (string, one of "LOW" | "RECOMMENDED" | "HIGH"; defaults to "RECOMMENDED" if omitted)
```

**Success — 202 Accepted:**
```json
{ "jobId": "clxxxxxxxxxxxxxxxxxxxxxxxx" }
```

**Error responses:**

| HTTP | Error Code | Condition |
|---|---|---|
| 400 | `FILE_REQUIRED` | No file submitted |
| 400 | `INVALID_FILE_TYPE` | File is not a valid PDF (MIME or magic bytes mismatch) |
| 413 | `FILE_TOO_LARGE` | File exceeds `MAX_FILE_SIZE_BYTES` |
| 400 | `INVALID_COMPRESSION_LEVEL` | `level` is present but not one of `LOW`/`RECOMMENDED`/`HIGH` |
| 400 | `UNSUPPORTED_ENCRYPTED_PDF` | File is a valid PDF but is encrypted/password-protected (pdf-lib cannot load it) |
| 500 | `INTERNAL_ERROR` | Storage or queue failure |

All error responses follow this shape:
```json
{ "error": "ERROR_CODE", "message": "Human-readable description" }
```

---

### GET /api/compress/jobs/:jobId/status

Identical contract to Merge/Split's status endpoint.

**Success — 200 OK:**
```json
{
  "jobId": "clxxxxxxxxxxxxxxxxxxxxxxxx",
  "status": "PENDING",
  "createdAt": "2026-07-01T10:00:00.000Z",
  "updatedAt": "2026-07-01T10:00:05.000Z",
  "errorMessage": null
}
```

**Error responses:**

| HTTP | Error Code | Condition |
|---|---|---|
| 404 | `JOB_NOT_FOUND` | No job with this ID exists |

---

### GET /api/compress/jobs/:jobId/download

Get a pre-signed download URL for the compressed PDF.

**Success — 200 OK (only when status is `COMPLETED`):**
```json
{ "url": "https://storage.example.com/outputs/clxxx...pdf?X-Amz-Signature=..." }
```

The pre-signed URL is valid for **5 minutes**, same as Merge/Split.

The `Content-Disposition` header on the storage response will be:
`attachment; filename="compressed-YYYY-MM-DD.pdf"`

**Error responses:**

| HTTP | Error Code | Condition |
|---|---|---|
| 404 | `JOB_NOT_FOUND` | No job with this ID exists |
| 409 | `JOB_NOT_COMPLETE` | Job exists but is not yet COMPLETED |

The 409 response includes the current status:
```json
{ "error": "JOB_NOT_COMPLETE", "status": "PROCESSING" }
```

---

## Worker Specification

**Queue name:** `document-processing` (same queue as Merge/Split — `jobType` in the payload distinguishes processors)

**Concurrency:** 2 (configurable via `WORKER_CONCURRENCY`, shared with Merge/Split)

**Retry policy:** 3 attempts, exponential backoff (1s, 2s, 4s delays) — same as Merge/Split

**Job payload (enqueued by the API):**
```typescript
{
  jobId: string;             // matches Job.id in PostgreSQL
  inputKey: string;          // single MinIO object key (the uploaded PDF)
  level: 'LOW' | 'RECOMMENDED' | 'HIGH';  // already validated by the API
}
```

**Processing steps:**
1. Update Job status → `PROCESSING` in PostgreSQL
2. Fetch the single input file from MinIO as a `Buffer`
3. Validate the buffer starts with `%PDF` magic bytes
4. Load the source PDF with pdf-lib
5. Enumerate indirect objects via `PDFDocument.context`; identify image XObjects (`Subtype: /Image`) whose `Filter`/`ColorSpace` fall within v1 scope (`DCTDecode` or `FlateDecode` raw bitmap; RGB/Grayscale only — see Scope Decisions)
6. For each in-scope image: extract raw stream bytes, decode per its existing filter, pass to Sharp with the selected level's max DPI (downsample, `withoutEnlargement: true`) and JPEG quality, re-encode as JPEG, write the result back into the XObject's stream and update its `Filter`/`Width`/`Height`/`Length` dictionary entries
7. Out-of-scope images (CMYK, Indexed, JPXDecode, CCITTFaxDecode) are left untouched — not an error
8. Save the modified document with `useObjectStreams: true`
9. Upload the compressed PDF to MinIO under a new UUID key (prefix: `outputs/`)
10. Update Job: status → `COMPLETED`, `outputKey` = the new MinIO key
11. On any unrecoverable error: update Job: status → `FAILED`, `errorMessage` = error description

**Logging:** Every log line must include `correlationId`, `jobId`, and `jobType` — same convention as Merge/Split. On completion, also log input/output byte sizes and the count of images recompressed vs. skipped (out-of-scope) for observability.

**Worker does not** clean up input or output files — same deferred scope as Merge/Split.

**Implementation risk (see ADR-006) — RESOLVED in Session 020:** the pdf-lib low-level API spike confirmed the approach works. Key findings, in full in "Implementation Notes (Session 020)" below: `decodePDFRawStream()` does not support `/DCTDecode` (read via `getContents()` instead); `PDFRawStream.contents` is a readonly property with a private constructor, so replacement (`context.assign(ref, PDFRawStream.of(...))`) is used instead of in-place mutation; pdf-lib exposes no API for reading a page's content-stream drawing operators, so a small hand-rolled `q`/`Q`/`cm`/`Do` tokenizer was built to resolve each image's placed size for the DPI-based downsample rule.

---

## Frontend Specification

**Route:** `/compress`

### States

Same four-state machine as Merge/Split:

```
IDLE → UPLOADING → PROCESSING → DONE
                             ↘ ERROR
```

#### IDLE (initial state)
- Single-file dropzone with label "Drag a PDF file here or click to browse"
- Accepted file type: `.pdf` / `application/pdf`
- Once a file is dropped/selected, it replaces any previously selected file (single-file only)
- Selected file shown below the dropzone: filename, formatted file size, remove (×) button
- Compression level selector: three options (Low / Recommended / High), `Recommended` selected by default
- Compress button below the level selector, **disabled** until a valid file is selected
- Client-side validation before accepting a dropped/selected file:
  - Non-PDF files: rejected at drop/select with an inline error message
  - Files over 50MB: rejected at drop/select with an inline error message

#### UPLOADING (after Compress is clicked, before API responds)
- Compress button shows a loading spinner
- Dropzone and level selector are non-interactive (disabled)
- On API error (4xx/5xx): return to IDLE state with an error banner (including `UNSUPPORTED_ENCRYPTED_PDF` surfaced with a clear message, since this can only be caught server-side)

#### PROCESSING (after API returns `jobId`)
- Full-page replacement of the upload UI
- Spinner with message: "Compressing your file…"
- TanStack Query polls `GET /api/compress/jobs/:jobId/status` every 2 seconds
- Polling stops when status is `COMPLETED` or `FAILED`

#### DONE (status is `COMPLETED`)
- Success icon + message: "Your PDF has been compressed successfully"
- "Download PDF" button
  - On click: calls `GET /api/compress/jobs/:jobId/download`, receives `{ url }`
  - Immediately triggers browser download via the pre-signed URL
- Secondary message: "Your file will be available for download for 1 hour"
- "Compress another PDF" link resets the page to IDLE

#### ERROR (status is `FAILED` or network error)
- Error icon + message: "Compression failed"
- Short explanation (from `errorMessage` if available, otherwise generic)
- "Try again" button: resets page to IDLE (no page refresh)

### Polling Behaviour

Identical to Merge/Split: TanStack Query `useQuery` with `refetchInterval: 2000`, set to `false` on `COMPLETED`/`FAILED`.

**Note on output size display:** Showing the before/after size reduction (e.g. "Reduced by 42%") is explicitly **out of scope for v1** — it would require the status endpoint to return the original and output file sizes, which no current job type exposes. Deferred until requested rather than speculatively added now (YAGNI).

---

## Acceptance Criteria

The feature is Done when **all** of the following are verified:

### Upload

- [x] AC-01: User can drag-and-drop a PDF file onto the dropzone and see it selected
- [x] AC-02: User can click the dropzone to open a file browser and select a PDF
- [x] AC-03: Selected file shows its filename and formatted size
- [x] AC-04: User can remove the selected file via the remove button
- [x] AC-05: User can select a compression level (Low / Recommended / High); Recommended is selected by default
- [x] AC-06: Compress button is disabled when no file is selected
- [x] AC-07: Compress button is enabled once a valid file is selected (any level, since one is always selected by default)
- [x] AC-08: Dragging a non-PDF file onto the dropzone shows an error and rejects the file
- [x] AC-09: Selecting a file over 50MB shows an error and rejects the file

### Processing & Download

- [x] AC-10: Clicking Compress submits the file and level to `POST /api/compress/jobs` and receives a `jobId`
- [x] AC-11: After submission, the page shows a "Compressing…" processing state
- [x] AC-12: The processing state polls the status endpoint every 2 seconds
- [x] AC-13: When the job completes, the page transitions to the DONE state
- [x] AC-14: The DONE state shows a Download PDF button
- [x] AC-15: Clicking Download triggers a browser file download of a `.pdf` file
- [x] AC-16: The downloaded PDF opens and renders correctly (valid PDF, not corrupted) and contains the same page count and page order as the input
- [x] AC-17: For a PDF containing in-scope images (RGB/Grayscale JPEG), the compressed output is measurably smaller than the input at every level
- [x] AC-18: For a PDF containing no compressible content (pure text/vector), the job still completes successfully (COMPLETED, not FAILED)
- [x] AC-19: "Compress another PDF" resets the page to IDLE without a page refresh

### Error Handling

- [x] AC-20: Submitting an encrypted/password-protected PDF returns `400 UNSUPPORTED_ENCRYPTED_PDF` and the UI shows an error banner without losing the selected file
- [x] AC-21: Submitting an invalid `level` value returns `400 INVALID_COMPRESSION_LEVEL`
- [x] AC-22: If the compress job fails after being queued, the page shows the ERROR state
- [x] AC-23: The ERROR state shows a "Try again" button that resets to IDLE
- [x] AC-24: A network error during upload shows an error banner and keeps the selected file intact

### API

- [x] AC-25: `POST /api/compress/jobs` with a valid PDF and valid level → 202 `{ jobId }`
- [x] AC-26: `POST /api/compress/jobs` with a valid PDF and omitted level → 202 `{ jobId }`, job defaults to `RECOMMENDED`
- [x] AC-27: `POST /api/compress/jobs` with no file → 400 `FILE_REQUIRED`
- [x] AC-28: `POST /api/compress/jobs` with a non-PDF → 400 `INVALID_FILE_TYPE`
- [x] AC-29: `POST /api/compress/jobs` with an invalid `level` → 400 `INVALID_COMPRESSION_LEVEL`
- [x] AC-30: `POST /api/compress/jobs` with an encrypted PDF → 400 `UNSUPPORTED_ENCRYPTED_PDF`
- [x] AC-31: `GET /api/compress/jobs/:jobId/status` for COMPLETED job → `{ status: "COMPLETED" }`
- [x] AC-32: `GET /api/compress/jobs/:jobId/status` for unknown ID → 404
- [x] AC-33: `GET /api/compress/jobs/:jobId/download` for COMPLETED job → `{ url }` (valid pre-signed URL)
- [x] AC-34: `GET /api/compress/jobs/:jobId/download` for PENDING job → 409 `JOB_NOT_COMPLETE`
- [x] AC-35: `GET /api/compress/jobs/:jobId/download` for unknown ID → 404

### Quality

- [x] AC-36: `npm run typecheck` exits with 0 errors
- [x] AC-37: `npm run lint` exits with 0 errors/warnings
- [x] AC-38: `npm run test` passes all unit and integration tests
- [x] AC-39: Playwright E2E test passes: upload an image-containing PDF at each level → download → verify output is smaller than input and page count/order is preserved
- [x] AC-40: No authentication required for any of the above flows

---

## Open Questions — Resolved

| Question | Decision | Rationale |
|---|---|---|
| Compression approach | pdf-lib + Sharp | See ADR-006 — only option delivering real compression within existing architectural constraints (no shell-out, no system dependency, no AGPL) |
| Compression levels | 3 fixed presets (Low/Recommended/High) | Matches category convention; avoids open-ended slider complexity |
| Image color-space scope (v1) | RGB/Grayscale JPEG + Flate raw bitmap only | CMYK/Indexed/JPX/CCITT deferred — real complexity, not required for a useful v1 |
| Encrypted PDF handling | Explicit `400 UNSUPPORTED_ENCRYPTED_PDF` at upload | Foreseeable input for a compress tool; fail fast with a clear error rather than a generic failure |
| Output size reduction display | Out of scope for v1 | Requires new fields on the status response no other feature needs yet (YAGNI) |

No open questions remain that block implementation, aside from the pdf-lib low-level API spike explicitly called out for the start of Session 020.

---

## Session Breakdown

| Session | Title | Status |
|---|---|---|
| 018 | Planning, ADR-006 & Acceptance Criteria | COMPLETE ✅ |
| 019 | Compress API (`POST /api/compress/jobs`, validation) | COMPLETE ✅ |
| 020 | Worker: pdf-lib Image Extraction + Sharp Recompression Processor | COMPLETE ✅ |
| 021 | Frontend: `/compress` Upload, Level Selector, Polling & Download UI | COMPLETE ✅ |
| 022 | E2E Tests, Polish & Definition of Done | COMPLETE ✅ |

---

## Implementation Notes (Session 022)

- Parametrized the Session 021 full-flow E2E test (previously Recommended-only) over all three levels to satisfy AC-39 — same fixture, same assertions, level selection driven by the `role="radiogroup"` interaction already covered by the separate level-selector test.
- Full Definition of Done checklist run against the live local stack (native Postgres/Redis/MinIO per ADR-004, MinIO started via the standalone binary command documented in ADR-004, `next dev`, worker `npm run dev`): typecheck 0 errors, lint 0 warnings, 104/104 unit tests, 11/11 Playwright E2E (including the pre-existing Merge/Split suites — no regressions).
- AC-40 confirmed by inspection: no auth-related code exists in `apps/web/app/api/compress/**`, matching Merge/Split's anonymous `jobId`-as-access-token model.
- No new risks or open questions. PDF Compress is feature-complete; `TASKS.md` Current Feature is cleared pending explicit approval of the next feature.

---

## Implementation Notes (Session 021)

**No new pdf-lib/Sharp risk — this session was UI-only.** `apps/web/app/compress/page.tsx` is modeled directly on `apps/web/app/split/page.tsx`'s state machine (IDLE/UPLOADING/PROCESSING/DONE/ERROR), swapping the ranges text input for a three-option level `radiogroup` (Low/Recommended/High, `RECOMMENDED` default). No new abstraction was introduced for the level selector since Merge/Split/Compress only ever needed one instance each of their respective per-feature input.

**`UNSUPPORTED_ENCRYPTED_PDF` needed no special-case UI branch.** The upload handler's existing generic catch-and-banner logic (used by Split for its `RANGE_OUT_OF_BOUNDS` error) already surfaces any 4xx/5xx `message` field from the API in the same red alert banner, without losing the selected file. AC-20's UI half falls out of the existing pattern for free.

**Building a real encrypted PDF fixture for a Playwright E2E test isn't practical with this stack's dependencies** — pdf-lib can load unencrypted PDFs only, and adding a PDF-encryption library just for one test fixture would be scope creep. `apps/web/e2e/compress.spec.ts` instead uses `page.route()` to make the real API call return the exact `400 UNSUPPORTED_ENCRYPTED_PDF` shape (already covered server-side by Session 019's mocked-`PDFDocument.load` unit test), and asserts on the client's real handling of that response. Same technique Split's own e2e suite already used for its seeded-FAILED-job test.

**The E2E image fixture is built by hand via pdf-lib's low-level API, not `sharp`.** `sharp` is a worker-only dependency per ADR-006's scope decision; adding it to `apps/web` just to synthesize a JPEG for a test fixture would violate that boundary. Instead, `buildFixturePdf()` in `compress.spec.ts` constructs a genuine `/DeviceRGB` + `/FlateDecode` raw-bitmap image XObject directly via `pdfDoc.context.flateStream()`/`context.register()`, mirroring the same by-hand technique `compress.test.ts` already uses for its `/DeviceGray` fixture (see Session 020 notes above). This is real v1-in-scope image data — the worker's actual Sharp recompression runs against it for real during the e2e test, nothing about the compression pipeline itself is mocked.

**A real browser network failure doesn't produce the catch block's generic fallback message.** `fetch()` throws `TypeError: Failed to fetch` on a network-level failure, which passes the `err instanceof Error` check, so the banner shows that message rather than the catch block's `'Network error. Please check your connection.'` fallback (which is only ever reached for a thrown non-`Error` value, effectively dead code for real network failures). AC-24 is still satisfied — an error banner appears and the file is retained — the E2E test asserts on the alert text Chromium actually throws rather than the fallback string.

### Tests

7 new unit tests in `apps/web/app/compress/validation.test.ts` (same shape as Split's), plus 5 new Playwright E2E tests in `apps/web/e2e/compress.spec.ts`: full compress-and-download flow at Recommended (page count, page sizes, and output-smaller-than-input all verified), level-selector interaction (AC-05), the `UNSUPPORTED_ENCRYPTED_PDF` banner path (AC-20), a network-failure-during-upload path (AC-24), and a seeded post-queue FAILED job driving the real ERROR state (AC-22/23).

### Manual Verification

Started the real local stack (native Postgres/Redis/MinIO, `next dev`, worker `npm run dev`). Ran the full Playwright suite (`merge.spec.ts` + `split.spec.ts` + `compress.spec.ts`, 9 tests) against it twice — all green, no regressions in the pre-existing Merge/Split flows. Took a direct screenshot of `/compress` in its IDLE state confirming the dropzone, level selector (Recommended pre-selected per AC-05), and disabled-until-file-selected Compress button all render correctly.

### Quality Gates

`npm run typecheck`, `npm run lint`, `npm run test` all green across the whole monorepo — 0 typecheck errors, 0 lint warnings, 88/88 web unit tests + 16/16 worker unit tests passing.

---

## Implementation Notes (Session 020)

**`decodePDFRawStream()` does not support `/DCTDecode`.** It throws `UnsupportedEncodingError` — its supported filter list (Flate/LZW/ASCII85/ASCIIHex/RunLength) covers filters that wrap other data, not terminal image codecs. DCTDecode XObject contents already *are* a complete JPEG file, so they must be read via `.getContents()` directly and handed straight to Sharp, which decodes JPEG natively.

**`PDFRawStream.contents` cannot be mutated in place.** It's declared `readonly` with a private constructor (`node_modules/pdf-lib/cjs/core/objects/PDFRawStream.d.ts`) — there is no public setter. The supported way to replace a stream's bytes at an existing ref is the same mechanism pdf-lib's own `JpegEmbedder`/`PngEmbedder` use internally: `context.assign(ref, PDFRawStream.of(dict, newContents))`.

**Sharp's JPEG encoder defaults to sRGB output regardless of input channel count.** A single-channel (`/DeviceGray`) raw or DCTDecode source re-encoded via `.jpeg()` comes back 3-channel/sRGB unless `.toColourspace('b-w')` is called first. Without this, a grayscale image would silently become an RGB-labeled JPEG (visually similar but semantically wrong, and roughly 3x the bytes it needs to be).

**pdf-lib's `embedPng` always produces a `/DeviceRGB` XObject, even for grayscale source PNGs** (`node_modules/pdf-lib/cjs/utils/png.js` splits every decoded PNG into an RGB channel). This meant a genuine `/DeviceGray` + `/FlateDecode` test fixture couldn't be built via pdf-lib's own embedder — it had to be constructed by hand at the same low level `compress.ts` reads (`context.flateStream(...)` with `ColorSpace: 'DeviceGray'`, wired into a page's `Resources`/`Contents` manually). Real `/DeviceGray` FlateDecode images do occur in PDFs from other producers (Ghostscript, scanners), so this path is exercised even though pdf-lib itself never emits it.

**No public pdf-lib API reads a page's content-stream drawing operators.** The DPI-based downsample rule needs each image's *placed* size on the page (pixel dimensions alone aren't enough — the same image can be drawn at wildly different sizes). `compress.ts` implements a minimal content-stream tokenizer that tracks only `q`/`Q` (graphics state stack) and `cm` (CTM concatenation), recording the CTM in effect at each `Do` call; placed width/height come from the magnitude of the transformed unit basis vectors (`hypot(a,b)`, `hypot(c,d)`), which is correct for rotated/skewed placements too. Verified against a fixture with the same image drawn both axis-aligned and rotated 45° at different sizes on different pages — the tokenizer correctly attributed the larger placed size.

**Deliberate v1 gap: the tokenizer does not recurse into Form XObjects.** An image drawn only inside a nested `/Form` XObject (not directly on a page's content stream) will have no discovered placed size. `recompressImage()` handles this with a safe fallback: skip the DPI-based resize and fall back to quality-only JPEG re-encoding (still real compression, never risks guessing a placed size wrong and visibly over-shrinking an image that's actually drawn large). Not currently expected to be common enough to justify recursive Form-content parsing in v1; revisit if real-world uploads show otherwise.

**Every recompression is compared against the original and only kept if smaller.** Pathological inputs (e.g. an already near-optimal image, or a tiny/flat image where Flate's compression already beats JPEG's fixed overhead) are left untouched rather than risk making the file larger — counted separately in the completion log (`imagesSkippedNoImprovement`) from genuinely out-of-scope images (`imagesSkippedOutOfScope`).

**Manual end-to-end verification:** ran the real local stack (native Postgres/Redis/MinIO + `next dev` + the worker), submitted a 1.79MB fixture PDF (1600×1200 JPEG placed at 400×300pt, plus page text) through the live API at all three levels, and downloaded/rendered each result:

| Level | Output size | Reduction |
|---|---|---|
| LOW | 446,029 bytes | 75.1% |
| RECOMMENDED | 150,610 bytes | 91.6% |
| HIGH | 27,243 bytes | 98.5% |

All three downloaded PDFs opened correctly via `pdfinfo`/`pdftoppm` with the correct page count and intact page layout/text.

### Tests

7 new unit tests in `apps/worker/src/jobs/compress.test.ts`, deliberately using **real** pdf-lib and Sharp against generated fixture PDFs (only `db`/`storage`/`logger` are mocked) — mocking pdf-lib's low-level object API the way `split.test.ts` mocks its high-level calls would mean not testing the actual byte-level logic at all. Covers: JPEG recompression smaller at every level with page count preserved, grayscale FlateDecode recompression preserving `/DeviceGray`, a text-only PDF still completing successfully (AC-18), an out-of-scope CMYK image left untouched, and FAILED paths for invalid magic bytes / corrupt PDF / upload failure.

---

## Implementation Notes (Session 019)

**pdf-lib `EncryptedPDFError` cannot be detected via `instanceof`.** pdf-lib 1.17.1's ES5-targeted build extends the native `Error` class using a `tslib` `__extends` helper; its `super.call(this, msg)` invokes `Error` as a plain function, which returns a brand-new `Error` object rather than initializing `this` — so the resulting instance's prototype chain never includes `EncryptedPDFError.prototype`. Confirmed directly against the installed package: `new EncryptedPDFError() instanceof EncryptedPDFError` evaluates to `false`. The compress upload route therefore detects encryption via `err.message.includes('is encrypted')` instead of `instanceof`. This applies to any future code that needs to distinguish pdf-lib's typed errors from a generic load failure.

*Last updated: 2026-07-01 — Session 021 (Frontend: Compress Upload UI)*
