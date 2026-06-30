# Wiki: Active Feature

> This document describes the feature currently in development.
> Update it at the start of every feature and mark it complete when done.

---

## Current Feature: PDF Split

**Status:** IN PROGRESS 🚧
**Started:** 2026-07-01
**Branch:** `feature/pdf-split`
**Sessions:** 011 (planning) → 012–015 (implementation)

---

## Feature Summary

Allow a user to upload a single PDF file and a set of custom page ranges through a browser interface. The system splits the PDF into one output PDF per range, packages all outputs into a single ZIP archive, and lets the user download it. No authentication required.

**Why this feature next:**
- Backlog priority #2 — complements Merge, high user demand
- Reuses the entire pipeline proven by Merge (upload → queue → worker → storage → download, anonymous `jobId` access) with no new infrastructure
- Introduces a new, deliberately scoped wrinkle (multiple outputs per job) without expanding to a second processing library — pdf-lib (ADR-001) still does all the PDF work

---

## Scope Decisions (locked 2026-07-01)

| Decision | Choice | Rationale |
|---|---|---|
| Split mode | Custom page ranges only (e.g. `1-3,4-6,7-10`) | Matches the core split tool in this product category; simplest single mode to spec, build, and test. "Split every N pages" and "extract every page" are explicitly out of scope for this feature — can be added later as additional modes if requested |
| Output delivery | Single ZIP archive, one `outputKey`, one pre-signed download URL | Reuses the existing `Job.outputKey` field and download endpoint shape unchanged from Merge — no schema branching for single-file vs multi-file jobs |
| Range validation | At the upload API, before enqueueing | pdf-lib loads the single uploaded PDF synchronously in the route handler to confirm every range's bounds against the real page count; rejects with `400` immediately rather than queuing a job that can only fail later. Cheap because it is always exactly one file (vs. Merge's up-to-10) |
| ZIP library | `jszip` (ADR-003) | In-memory, async API matches the worker's existing Buffer-in/Buffer-out pattern; no changes needed to `uploadFile()` |

---

## Constraints

### File Constraints

| Constraint | Value | Env Variable |
|---|---|---|
| Files accepted | Exactly 1 | — |
| Max size | 50 MB | `MAX_FILE_SIZE_BYTES` (reused from Merge) |
| Accepted type | PDF only | — |

PDF validation: both MIME type (`application/pdf`) and magic bytes (`%PDF`) must match. Extension alone is not sufficient. Same validation approach as Merge.

### Page Range Format

- Submitted as a single string field, e.g. `ranges=1-3,4-6,7-10`
- Format: comma-separated list of `start-end` pairs, 1-indexed, inclusive
- Each range produces exactly one output PDF in the ZIP, named `split-<start>-<end>.pdf`
- Validation rules (all enforced at the API layer before enqueueing):
  - At least 1 range required
  - Syntax must match `^\d+-\d+(,\d+-\d+)*$`
  - `start >= 1` for every range
  - `end <= totalPageCount` for every range (determined by loading the uploaded PDF with pdf-lib)
  - `start <= end` for every range
  - Ranges may overlap or be submitted out of order — both are permitted (no dedup/sort requirement; output order matches submission order)

### File Retention

Same as Merge — input file and output ZIP retained 1 hour (`FILE_TTL_SECONDS`), job record retained 24 hours. TTL enforcement remains out of scope (deferred to a future cleanup worker, same as Merge).

### Rate Limiting & Authentication

Not implemented, same as Merge. `jobId` is the anonymous access token.

---

## Job Lifecycle

Same as Merge:

```
PENDING → PROCESSING → COMPLETED
                     ↘ FAILED
```

---

## Database Schema

```prisma
model Job {
  id            String    @id @default(cuid())
  jobType       JobType
  status        JobStatus @default(PENDING)
  inputKeys     String[]
  outputKey     String?
  splitRanges   String?
  errorMessage  String?
  correlationId String    @unique
  expiresAt     DateTime
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

enum JobType {
  MERGE
  SPLIT
}

enum JobStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}
```

**Schema changes from Merge:**
- `JobType` enum: added `SPLIT`
- `Job.splitRanges: String?` — the validated, comma-separated range string (e.g. `"1-3,4-6,7-10"`); `null` for `MERGE` jobs. Persisted (not just passed via the BullMQ job payload) so the worker, status endpoint, and any future debugging/observability have a durable record of what was requested
- `inputKeys` reused as-is: for `SPLIT` jobs it always contains exactly 1 entry (the uploaded PDF's storage key)
- `outputKey` reused as-is: for `SPLIT` jobs it holds the ZIP archive's storage key

---

## API Contract

### POST /api/split/jobs

Create a new split job by uploading a file and page ranges.

**Request:**
```
Content-Type: multipart/form-data
Field name: file (single)
Field name: ranges (string, e.g. "1-3,4-6,7-10")
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
| 400 | `RANGES_REQUIRED` | No `ranges` field submitted |
| 400 | `INVALID_RANGE_FORMAT` | `ranges` does not match the required syntax |
| 400 | `RANGE_OUT_OF_BOUNDS` | A range's `start` or `end` falls outside `1..totalPageCount` |
| 500 | `INTERNAL_ERROR` | Storage or queue failure |

All error responses follow this shape:
```json
{ "error": "ERROR_CODE", "message": "Human-readable description" }
```

---

### GET /api/split/jobs/:jobId/status

Identical contract to Merge's status endpoint.

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

### GET /api/split/jobs/:jobId/download

Get a pre-signed download URL for the ZIP archive.

**Success — 200 OK (only when status is `COMPLETED`):**
```json
{ "url": "https://storage.example.com/outputs/clxxx...zip?X-Amz-Signature=..." }
```

The pre-signed URL is valid for **5 minutes**, same as Merge.

The `Content-Disposition` header on the storage response will be:
`attachment; filename="split-YYYY-MM-DD.zip"`

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

**Queue name:** `document-processing` (same queue as Merge — `jobType` in the payload distinguishes processors)

**Concurrency:** 2 (configurable via `WORKER_CONCURRENCY`, shared with Merge)

**Retry policy:** 3 attempts, exponential backoff (1s, 2s, 4s delays) — same as Merge

**Job payload (enqueued by the API):**
```typescript
{
  jobId: string;        // matches Job.id in PostgreSQL
  inputKey: string;     // single MinIO object key (the uploaded PDF)
  ranges: string;        // e.g. "1-3,4-6,7-10" — already validated by the API
}
```

**Processing steps:**
1. Update Job status → `PROCESSING` in PostgreSQL
2. Fetch the single input file from MinIO as a `Buffer`
3. Validate the buffer starts with `%PDF` magic bytes
4. Load the source PDF with pdf-lib
5. For each range (in submission order): create a new `PDFDocument`, copy the page indices in that range, save as `Uint8Array`
6. Build a ZIP archive with `jszip` (ADR-003): one entry per range, named `split-<start>-<end>.pdf`
7. Generate the ZIP as a `Buffer` (`zip.generateAsync({ type: 'nodebuffer' })`)
8. Upload the ZIP to MinIO under a new UUID key (prefix: `outputs/`)
9. Update Job: status → `COMPLETED`, `outputKey` = the new MinIO key
10. On any unrecoverable error: update Job: status → `FAILED`, `errorMessage` = error description

**Logging:** Every log line must include `correlationId`, `jobId`, and `jobType` — same convention as Merge.

**Worker does not** clean up input or output files — same deferred scope as Merge.

---

## Frontend Specification

**Route:** `/split`

### States

Same four-state machine as Merge:

```
IDLE → UPLOADING → PROCESSING → DONE
                             ↘ ERROR
```

#### IDLE (initial state)
- Single-file dropzone with label "Drag a PDF file here or click to browse"
- Accepted file type: `.pdf` / `application/pdf`
- Once a file is dropped/selected, it replaces any previously selected file (single-file only — no list, no reordering)
- Selected file shown below the dropzone: filename, formatted file size, remove (×) button
- Page ranges text input: placeholder `e.g. 1-3, 4-6, 7-10`
- Inline client-side validation of the ranges input before submission (syntax only — page-count bounds are necessarily server-side since the client does not parse the PDF):
  - Empty input: Split button disabled
  - Malformed syntax: inline error message, Split button disabled
- Split button below the ranges input, **disabled** until a valid file is selected and ranges syntax is valid
- Client-side validation before accepting a dropped/selected file:
  - Non-PDF files: rejected at drop/select with an inline error message
  - Files over 50MB: rejected at drop/select with an inline error message

#### UPLOADING (after Split is clicked, before API responds)
- Split button shows a loading spinner
- Dropzone and ranges input are non-interactive (disabled)
- On API error (4xx/5xx): return to IDLE state with an error banner (including `RANGE_OUT_OF_BOUNDS` surfaced with a clear message, since this can only be caught server-side)

#### PROCESSING (after API returns `jobId`)
- Full-page replacement of the upload UI
- Spinner with message: "Splitting your file…" and the range count (e.g., "Creating 3 PDFs")
- TanStack Query polls `GET /api/split/jobs/:jobId/status` every 2 seconds
- Polling stops when status is `COMPLETED` or `FAILED`

#### DONE (status is `COMPLETED`)
- Success icon + message: "Your PDF has been split successfully"
- "Download ZIP" button
  - On click: calls `GET /api/split/jobs/:jobId/download`, receives `{ url }`
  - Immediately triggers browser download via the pre-signed URL
- Secondary message: "Your file will be available for download for 1 hour"
- "Split another PDF" link resets the page to IDLE

#### ERROR (status is `FAILED` or network error)
- Error icon + message: "Split failed"
- Short explanation (from `errorMessage` if available, otherwise generic)
- "Try again" button: resets page to IDLE (no page refresh)

### Polling Behaviour

Identical to Merge: TanStack Query `useQuery` with `refetchInterval: 2000`, set to `false` on `COMPLETED`/`FAILED`.

---

## Acceptance Criteria

The feature is Done when **all** of the following are verified:

### Upload

- [ ] AC-01: User can drag-and-drop a PDF file onto the dropzone and see it selected
- [ ] AC-02: User can click the dropzone to open a file browser and select a PDF
- [ ] AC-03: Selected file shows its filename and formatted size
- [ ] AC-04: User can remove the selected file via the remove button
- [ ] AC-05: User can enter page ranges in the text input
- [ ] AC-06: Split button is disabled when no file is selected
- [ ] AC-07: Split button is disabled when ranges input is empty or malformed
- [ ] AC-08: Split button is enabled when a valid file and syntactically valid ranges are present
- [ ] AC-09: Dragging a non-PDF file onto the dropzone shows an error and rejects the file
- [ ] AC-10: Selecting a file over 50MB shows an error and rejects the file

### Processing & Download

- [ ] AC-11: Clicking Split submits the file and ranges to `POST /api/split/jobs` and receives a `jobId`
- [ ] AC-12: After submission, the page shows a "Splitting…" processing state
- [ ] AC-13: The processing state polls the status endpoint every 2 seconds
- [ ] AC-14: When the job completes, the page transitions to the DONE state
- [ ] AC-15: The DONE state shows a Download ZIP button
- [ ] AC-16: Clicking Download triggers a browser file download of a `.zip` file
- [ ] AC-17: The downloaded ZIP contains one valid PDF per requested range
- [ ] AC-18: Each PDF in the ZIP contains exactly the pages from its corresponding range, in order
- [ ] AC-19: "Split another PDF" resets the page to IDLE without a page refresh

### Error Handling

- [ ] AC-20: Submitting a range whose `end` exceeds the PDF's page count returns `400 RANGE_OUT_OF_BOUNDS` and the UI shows an error banner without losing the selected file
- [ ] AC-21: If the split job fails after being queued (e.g. corrupted PDF), the page shows the ERROR state
- [ ] AC-22: The ERROR state shows a "Try again" button that resets to IDLE
- [ ] AC-23: A network error during upload shows an error banner and keeps the selected file intact

### API

- [ ] AC-24: `POST /api/split/jobs` with a valid PDF and valid ranges → 202 `{ jobId }`
- [ ] AC-25: `POST /api/split/jobs` with no file → 400 `FILE_REQUIRED`
- [ ] AC-26: `POST /api/split/jobs` with a non-PDF → 400 `INVALID_FILE_TYPE`
- [ ] AC-27: `POST /api/split/jobs` with malformed ranges syntax → 400 `INVALID_RANGE_FORMAT`
- [ ] AC-28: `POST /api/split/jobs` with an out-of-bounds range → 400 `RANGE_OUT_OF_BOUNDS`
- [ ] AC-29: `GET /api/split/jobs/:jobId/status` for COMPLETED job → `{ status: "COMPLETED" }`
- [ ] AC-30: `GET /api/split/jobs/:jobId/status` for unknown ID → 404
- [ ] AC-31: `GET /api/split/jobs/:jobId/download` for COMPLETED job → `{ url }` (valid pre-signed URL)
- [ ] AC-32: `GET /api/split/jobs/:jobId/download` for PENDING job → 409 `JOB_NOT_COMPLETE`
- [ ] AC-33: `GET /api/split/jobs/:jobId/download` for unknown ID → 404

### Quality

- [ ] AC-34: `npm run typecheck` exits with 0 errors
- [ ] AC-35: `npm run lint` exits with 0 errors/warnings
- [ ] AC-36: `npm run test` passes all unit and integration tests
- [ ] AC-37: Playwright E2E test passes: upload 1 PDF with valid ranges → download ZIP → all entries are valid PDFs with correct page counts
- [ ] AC-38: No authentication required for any of the above flows

---

## Open Questions — Resolved

| Question | Decision | Rationale |
|---|---|---|
| Split mode | Custom page ranges only | Highest-value single mode; other modes deferred until requested |
| Output delivery | Single ZIP, reusing `outputKey` | No schema branching; minimal change from Merge's proven shape |
| Range validation timing | At upload API, before enqueueing | Fail-fast UX; cheap for a single file |
| ZIP library | jszip (ADR-003) | Matches existing in-memory worker pattern |
| Persist `splitRanges`? | Yes, as a `Job` column | Durable record for observability/debugging; consistent with Job being the source of truth for what was requested, not just the BullMQ payload |

No open questions remain that block implementation.

---

## Session Breakdown

| Session | Title | Status |
|---|---|---|
| 011 | Planning, ADR-003 & Acceptance Criteria | COMPLETE ✅ |
| 012 | Split API (`POST /api/split/jobs`, validation) | COMPLETE ✅ |
| 013 | Worker: pdf-lib Split Processor + jszip Archive | COMPLETE ✅ |
| 014 | Frontend: `/split` Upload, Polling & Download UI | COMPLETE ✅ |
| 015 | E2E Tests, Polish & Definition of Done | NOT STARTED |

---

*Last updated: 2026-07-01 — Session 014 (Frontend Split UI)*
