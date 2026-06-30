# Session Note: Session 013 — Worker: pdf-lib Split Processor + jszip Archive

**Date:** 2026-07-01
**Session Goal:** Implement `processSplitJob()` in `apps/worker`, register it on the shared `document-processing` queue, and cover it with unit tests, per the worker spec locked in Session 011 and ADR-003.
**Status:** COMPLETE ✅

---

## What Was Done

### `apps/worker/package.json`
Added `jszip@^3.10.1` as an explicit dependency (ships its own TypeScript types — no `@types/jszip` needed).

### `apps/worker/src/jobs/split.ts` (new)
`processSplitJob(job: Job<SplitJobPayload>)`, mirroring `processMergeJob()`'s shape:
1. Load the `Job` row for `correlationId`/logging context, update status → `PROCESSING`
2. Download the single input PDF, validate `%PDF` magic bytes
3. Load it once with `pdf-lib`
4. Parse the `ranges` string (`"1-3,4-6,7-10"`) into `{ start, end }` pairs — a trusted parse, since the API already validated syntax and bounds in Session 012; no re-validation here
5. For each range: create a fresh `PDFDocument`, `copyPages()` the corresponding 0-indexed page range from the source, save to `Uint8Array`
6. Add each range's bytes to a `JSZip` instance under `split-<start>-<end>.pdf`, generate the archive as a `Buffer` (`generateAsync({ type: 'nodebuffer' })`)
7. Upload the ZIP to `outputs/<uuid>.zip`, update Job → `COMPLETED` with `outputKey`
8. On any error: update Job → `FAILED` with `errorMessage`, rethrow (same contract as Merge, so BullMQ's retry/backoff applies)

### `apps/worker/src/jobs/split.test.ts` (new)
5 unit tests, same `vi.mock` harness pattern as `merge.test.ts` (mocks `db`, `storage`, `logger`, `pdf-lib`; `jszip`'s default export mocked separately):
- Page-index extraction is correct per range (`copyPages` called with `[0,1]` for `1-2`, `[2]` for `3-3`) and the ZIP gets one entry per range with the correct `split-<start>-<end>.pdf` name
- `FAILED` on invalid magic bytes
- `FAILED` when pdf-lib fails to load the source PDF
- `FAILED` when the MinIO upload of the ZIP throws
- `FAILED` when ZIP generation (`generateAsync`) throws

### `apps/worker/src/index.ts`
Widened the `Worker<MergeJobPayload>` to `Worker<MergeJobPayload | SplitJobPayload>` and added a `job.name === 'split'` branch dispatching to `processSplitJob()`, alongside the existing `merge` branch. Unrecognized job names still log a warning and are skipped, unchanged from Session 006.

### Tests & Quality Gates
- `npm run typecheck` — 0 errors, all 3 packages
- `npm run lint` — 0 errors/warnings, all 3 packages (one lint fix needed: `expect.stringContaining(...)` inside an object literal tripped `@typescript-eslint/no-unsafe-assignment`; switched to the same `updateCalls.find(...)` + `toContain()` pattern already used in `merge.test.ts`)
- `npm run test` — 59 tests pass (9 in `apps/worker`, 50 in `apps/web`)

### Manual Verification — Performed

Initial attempt found the local Docker daemon unreachable from the Claude Code shell (group-membership and sudo-session limits in this environment — see Issues Encountered). The user started the infra containers from their own terminal (`sudo docker compose up -d postgres redis minio`, all already healthy), then ran `npm run dev` locally for both `apps/web` and `apps/worker` against `.env`.

End-to-end check performed:
1. Generated a real 10-page PDF with pdf-lib
2. `POST /api/split/jobs` with `ranges=1-3,4-6,7-10` → `202 { jobId }`
3. Worker log showed the job processed immediately, with `correlationId`, `jobId`, `jobType: SPLIT` on every line per the logging convention
4. `GET .../status` → `COMPLETED`
5. `GET .../download` → pre-signed URL; downloaded ZIP contains exactly `split-1-3.pdf`, `split-4-6.pdf`, `split-7-10.pdf`
6. Extracted and re-opened each PDF with pdf-lib: page counts are 3, 3, 4 — exactly matching the requested ranges

AC-16/17/18 confirmed against the running stack. Also re-ran the same flow against Merge as a regression check after the bug fix below (see next section) — `merged-<date>.pdf` filename unaffected.

### Bug Found & Fixed: Download Filename Wrong for Split Jobs

`apps/web/lib/storage.ts`'s `getPresignedDownloadUrl()` hardcoded `Content-Disposition: attachment; filename="merged-${date}.pdf"`, written for Merge in Session 007. Session 012 copied the Split download route verbatim from Merge's, which meant Split's pre-signed URLs also forced a `.pdf` filename — contradicting the locked API contract (`wiki/active-feature.md`: `filename="split-YYYY-MM-DD.zip"`) and effectively mislabeling the downloaded ZIP. Caught during this session's manual verification (live `curl` showed `filename%3D%22merged-2026-06-30.pdf%22` on a Split download).

Fix (confirmed with the user before applying, since it's Session 012 code, not Session 013's worker):
- `getPresignedDownloadUrl(key, filename)` now takes the filename as a parameter instead of hardcoding it
- Merge's download route passes `merged-${date}.pdf`; Split's passes `split-${date}.zip`
- Updated both routes' existing tests to assert the correct filename argument
- Re-verified live: Split download now shows `filename%3D%22split-2026-06-30.zip%22`; Merge regression-checked and still shows `filename%3D%22merged-2026-06-30.pdf%22`

---

## Design Decisions

### Range string re-parsed locally in the worker, not imported from `apps/web/lib/ranges.ts`

`apps/web/lib/ranges.ts` combines parsing with validation (syntax + bounds), which the worker doesn't need — the API already validated the string before enqueueing. The worker only needs the two-line split-and-map back into `{ start, end }` pairs. Promoting this to `packages/shared` for one trivial, asymmetric use on each side was judged premature (YAGNI) — the existing `apps/web` validator stays where it is, and the worker keeps a small private `parseRanges()`.

### One `PDFDocument` per range, not one shared output document

Unlike Merge (which builds a single merged `PDFDocument`), Split needs N independent output files, so each range gets its own `PDFDocument.create()` → `copyPages()` → `save()` cycle, with bytes added directly to the `JSZip` instance as they're produced.

---

## Issues Encountered

- ESLint flagged `expect.stringContaining(...)` (returns `any`) when used inline inside a mock-call object literal; resolved by matching the existing `merge.test.ts` assertion style instead (extract the matching update call, assert on `errorMessage` with `toContain()`).
- Docker daemon was reachable on the host (snap-packaged `snap.docker.dockerd.service`, already active) but not from the Claude Code shell: the invoking user's `docker` group membership only takes effect on a fresh login, and there is no cached `sudo` credential available to non-interactive shells in this environment, and `newgrp`/`sg` are not installed. Worked around it by having the user run `docker compose` commands directly via the `!` prefix in their own terminal/session, where `sudo` could prompt interactively.
- Found and fixed a Session 012 bug along the way (wrong `Content-Disposition` filename for Split downloads) — see above.

---

## Next Steps

**Session 014: Frontend — `/split` Upload, Polling & Download UI**

- Build the `/split` route per the frontend spec in `wiki/active-feature.md` (single-file dropzone, page-ranges input, IDLE → UPLOADING → PROCESSING → DONE/ERROR state machine, TanStack Query polling)

---

*Session note written by: Claude Code (claude-sonnet-5)*
*Next session: Session 014 — Frontend: `/split` Upload, Polling & Download UI*
