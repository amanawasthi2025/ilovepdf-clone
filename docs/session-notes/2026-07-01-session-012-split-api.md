# Session Note: Session 012 — Split API

**Date:** 2026-07-01
**Session Goal:** Implement `POST /api/split/jobs`, `GET /api/split/jobs/:jobId/status`, and `GET /api/split/jobs/:jobId/download`, per the contract locked in Session 011.
**Status:** COMPLETE ✅

---

## What Was Done

### `apps/web/lib/queue.ts`
Widened `documentProcessingQueue` from `Queue<MergeJobPayload>` to `Queue<MergeJobPayload | SplitJobPayload>` so both job types can be enqueued on the shared `document-processing` queue.

### `apps/web/lib/ranges.ts` (new)
Extracted page-range parsing/validation into a standalone pure function, `parseAndValidateRanges(input, pageCount)`, rather than inlining it in the route handler (a deliberate deviation from Merge's fully-inline precedent — decided with the human before implementation). Validates, in order: non-empty, regex syntax (`^\d+-\d+(,\d+-\d+)*$`), then per-range bounds (`start >= 1`, `end <= pageCount`, `start <= end`). Returns a discriminated union (`{ ranges }` or `{ error, message }`). 10 unit tests cover every error path plus valid/overlapping/out-of-order/single-page ranges.

### `apps/web/app/api/split/jobs/route.ts` (new)
`POST` handler, single-file `formData()` parsing (field `file`, field `ranges`). Validation order: file presence → MIME type → size limit → magic bytes → pdf-lib page-count parse → range validation. On success: uploads to `inputs/<uuid>.pdf`, creates a `Job` row (`jobType: SPLIT`, `inputKeys: [inputKey]`, `splitRanges`), enqueues `documentProcessingQueue.add('split', { jobId, inputKey, ranges }, ...)` with the same retry/backoff policy as Merge, rolls back to `FAILED` on enqueue failure. Returns `202 { jobId }`.

### `apps/web/app/api/split/jobs/[jobId]/status/route.ts` and `.../download/route.ts` (new)
Copied verbatim from Merge's equivalents — both are entirely generic over `Job`, since the schema is shared across job types and neither route branches on `jobType`.

### `apps/web/package.json`
Added `pdf-lib` as an explicit dependency (it previously only resolved via npm workspace hoisting from `@ilovepdf/worker`'s dependency — now needed directly in `apps/web` to compute page counts at upload time).

### Tests
- `apps/web/lib/ranges.test.ts` — 10 tests, no mocking (pure function)
- `apps/web/app/api/split/jobs/route.test.ts` — 8 tests covering all 6 error codes + success, mirroring Merge's `vi.mock` pattern for `env`/`storage`/`queue`/`db`/`logger`; constructs real minimal PDFs via `pdf-lib` for accurate page-count behavior
- `apps/web/app/api/split/jobs/[jobId]/status/route.test.ts` — 3 tests (200, 404, FAILED with errorMessage)
- `apps/web/app/api/split/jobs/[jobId]/download/route.test.ts` — 4 tests (200, 409×2, 404)

All 50 web-package tests pass; `npm run typecheck` and `npm run lint` are clean across all three packages.

### Manual Verification

Ran the dev server against the existing local Postgres/Redis/MinIO instances and `curl`'d every contract path:

| Check | Result |
|---|---|
| `POST` valid PDF + valid ranges | `202 { jobId }` |
| `POST` no file | `400 FILE_REQUIRED` |
| `POST` non-PDF MIME | `400 INVALID_FILE_TYPE` |
| `POST` no ranges | `400 RANGES_REQUIRED` |
| `POST` malformed ranges | `400 INVALID_RANGE_FORMAT` |
| `POST` out-of-bounds range | `400 RANGE_OUT_OF_BOUNDS` |
| `GET status` existing job | `200`, status `PENDING` (no worker yet — expected, Session 013) |
| `GET status` unknown id | `404 JOB_NOT_FOUND` |
| `GET download` PENDING job | `409 JOB_NOT_COMPLETE` |
| `GET download` unknown id | `404 JOB_NOT_FOUND` |

---

## Design Decisions

### Range validation extracted to `lib/ranges.ts` instead of inlined

Discussed with the human before implementation: Merge inlines all validation directly in its route handler, but Split's range validation has six distinct error conditions (more branching than Merge's per-file checks). Extracting it as a pure function makes every branch testable directly, without the route's mock harness. This is a single-purpose helper with one caller — not a premature abstraction.

### Range bounds checked after a full pdf-lib parse, not before

`RANGES_REQUIRED`/`INVALID_RANGE_FORMAT` don't strictly need the page count, but validating them after the pdf-lib load (rather than before) keeps the route to one straight-line sequence instead of splitting range validation into a "syntax" pass and a "bounds" pass. The cost is a wasted PDF parse on the rare request that fails range syntax — acceptable for a single ≤50MB file at MVP scale.

### `pdf-lib` added as an explicit `apps/web` dependency

It was previously a phantom dependency (resolvable only because npm workspaces hoists `apps/worker`'s `pdf-lib` to the repo root `node_modules`). Declaring it explicitly avoids the implicit coupling.

---

## Issues Encountered

None blocking. One TypeScript error during initial test-writing (`Buffer` not assignable to `BlobPart` when passed to `new File([...])`) — resolved by wrapping in `new Uint8Array(buffer)`.

---

## Next Steps

**Session 013: Worker — pdf-lib Split Processor + jszip Archive**

- `processSplitJob()` in `apps/worker/src/jobs/split.ts`: download input, parse ranges, build one `PDFDocument` per range via `pdf-lib`, archive with `jszip` (ADR-003), upload ZIP, mark job `COMPLETED`/`FAILED`
- Register the `split` job name on the worker's `document-processing` processor alongside `merge`
- Unit tests for the processor (page extraction correctness, ZIP contents)

---

*Session note written by: Claude Code (claude-sonnet-5)*
*Next session: Session 013 — Worker: pdf-lib Split Processor + jszip Archive*
