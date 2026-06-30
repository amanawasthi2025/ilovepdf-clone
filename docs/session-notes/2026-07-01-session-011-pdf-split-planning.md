# Session Note: Session 011 — PDF Split Planning

**Date:** 2026-07-01
**Session Goal:** Produce the complete, unambiguous specification for the PDF Split feature — ADR, acceptance criteria, API contract, database schema, worker spec, and frontend spec. Apply the resulting schema migration.
**Status:** COMPLETE ✅

---

## What Was Done

### Housekeeping
- Local `develop` was 10 commits behind `origin/develop` (both PDF Merge PRs had already been merged remotely). Fast-forwarded to sync.

### ADR Created

**ADR-003: ZIP Archive Library for Split Output** (`docs/adr/003-zip-archive-library.md`)
- Decision: `jszip` (in-memory, async)
- Alternatives evaluated: `archiver` (streaming), `adm-zip` (synchronous)
- Key rationale: matches the worker's existing in-memory, async, Buffer-in/Buffer-out pattern (same shape as `processMergeJob()`); no changes needed to `uploadFile()`; avoids the event-loop-blocking risk of `adm-zip` and the unneeded streaming complexity of `archiver` at our 200MB job-size cap

### Active Feature Spec Rewritten

`wiki/active-feature.md` now contains the complete PDF Split specification:

- Feature summary and rationale
- Scope decisions locked with the human at the start of this session (see below)
- File constraints (single file, 50MB, PDF-only, same magic-byte validation as Merge)
- Page range format and validation rules
- Full Prisma schema diff for the `Job` model
- Complete API contract for all three endpoints (upload, status, download) with all request/response shapes and error codes
- Worker specification (queue name, concurrency, retry policy, processing steps including the ZIP step, logging requirements)
- Frontend specification (single-file dropzone + ranges input, same four-state machine as Merge)
- 38 acceptance criteria covering upload, processing, download, error handling, API, and quality

### Scope Decisions Locked (made with the human before drafting the spec)

| Decision | Choice | Rationale |
|---|---|---|
| Split mode | Custom page ranges only | Highest-value single mode; "every N pages" and "extract every page" explicitly deferred until requested |
| Output delivery | Single ZIP archive, reusing `Job.outputKey` | No schema branching between single-file and multi-file job types |
| Range validation timing | At the upload API, before enqueueing | Fail-fast UX; cheap because Split always processes exactly one file (vs. up to 10 for Merge) |

### Schema Migration Applied

- `prisma/schema.prisma`: added `SPLIT` to the `JobType` enum; added `Job.splitRanges: String?`
- Migration `20260630190347_add_split_job_type` generated and applied against the local PostgreSQL instance via `prisma migrate dev`
- `packages/shared/src/types/job.ts`: added `JobType.SPLIT` and a new `SplitJobPayload` type (`{ jobId, inputKey, ranges }`), exported from `packages/shared/src/index.ts`
- `npm run typecheck` verified clean across all three packages (`@ilovepdf/shared`, `@ilovepdf/web`, `@ilovepdf/worker`) after the change

This is a narrower scope of code change than a typical planning session (Session 002 for Merge touched no code at all) — the schema/type change was included in this session's explicitly approved scope rather than deferred to a later session, since it is a direct, mechanical consequence of the spec and has no business logic attached.

### Session Roadmap Approved

| Session | Title |
|---|---|
| 011 | Planning, ADR-003 & Acceptance Criteria (this session) |
| 012 | Split API (`POST /api/split/jobs`, validation) |
| 013 | Worker: pdf-lib Split Processor + jszip Archive |
| 014 | Frontend: `/split` Upload, Polling & Download UI |
| 015 | E2E Tests, Polish & Definition of Done |

Shorter than Merge's 002–010 breakdown because monorepo scaffolding, CI, Docker, and the database/MinIO/BullMQ infrastructure already exist and are reused as-is.

### Feature Branch Created

`feature/pdf-split` created from `develop` (after sync).

---

## Key Decisions Made This Session

### Why custom ranges only (no "every N pages" or "extract every page")

The product-category-standard split tool is range-based. Adding multiple split modes in the first iteration would multiply the API surface, UI surface, and acceptance criteria for value that hasn't been requested yet — a direct YAGNI violation. Additional modes can be added later as a clean extension (new `splitMode` field) without reworking the range-based path.

### Why a single ZIP instead of multiple download links

Multiple individual outputs would require changing `Job.outputKey: String?` to an array field (or a join table), reworking the download endpoint to return a list, and reworking the frontend DONE state to render multiple download buttons. A single ZIP reuses every part of Merge's proven download path unchanged — same field, same endpoint shape, same pre-signed-URL pattern. This is the lower-complexity choice for equivalent user value (one click still downloads everything).

### Why range validation happens in the API layer, not deferred to the worker

Split always processes exactly one uploaded file, so loading it with pdf-lib to check page count at request time is cheap (unlike Merge, where doing this for up to 10 files per request would be more API-layer work). Catching `RANGE_OUT_OF_BOUNDS` synchronously means the user never has to wait through PENDING/PROCESSING to learn their input was invalid — consistent with Merge's precedent of validating everything possible before enqueueing.

### Why `splitRanges` is persisted on `Job` rather than passed only via the BullMQ payload

The Job record in PostgreSQL is the project's source of truth for "what was requested" (see `inputKeys`, `errorMessage` on the existing model) — useful for debugging a `FAILED` job after the fact without digging through Redis/BullMQ internals. This mirrors the existing design, not a new pattern.

---

## Risks Identified

1. **pdf-lib + jszip combined memory usage:** A Split job now holds the source PDF, N range-document buffers, and the final ZIP buffer in memory simultaneously (worst case: many overlapping ranges over a 50MB file). Worker concurrency remains 2 by default, same mitigation as Merge's equivalent risk. Should be monitored if range counts grow large in practice.

2. **Range validation must use the same page-counting logic as the worker:** The API layer's `pdf-lib` load (to check page count) and the worker's later `pdf-lib` load are two separate parses of the same file. They must agree on `getPageCount()` — low risk since both will be the same pdf-lib version, but worth a shared assertion in tests during Session 012/013 to confirm they cannot disagree (e.g. due to a malformed PDF that parses differently under different load options).

3. **No new infrastructure risk:** Unlike Merge's Session 002 risks (Docker image, MinIO, BullMQ lock timeout), this feature introduces no new infrastructure — those risks remain accepted from Merge and are not re-litigated here.

---

## Next Steps

**Session 012: Split API**

Deliverables:
- `POST /api/split/jobs` route handler — multipart parsing, magic-byte validation, range syntax + bounds validation via pdf-lib, job creation, BullMQ enqueue
- Unit/integration tests for every error code in the API contract (`FILE_REQUIRED`, `INVALID_FILE_TYPE`, `FILE_TOO_LARGE`, `RANGES_REQUIRED`, `INVALID_RANGE_FORMAT`, `RANGE_OUT_OF_BOUNDS`)

End state: `npm run typecheck` and `npm run lint` exit 0; new tests pass; manual `curl` verification of the success and error paths.

---

*Session note written by: Claude Code (claude-sonnet-5)*
*Next session: Session 012 — Split API*
