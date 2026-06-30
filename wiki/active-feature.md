# Wiki: Active Feature

> This document describes the feature currently in development.
> Update it at the start of every feature and mark it complete when done.

---

## Current Feature: PDF Merge

**Status:** COMPLETE ✅
**Started:** 2026-06-30
**Completed:** 2026-06-30
**Branch:** `feature/pdf-merge`
**Sessions:** 002 (planning) → 003–010 (implementation)

---

## Feature Summary

Allow a user to upload two or more PDF files through a browser interface, have the system merge them into a single PDF in the order provided, and download the result. No authentication required.

**Why this feature first:**
- Highest-demand PDF tool globally
- Exercises the full processing pipeline end-to-end: upload → queue → worker → storage → download
- Anonymous usage validates the architecture without auth complexity
- Concretely verifiable: upload two PDFs, download one, open it — it works or it doesn't

---

## Constraints

### File Constraints

| Constraint | Value | Env Variable |
|---|---|---|
| Minimum files | 2 | — |
| Maximum files | 10 | — |
| Max size per file | 50 MB | `MAX_FILE_SIZE_BYTES` |
| Max total size | 200 MB | `MAX_TOTAL_SIZE_BYTES` |
| Accepted type | PDF only | — |

PDF validation: both MIME type (`application/pdf`) and magic bytes (`%PDF`) must match. Extension alone is not sufficient.

### File Ordering

Files are merged in the order they are submitted. The UI allows the user to reorder files before submission via drag-and-drop or up/down buttons.

### File Retention

| Item | Retention | Note |
|---|---|---|
| Input files (MinIO) | 1 hour from job creation | Controlled by `FILE_TTL_SECONDS` (default: `3600`) |
| Output file (MinIO) | 1 hour from job creation | Same TTL |
| Job record (PostgreSQL) | 24 hours from creation | For audit/debugging |

TTL enforcement (actually deleting expired files) is **not in scope for this feature**. The `expiresAt` field is stored now to enable a future cleanup worker.

### Rate Limiting & Authentication

Not implemented in this feature. The `jobId` (a CUID) functions as an unguessable access token — possession of the `jobId` is sufficient authorization to check status and download the result. Rate limiting will be addressed when authentication is introduced.

---

## Job Lifecycle

```
PENDING → PROCESSING → COMPLETED
                     ↘ FAILED
```

| Status | Meaning |
|---|---|
| `PENDING` | Files stored, job record created, job enqueued — waiting for a worker |
| `PROCESSING` | Worker has claimed the job and is actively merging |
| `COMPLETED` | Merge succeeded; output file stored in MinIO |
| `FAILED` | Merge failed (corrupt PDF, processing error, unrecoverable condition) |

---

## Database Schema

```prisma
model Job {
  id            String    @id @default(cuid())
  jobType       JobType
  status        JobStatus @default(PENDING)
  inputKeys     String[]
  outputKey     String?
  errorMessage  String?
  correlationId String    @unique
  expiresAt     DateTime
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

enum JobType {
  MERGE
}

enum JobStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}
```

**Field notes:**
- `id`: CUID — used as the public `jobId` returned to the client
- `inputKeys`: ordered array of MinIO object keys for the input files (order = merge order)
- `outputKey`: MinIO object key for the merged output file; `null` until COMPLETED
- `errorMessage`: human-readable error description; `null` unless FAILED
- `correlationId`: UUID generated at job creation, included in all log lines for this job
- `expiresAt`: `createdAt + FILE_TTL_SECONDS`; used by a future cleanup worker

---

## API Contract

### POST /api/merge/jobs

Create a new merge job by uploading files.

**Request:**
```
Content-Type: multipart/form-data
Field name: files (multiple)
```

**Success — 202 Accepted:**
```json
{ "jobId": "clxxxxxxxxxxxxxxxxxxxxxxxx" }
```

**Error responses:**

| HTTP | Error Code | Condition |
|---|---|---|
| 400 | `MINIMUM_FILES_REQUIRED` | Fewer than 2 files submitted |
| 400 | `MAXIMUM_FILES_EXCEEDED` | More than 10 files submitted |
| 400 | `INVALID_FILE_TYPE` | A file is not a valid PDF (MIME or magic bytes mismatch) |
| 413 | `FILE_TOO_LARGE` | A single file exceeds `MAX_FILE_SIZE_BYTES` |
| 413 | `TOTAL_SIZE_EXCEEDED` | Combined size of all files exceeds `MAX_TOTAL_SIZE_BYTES` |
| 500 | `INTERNAL_ERROR` | Storage or queue failure |

All error responses follow this shape:
```json
{ "error": "ERROR_CODE", "message": "Human-readable description" }
```

---

### GET /api/merge/jobs/:jobId/status

Poll for the current status of a merge job.

**Success — 200 OK:**
```json
{
  "jobId": "clxxxxxxxxxxxxxxxxxxxxxxxx",
  "status": "PENDING",
  "createdAt": "2026-06-30T10:00:00.000Z",
  "updatedAt": "2026-06-30T10:00:05.000Z",
  "errorMessage": null
}
```

`errorMessage` is `null` for all statuses except `FAILED`, where it contains a descriptive string.

**Error responses:**

| HTTP | Error Code | Condition |
|---|---|---|
| 404 | `JOB_NOT_FOUND` | No job with this ID exists |

---

### GET /api/merge/jobs/:jobId/download

Get a pre-signed download URL for the merged output file.

**Success — 200 OK (only when status is `COMPLETED`):**
```json
{ "url": "https://storage.example.com/outputs/clxxx...pdf?X-Amz-Signature=..." }
```

The pre-signed URL is valid for **5 minutes**. The client should redirect to or fetch from this URL immediately.

The `Content-Disposition` header on the storage response will be:
`attachment; filename="merged-YYYY-MM-DD.pdf"`

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

**Queue name:** `document-processing`

**Concurrency:** 2 (configurable via `WORKER_CONCURRENCY` env var)

**Retry policy:** 3 attempts, exponential backoff (1s, 2s, 4s delays)

**Job payload (enqueued by the API):**
```typescript
{
  jobId: string;       // matches Job.id in PostgreSQL
  inputKeys: string[]; // ordered MinIO object keys
}
```

**Processing steps:**
1. Update Job status → `PROCESSING` in PostgreSQL
2. For each key in `inputKeys` (in order): fetch object from MinIO as `Buffer`
3. Validate each buffer starts with `%PDF` magic bytes
4. Use pdf-lib to load each PDF and merge all pages in order into a new document
5. Save the merged document as `Uint8Array`
6. Upload to MinIO under a new UUID key (prefix: `outputs/`)
7. Update Job: status → `COMPLETED`, `outputKey` = the new MinIO key
8. On any unrecoverable error: update Job: status → `FAILED`, `errorMessage` = error description

**Logging:** Every log line must include `correlationId` (from the Job record), `jobId`, and `jobType`.

**Worker does not** clean up input or output files — that is deferred to a future TTL cleanup feature.

---

## Frontend Specification

**Route:** `/merge`

### States

The page moves through four sequential states:

```
IDLE → UPLOADING → PROCESSING → DONE
                             ↘ ERROR
```

#### IDLE (initial state)
- Drag-and-drop zone with label "Drag PDF files here or click to browse"
- Accepted file type: `.pdf` / `application/pdf`
- File list below the dropzone (empty initially)
- Merge button below the file list, **disabled** when file count < 2
- Each file in the list shows: filename, formatted file size, remove (×) button
- Files can be reordered: drag-and-drop within the list, or up/down arrow buttons
- Client-side validation before submission:
  - Non-PDF files: rejected at drop/select with an inline error message per file
  - Files over 50MB: rejected at drop/select with an inline error message per file
  - More than 10 files: 11th and beyond are rejected at drop/select

#### UPLOADING (after Merge is clicked, before API responds)
- Merge button shows a loading spinner
- File list and dropzone are non-interactive (disabled)
- On API error (4xx/5xx): return to IDLE state with an error banner

#### PROCESSING (after API returns `jobId`)
- Full-page replacement of the upload UI
- Spinner with message: "Merging your files…" and the file count (e.g., "Combining 3 PDFs")
- TanStack Query polls `GET /api/merge/jobs/:jobId/status` every 2 seconds
- Polling stops when status is `COMPLETED` or `FAILED`

#### DONE (status is `COMPLETED`)
- Success icon + message: "Your PDFs have been merged successfully"
- "Download merged PDF" button
  - On click: calls `GET /api/merge/jobs/:jobId/download`, receives `{ url }`
  - Immediately triggers browser download via the pre-signed URL
- Secondary message: "Your file will be available for download for 1 hour"
- "Merge more PDFs" link resets the page to IDLE

#### ERROR (status is `FAILED` or network error)
- Error icon + message: "Merge failed"
- Short explanation (from `errorMessage` if available, otherwise generic)
- "Try again" button: resets page to IDLE (no page refresh)

### Polling Behaviour

- Library: TanStack Query (`useQuery` with `refetchInterval`)
- Interval: 2000ms
- `refetchInterval` is set to `false` when status is `COMPLETED` or `FAILED`
- Polling begins only after a `jobId` is returned by the upload mutation

---

## Acceptance Criteria

The feature is Done when **all** of the following are verified:

### Upload

- [x] AC-01: User can drag-and-drop 2 PDF files onto the dropzone and see them in the file list
- [x] AC-02: User can click the dropzone to open a file browser and select PDFs
- [x] AC-03: User can upload up to 10 files
- [x] AC-04: Each file in the list shows its filename and formatted size
- [x] AC-05: User can remove a file from the list by clicking the remove button
- [x] AC-06: User can reorder files in the list before submission
- [x] AC-07: Merge button is disabled when fewer than 2 files are in the list
- [x] AC-08: Merge button is enabled when 2 or more files are in the list
- [x] AC-09: Dragging a non-PDF file onto the dropzone shows an error and rejects the file
- [x] AC-10: Selecting a file over 50MB shows an error and rejects the file
- [x] AC-11: Attempting to add an 11th file is rejected with an inline message

### Processing & Download

- [x] AC-12: Clicking Merge submits files to `POST /api/merge/jobs` and receives a `jobId`
- [x] AC-13: After submission, the page shows a "Merging…" processing state
- [x] AC-14: The processing state polls the status endpoint every 2 seconds
- [x] AC-15: When the job completes, the page transitions to the DONE state
- [x] AC-16: The DONE state shows a Download button
- [x] AC-17: Clicking Download triggers a browser file download
- [x] AC-18: The downloaded file is a valid PDF (can be opened in a standard PDF viewer)
- [x] AC-19: The downloaded PDF contains all uploaded pages in the order they were arranged in the UI
- [x] AC-20: "Merge more PDFs" resets the page to IDLE without a page refresh

### Error Handling

- [x] AC-21: If the merge job fails (e.g. corrupt PDF input), the page shows the ERROR state
- [x] AC-22: The ERROR state shows a "Try again" button that resets to IDLE
- [x] AC-23: A network error during upload shows an error banner and keeps the file list intact

### API

- [x] AC-24: `POST /api/merge/jobs` with 2 valid PDFs → 202 `{ jobId }`
- [x] AC-25: `POST /api/merge/jobs` with 1 file → 400 `MINIMUM_FILES_REQUIRED`
- [x] AC-26: `POST /api/merge/jobs` with a non-PDF → 400 `INVALID_FILE_TYPE`
- [x] AC-27: `GET /api/merge/jobs/:jobId/status` for COMPLETED job → `{ status: "COMPLETED" }`
- [x] AC-28: `GET /api/merge/jobs/:jobId/status` for unknown ID → 404
- [x] AC-29: `GET /api/merge/jobs/:jobId/download` for COMPLETED job → `{ url }` (valid pre-signed URL)
- [x] AC-30: `GET /api/merge/jobs/:jobId/download` for PENDING job → 409 `JOB_NOT_COMPLETE`
- [x] AC-31: `GET /api/merge/jobs/:jobId/download` for unknown ID → 404

### Quality

- [x] AC-32: `npm run typecheck` exits with 0 errors
- [x] AC-33: `npm run lint` exits with 0 errors/warnings
- [x] AC-34: `npm run test` passes all unit and integration tests
- [x] AC-35: Playwright E2E test passes: upload 2 PDFs → download merged PDF → file is a valid PDF
- [x] AC-36: No authentication required for any of the above flows

---

## Open Questions — Resolved

These were listed as open in the Session 001 note. All decisions affecting this feature are resolved here.

| Question | Decision | Rationale |
|---|---|---|
| File retention TTL | 1 hour (3600s), configurable via `FILE_TTL_SECONDS` | Balances storage cost with user expectation; communicated in the UI |
| Anonymous session tracking | Not implemented — `jobId` is the access token | Simplest approach; rate limiting deferred until auth is introduced |
| Per-file size limit | 50MB | Accommodates most real PDFs; protects worker memory |
| Total size limit | 200MB | Protects against multi-file abuse while supporting legitimate use |
| Output filename | `merged-YYYY-MM-DD.pdf` via `Content-Disposition` | Human-readable; no server-side state needed |
| Merge order | Submission order; UI allows reordering before submit | Natural UX; ordering is the user's responsibility |

Deployment target, domain name, and payment provider remain open but do not affect this feature.

---

## Session Breakdown

| Session | Title | Status |
|---|---|---|
| 002 | Planning, ADRs & Acceptance Criteria | COMPLETE ✅ |
| 003 | Monorepo Scaffolding & Dev Environment | COMPLETE ✅ |
| 004 | Database Schema & Health Endpoint | COMPLETE ✅ |
| 005 | File Upload API | COMPLETE ✅ |
| 006 | Worker & pdf-lib Merge Processor | COMPLETE ✅ |
| 007 | Job Status & Download API | COMPLETE ✅ |
| 008 | Frontend: Upload UI | COMPLETE ✅ |
| 009 | Frontend: Status Polling & Download | COMPLETE ✅ |
| 010 | E2E Tests, Polish & Definition of Done | COMPLETE ✅ |

---

*Last updated: 2026-06-30 — Session 010 (PDF Merge Complete)*
