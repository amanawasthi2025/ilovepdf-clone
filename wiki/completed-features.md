# Wiki: Completed Features

> A running log of every feature that has been completed and merged.
> Each entry should summarize what was built, what decisions were made, and any lessons learned.

---

## Feature Log

| # | Feature | Completed | Version | Notes |
|---|---|---|---|---|
| 0 | Project Initialization & Engineering Foundation | 2026-06-30 | v0.0.1 | Docs, stack decisions, process. No app code. |
| 1 | PDF Merge | 2026-06-30 | v0.1.0 | Full upload → worker → download pipeline; 36 ACs verified; 25 unit tests + 1 Playwright E2E test. |
| 2 | PDF Split | 2026-07-01 | v0.2.0 | Custom page-range split, ZIP archive output; 38 ACs verified; 75 unit tests + 4 Playwright E2E tests. |

---

## Entry Template

When a feature is completed, add an entry in this format:

```
### Feature N: <Feature Name>
**Completed:** YYYY-MM-DD
**Version:** v0.X.Y
**Branch:** feature/<name>
**PR:** #<number>

#### What Was Built
<1-3 sentence description of what the feature does and what was implemented>

#### Key Decisions
- <Decision made during implementation with brief justification>
- <Another decision>

#### Tests Added
- <Unit tests: describe what was tested>
- <Integration tests: describe what was tested>
- <E2E tests: describe what was tested>

#### Known Limitations
- <Any intentional limitations or deferred scope>

#### Lessons Learned
- <Something that surprised you, or a technique that worked well>
```

---

---

### Feature 1: PDF Merge
**Completed:** 2026-06-30
**Version:** v0.1.0
**Branch:** feature/pdf-merge

#### What Was Built
Users can upload 2–10 PDF files through a drag-and-drop browser interface, have them merged server-side in the order specified, and download the result — all without authentication. The full pipeline covers file upload API, BullMQ job queue, pdf-lib worker processor, MinIO object storage, and a React frontend with real-time polling.

#### Key Decisions
- pdf-lib over Ghostscript/PyPDF2 — pure JS, no system binary dependencies (ADR-001)
- Turborepo monorepo (`apps/web`, `apps/worker`, `packages/shared`) — single repo for atomic commits across the pipeline (ADR-002)
- `jobId` as anonymous access token — no auth complexity for MVP; possession of the CUID is sufficient to poll and download
- Pre-signed MinIO URL for download — avoids streaming through the API server; client downloads directly from object storage
- TanStack Query `useQuery` with `refetchInterval` for polling — idiomatic; `select` callback drives phase transitions synchronously

#### Tests Added
- 25 Vitest unit/integration tests: health endpoint (2), file upload API (7), job status endpoint (3), download endpoint (4), merge processor (4), frontend validation (9)
- 1 Playwright E2E test: upload 2 PDFs → poll → DONE state → download → verify `%PDF` magic bytes → reset to IDLE

#### Known Limitations
- No TTL enforcement: `expiresAt` is stored on the Job record but no cleanup worker exists yet; files persist until MinIO storage pressure
- No rate limiting: deferred until user authentication is introduced
- Worker concurrency: fixed at 2 by default (`WORKER_CONCURRENCY` env var); no auto-scaling

#### Lessons Learned
- react-dropzone's hidden `<input type="file">` is directly settable with Playwright's `setInputFiles()` even though it has no visible interaction target
- TanStack Query `select` callback runs synchronously after each fetch — better for phase transitions than a `useEffect` watching `data` (avoids a render cycle of lag)
- Excluding the `e2e/` directory from the main `tsconfig.json` and giving it a separate `tsconfig.json` with `moduleResolution: node` is the cleanest way to support Playwright tests in a Next.js workspace without polluting the app's typecheck

---

### Feature 2: PDF Split
**Completed:** 2026-07-01
**Version:** v0.2.0
**Branch:** feature/pdf-split

#### What Was Built
Users can upload a single PDF and a comma-separated list of custom page ranges (e.g. `1-3,4-6,7-10`) through a browser interface, have the server split it into one output PDF per range, package the outputs into a ZIP archive, and download it — no authentication required. Reuses the full Merge pipeline (upload API → BullMQ queue → pdf-lib worker → MinIO storage → polling frontend) with no new infrastructure.

#### Key Decisions
- Custom page ranges only as the split mode — simplest, highest-value single mode; "split every N pages" and "extract every page" explicitly deferred until requested
- Single ZIP archive as output, reusing the existing `Job.outputKey` field unchanged — no schema branching for single-file vs multi-file jobs
- Range bounds validated synchronously at the upload API (pdf-lib loads the PDF to get the real page count) before enqueueing — fail-fast UX, and means a job can only reach the worker with already-valid ranges
- `jszip` (ADR-003) for archiving — in-memory async API matches the worker's existing Buffer-in/Buffer-out pattern
- `Job.splitRanges` persisted as a column (not just passed via the BullMQ payload) — durable record for observability/debugging, consistent with Job being the source of truth for what was requested

#### Tests Added
- 75 Vitest unit/integration tests across the monorepo (9 worker, 66 web), including 16 for ranges-syntax client validation and 10 for the `parseAndValidateRanges()` server-side validator
- `apps/worker/src/jobs/split.test.ts` — 5 tests covering the FAILED-on-error paths (invalid magic bytes, pdf-lib load failure, MinIO upload failure, ZIP generation failure) plus the happy-path page-extraction/ZIP-naming logic
- 3 Playwright E2E tests (`apps/web/e2e/split.spec.ts`): full happy-path flow (upload → ranges → DONE → download ZIP → verify per-range page counts → reset), `RANGE_OUT_OF_BOUNDS` error-banner path, and AC-21 (job FAILED after being queued → ERROR state → reset)

#### Known Limitations
- Same as Merge: no TTL cleanup worker, no rate limiting, fixed worker concurrency
- A genuinely corrupted PDF can never reach the worker as a post-queue failure — the upload API performs the same magic-bytes + pdf-lib load check the worker does, so corrupt files are rejected with `400` before a job is ever enqueued. AC-21 ("job fails after being queued") is therefore only reachable in practice via infrastructure failures (MinIO/ZIP errors), which the worker unit tests cover directly

#### Lessons Learned
- When an AC's example trigger ("e.g. corrupted PDF") turns out to be structurally unreachable through the real flow because an earlier validation layer already prevents it, the fix is to seed the failure state directly (here: a `Job` row written via Prisma plus a Playwright `page.route()` intercept on the upload POST) rather than contort the test into something flaky or skip the AC — this exercises the actual reachable code path (status endpoint + UI) deterministically
- `jszip`, like `pdf-lib` before it, is a direct dependency of `apps/worker` only but resolves fine from `apps/web/e2e/*.ts` via npm workspace hoisting to the root `node_modules` — no need to add it to `apps/web`'s own `devDependencies`
- Both `apps/web` and `apps/worker` dev servers need the root `.env` loaded explicitly when started from the host shell (`apps/worker` already does this via `node --env-file=../../.env`; `apps/web`'s plain `next dev` does not, since there is no `apps/web/.env` — Next.js does not walk up to a parent directory's `.env`)

---

*Last updated: 2026-07-01 — Session 015 (PDF Split Complete)*
