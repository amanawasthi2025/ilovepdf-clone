# Session Note: Session 018 — PDF Compress Planning

**Date:** 2026-07-01
**Session Goal:** Produce the complete, unambiguous specification for the PDF Compress feature — ADR, acceptance criteria, API contract, database schema, worker spec, and frontend spec. Apply the resulting schema migration.
**Status:** COMPLETE ✅

---

## What Was Done

### Housekeeping
- Local `develop` was already in sync with `origin/develop` — no fast-forward needed.

### Compression Approach Decided (with the human, before drafting the spec)

ADR-001 chose `pdf-lib` specifically to avoid system dependencies, shell invocation, and AGPL licensing risk, but its own pros list for pdf-lib does not include compression — pdf-lib doesn't decode/downsample/re-encode embedded images, which is where real PDF size reduction comes from. Three options were presented with trade-offs:

1. **pdf-lib only** — zero new dependencies, but marginal/inconsistent compression, especially on image-heavy PDFs (the common case)
2. **pdf-lib + Sharp** — real compression, stays in-process/no-shell-out/permissive-license, pulls forward a dependency already earmarked in `wiki/architecture.md` for the future PDF-to-Image feature; costs meaningfully more implementation complexity
3. **Ghostscript/qpdf** — best quality, but directly reverses ADR-001's system-dependency/AGPL rejection

Human chose **pdf-lib + Sharp** (Option 2), matching the recommendation.

### ADR Created

**ADR-006: Sharp for Image Recompression in PDF Compress** (`docs/adr/006-sharp-image-recompression.md`)
- Decision: `pdf-lib` (existing) + `sharp` (new, worker-only)
- Alternatives evaluated: pdf-lib only (insufficient compression), Ghostscript (reopens ADR-001's rejected trade-offs)
- Key rationale: only option delivering real compression within the project's existing architectural boundaries; executes a dependency choice already documented as planned, rather than opening a new one

### Active Feature Spec Rewritten

`wiki/active-feature.md` now contains the complete PDF Compress specification:

- Feature summary and rationale
- Scope decisions locked with the human at the start of this session (see below)
- Compression level parameters (Low/Recommended/High → max DPI + JPEG quality table)
- Image color-space/filter scope for v1 (RGB/Grayscale JPEG + Flate raw bitmap only; CMYK/Indexed/JPX/CCITT deferred)
- Full Prisma schema diff for the `Job` model
- Complete API contract for all three endpoints (upload, status, download) with all request/response shapes and error codes, including the new `UNSUPPORTED_ENCRYPTED_PDF` and `INVALID_COMPRESSION_LEVEL` error codes
- Worker specification (queue name, concurrency, retry policy, the image-recompression processing steps, logging requirements, and the Session 020 API-spike risk)
- Frontend specification (single-file dropzone + level selector, same four-state machine as Merge/Split)
- 40 acceptance criteria covering upload, processing, download, error handling, API, and quality

### Scope Decisions Locked (made with the human before drafting the spec)

| Decision | Choice | Rationale |
|---|---|---|
| Compression levels | Three fixed presets (Low/Recommended/High) | Matches category convention; avoids open-ended slider complexity |
| Image color-space/filter scope (v1) | RGB/Grayscale JPEG (`DCTDecode`) + Flate raw bitmap only | CMYK/Indexed/JPX/CCITT round-tripping is materially harder and not required for a useful v1 — explicitly documented as a known limitation, not a silent gap |
| Encrypted PDF handling | Explicit `400 UNSUPPORTED_ENCRYPTED_PDF` at upload | Foreseeable input for a compress tool; fail fast rather than a generic error |
| Output delivery | Single PDF, reusing `Job.outputKey` | Compress is one-file-in/one-file-out, same shape as Merge — no schema branching |
| Output size reduction display | Out of scope for v1 | Would require new status-response fields no other job type needs yet (YAGNI) |

### Schema Migration Applied

- `prisma/schema.prisma`: added `COMPRESS` to the `JobType` enum; added new `CompressionLevel` enum (`LOW | RECOMMENDED | HIGH`); added `Job.compressionLevel: CompressionLevel?`
- Migration `20260701060835_add_compress_job_type` generated and applied against the local PostgreSQL instance via `prisma migrate dev`
- `packages/shared/src/types/job.ts`: added `JobType.COMPRESS`, `CompressionLevel` enum, and a new `CompressJobPayload` type (`{ jobId, inputKey, level }`), exported from `packages/shared/src/index.ts`
- `npm run typecheck` verified clean across all three packages (`@ilovepdf/shared`, `@ilovepdf/web`, `@ilovepdf/worker`) after the change

Same narrow scope precedent as Split's Session 011: the schema/type change is a direct, mechanical consequence of the spec with no business logic attached, so it's included in this planning session rather than deferred.

### Session Roadmap Approved

| Session | Title |
|---|---|
| 018 | Planning, ADR-006 & Acceptance Criteria (this session) |
| 019 | Compress API (`POST /api/compress/jobs`, validation) |
| 020 | Worker: pdf-lib Image Extraction + Sharp Recompression Processor |
| 021 | Frontend: `/compress` Upload, Level Selector, Polling & Download UI |
| 022 | E2E Tests, Polish & Definition of Done |

Same 5-session shape as Split — no new infrastructure required, only a new worker dependency (Sharp) and processor logic.

### Feature Branch Created

`feature/pdf-compress` created from `develop` (already in sync, no fast-forward needed).

---

## Key Decisions Made This Session

### Why pdf-lib + Sharp instead of staying pdf-lib-only

A pdf-lib-only compressor would only recover object-table/duplicate-object overhead — typically low single-digit percent, near-zero on the common case of image-heavy PDFs (scanned documents, photo reports). That would ship a feature that doesn't do what "Compress" implies to users. Sharp was already the documented future choice for image work (earmarked for PDF-to-Image, backlog #5); this decision pulls that choice forward rather than opening a new architectural fork.

### Why CMYK/Indexed/JPX/CCITT images are out of scope for v1

Reliably round-tripping those color spaces and filters through Sharp is materially harder than the RGB/Grayscale JPEG and Flate-bitmap case — different channel counts, different decode paths, more edge cases in reconstructing a valid XObject afterward. Deferring keeps the first implementation tractable (YAGNI) while being explicit in the spec that these images are skipped, not silently mishandled.

### Why compression levels are three fixed presets, not a slider

An open-ended quality/DPI slider would multiply the UI and testing surface (validating arbitrary numeric ranges, defining behavior at extremes) for value not yet requested. Three presets match the pattern users expect from this tool category and keep the API contract (`level: LOW | RECOMMENDED | HIGH`) simple to validate and test exhaustively.

### Why encrypted PDFs get an explicit error code instead of falling through to a generic failure

Unlike a corrupted file (an edge case), a password-protected PDF is a routine, foreseeable input for a compression tool — users often want to shrink exactly the kind of scanned/protected documents that get encrypted. A named `UNSUPPORTED_ENCRYPTED_PDF` error gives the frontend (and the user) an accurate, specific message instead of a generic "something went wrong."

---

## Risks Identified

1. **pdf-lib low-level API surface not yet spiked (highest risk):** The processing steps in `wiki/active-feature.md` describe the intended pipeline (enumerate XObjects via `PDFDocument.context`, extract/replace raw stream bytes) based on how pdf-lib's object model works in general, but this has not been verified against the specific installed `pdf-lib@^1.17.1` API. Session 020 opens with a short proof-of-concept spike against a real fixture PDF before committing to the full processor. If the public API doesn't expose enough to safely mutate stream dictionaries in place, the worker spec (and possibly ADR-006's implementation notes) will need revisiting before that session proceeds further.

2. **Sharp native binary compatibility:** Sharp ships prebuilt native binaries per platform/architecture. Local dev is native (no Docker, per ADR-004), so this should be a non-issue for the dev machine, but is worth a sanity check (`npm install` + a trivial `sharp()` call) early in Session 020 rather than assuming it away.

3. **Combined pdf-lib + Sharp memory usage:** A Compress job holds the source PDF, decoded image buffers, and Sharp's internal buffers simultaneously. Worker concurrency remains 2 by default, same mitigation as Merge/Split's equivalent risk. Should be monitored if large, image-heavy PDFs near the 50MB limit turn out to be slow or memory-heavy in practice.

4. **No new infrastructure risk beyond the new dependency:** Unlike Merge's Session 002 risks (Docker image, MinIO, BullMQ), this feature introduces no new infrastructure — those risks remain accepted from Merge and are not re-litigated here.

---

## Next Steps

**Session 019: Compress API**

Deliverables:
- `POST /api/compress/jobs` route handler — multipart parsing, magic-byte validation, encrypted-PDF detection (pdf-lib load failure → `UNSUPPORTED_ENCRYPTED_PDF`), `level` validation (default to `RECOMMENDED`), job creation, BullMQ enqueue
- Unit/integration tests for every error code in the API contract (`FILE_REQUIRED`, `INVALID_FILE_TYPE`, `FILE_TOO_LARGE`, `INVALID_COMPRESSION_LEVEL`, `UNSUPPORTED_ENCRYPTED_PDF`)

End state: `npm run typecheck` and `npm run lint` exit 0; new tests pass; manual `curl` verification of the success and error paths.

---

*Session note written by: Claude Code (claude-sonnet-5)*
*Next session: Session 019 — Compress API*
