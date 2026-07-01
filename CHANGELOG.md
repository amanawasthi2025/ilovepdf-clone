# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) conventions.
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.3.0] — 2026-07-01

### Added (PDF Compress — In Progress)

**Session 018 — Planning, ADR-006 & Acceptance Criteria (2026-07-01)**
- `wiki/active-feature.md` — complete PDF Compress spec (compression level presets and parameters, image color-space/filter scope, job lifecycle, API contract, worker spec including the image recompression pipeline, frontend state machine, 40 ACs)
- `docs/adr/006-sharp-image-recompression.md` — Decision: pdf-lib + Sharp for image recompression (rejected pdf-lib-only for insufficient compression, rejected Ghostscript for reversing ADR-001's system-dependency/AGPL rejection)
- `prisma/schema.prisma` — added `COMPRESS` to `JobType` enum, added `CompressionLevel` enum (`LOW | RECOMMENDED | HIGH`), added `Job.compressionLevel: CompressionLevel?`; migration `20260701060835_add_compress_job_type` applied
- `packages/shared/src/types/job.ts` — added `JobType.COMPRESS`, `CompressionLevel` enum, and `CompressJobPayload` type
- 5-session implementation breakdown (Sessions 018–022)
- Risk flagged for Session 020: exact low-level pdf-lib API for mutating image XObject stream bytes needs a proof-of-concept spike before the full processor is written

---

## [0.2.2] — 2026-07-01

### Changed

**Session 017 — Remove CI/CD and CodeRabbit (2026-07-01)**
- Removed `.github/workflows/ci.yml`, `.github/workflows/process-coderabbit.yml`, `.coderabbit.yaml`, and the now-empty `.github/` directory — see ADR-005
- Updated `develop`/`master` GitHub branch protection: dropped the required "Typecheck, Lint & Test" status check and set required approving reviews to 0; a PR is still required to merge, no force-pushes/deletions allowed
- `CLAUDE.md`, `PROJECT.md`, `wiki/development-workflow.md`, `wiki/testing-strategy.md` updated to describe manual, local quality gates (`npm run typecheck`/`lint`/`test`, `npx playwright test`) run before opening and before merging every PR, replacing the automated CI/CodeRabbit gates
- CodeRabbit GitHub App installation uninstalled by the user via GitHub's UI (not reachable via API — `gh api` confirmed both `repos/.../installation` and `user/installations` require GitHub-App-issued OAuth tokens, not a personal access token). `docs/adr/005-remove-cicd-coderabbit.md` updated to reflect this; CodeRabbit is now fully removed, not just de-configured
- No application code changes

## [0.2.1] — 2026-07-01

### Changed

**Session 016 — Remove Docker, Native Local Dev (2026-07-01)**
- Removed `docker-compose.yml`, `docker/` (`Dockerfile.web`, `Dockerfile.worker`), `.dockerignore` — local development infrastructure (PostgreSQL, Redis, MinIO) now runs natively instead of in containers; see ADR-004
- No application code changes — `apps/web` and `apps/worker` already ran natively via `npm run dev`, and the S3-compatible storage client is unaffected (still MinIO, just not containerized)
- Updated `PROJECT.md`, `wiki/architecture.md`, `wiki/development-workflow.md`, and `wiki/testing-strategy.md` to describe native local services instead of Docker Compose
- `wiki/architecture.md`'s "Production (Target)" deployment section changed from an assumed containerized deployment to explicitly TBD — no production deployment exists yet, so this is left undecided rather than replaced with new speculative infrastructure

## [0.2.0] — 2026-07-01

### Added (PDF Split — Complete ✅)

**Session 015 — E2E Tests, Polish & Definition of Done (2026-07-01)**
- `apps/web/e2e/split.spec.ts` — 3 Playwright E2E tests: full happy-path flow (upload 10-page PDF → ranges `1-3,4-6,7-10` → DONE → download ZIP → verify 3 entries with correct page counts via pdf-lib → reset to IDLE), `RANGE_OUT_OF_BOUNDS` error banner path, and AC-21 (job FAILED after being queued → ERROR state → "Try again" resets to IDLE)
- AC-21 verification note: a corrupted PDF cannot reach the worker as a post-queue failure, because `POST /api/split/jobs` runs the identical magic-bytes + pdf-lib load check the worker runs, rejecting corrupt files with `400` before a job is ever enqueued (the worker-side FAILED unit tests in `split.test.ts` already cover that path). The E2E test instead seeds a `FAILED` job directly via Prisma and intercepts the upload POST to point at it, exercising the real `GET /status` route and the page's real polling/ERROR-state/reset code — the part of AC-21 that actually lives in this app
- Full 38-item acceptance criteria checklist in `wiki/active-feature.md` walked and verified (dropzone/validation/state-machine via code + existing unit tests, API contracts via `route.test.ts` suites, worker FAILED handling via `split.test.ts`, happy/error/AC-21 paths via the new E2E tests)
- Final quality gates: `npm run typecheck` (0 errors, 3 workspaces), `npm run lint` (0 errors/warnings, 3 workspaces), `npm run test` (75/75 — 9 worker, 66 web), `npx playwright test` (4/4 — 1 merge, 3 split)

**Session 014 — Frontend: `/split` Upload, Polling & Download UI (2026-07-01)**
- `apps/web/app/split/page.tsx` — `/split` route; client component implementing the IDLE → UPLOADING → PROCESSING → DONE/ERROR state machine from `wiki/active-feature.md`
- Single-file dropzone via `react-dropzone` (`multiple: false`); accepts `application/pdf` only; 50 MB cap enforced at drop time with inline error messages; selected file shown with filename, formatted size, and a remove (×) button
- Page-ranges text input with inline client-side syntax validation (`^\d+-\d+(,\d+-\d+)*$`); Split button disabled until a file is selected and ranges syntax is valid
- PROCESSING state: spinner with range count ("Creating N PDFs"); reuses the TanStack Query polling pattern from Merge (`refetchInterval: 2000`, stops on `COMPLETED`/`FAILED`)
- DONE state: success message, "Download ZIP" button (fetches pre-signed URL, triggers browser download), "Split another PDF" resets to IDLE
- ERROR state: shows `errorMessage` from a failed job or a generic fallback; "Try again" resets to IDLE
- On API error during UPLOADING, returns to IDLE with an error banner without clearing the selected file (covers `RANGE_OUT_OF_BOUNDS`, which can only be caught server-side)
- `apps/web/app/split/validation.ts` — `formatBytes()`, `MAX_FILE_SIZE_BYTES`, `isValidRangesSyntax()`; `apps/web/app/split/validation.test.ts` — 16 unit tests
- Manually verified against a running local stack with Playwright: happy path (valid ranges → DONE → downloaded ZIP with correct page counts per range) and the `RANGE_OUT_OF_BOUNDS` error path (error banner shown, selected file retained, button returns to IDLE)
- Formal acceptance-criteria sign-off deferred to Session 015 (E2E Tests, Polish & Definition of Done), same pattern as Merge's Session 010

**Session 013 — Worker: pdf-lib Split Processor + jszip Archive (2026-07-01)**
- `apps/worker/src/jobs/split.ts` — `processSplitJob()`: downloads the single input PDF from MinIO, validates magic bytes, parses the already-validated `ranges` string, builds one `PDFDocument` per range via pdf-lib, archives all outputs into a ZIP with `jszip` (ADR-003) named `split-<start>-<end>.pdf`, uploads the ZIP, updates job status to COMPLETED or FAILED
- `apps/worker/src/jobs/split.test.ts` — 5 unit tests (page-index extraction per range + ZIP entry naming, magic-bytes failure, pdf-lib load failure, MinIO upload failure, ZIP generation failure)
- `apps/worker/src/index.ts` — registers the `split` job name on the shared `document-processing` Worker alongside `merge`
- `apps/worker/package.json` — added `jszip` as an explicit dependency
- Manually verified end-to-end against a running local stack: real 10-page PDF split into ranges `1-3,4-6,7-10`, downloaded ZIP confirmed to contain 3 correctly-named PDFs with 3/3/4 pages respectively
- **Fixed:** `apps/web/lib/storage.ts`'s `getPresignedDownloadUrl()` no longer hardcodes a `merged-<date>.pdf` filename (a Session 012 bug surfaced by this session's manual verification — Split downloads were getting a `.pdf` filename on what is actually a `.zip`); now takes the filename as a parameter, set per-route to `merged-<date>.pdf` (Merge) or `split-<date>.zip` (Split)

**Session 012 — Split API (2026-07-01)**
- `POST /api/split/jobs` — single-file upload + page-range validation, enqueues a `split` job on `document-processing`
- `apps/web/lib/ranges.ts` — `parseAndValidateRanges()` pure function; 10 unit tests
- `GET /api/split/jobs/:jobId/status` and `.../download` — copied verbatim from Merge's generic equivalents
- `apps/web/package.json` — added `pdf-lib` as an explicit dependency

**Session 011 — Planning, ADR-003 & Acceptance Criteria (2026-07-01)**
- `wiki/active-feature.md` — complete PDF Split spec (page-range constraints, job lifecycle, 3 API contracts, worker spec including ZIP step, frontend state machine, 38 ACs)
- `docs/adr/003-zip-archive-library.md` — Decision: jszip (rejected archiver, adm-zip)
- `prisma/schema.prisma` — added `SPLIT` to `JobType` enum, added `Job.splitRanges: String?`; migration `20260630190347_add_split_job_type` applied
- `packages/shared/src/types/job.ts` — added `JobType.SPLIT` and `SplitJobPayload` type
- 5-session implementation breakdown (Sessions 011–015)

---

## [0.1.0] — 2026-06-30

### Added (PDF Merge — Complete ✅)

**Session 010 — E2E Tests, Polish & Definition of Done (2026-06-30)**
- `apps/web/playwright.config.ts` — Playwright config targeting `http://localhost:3000`; Chromium only; `acceptDownloads: true`; 120 s test timeout, 60 s assertion timeout
- `apps/web/e2e/tsconfig.json` — separate TypeScript config for e2e tests (CommonJS, `moduleResolution: node`)
- `apps/web/e2e/merge.spec.ts` — Playwright E2E test covering the full upload → poll → download flow: generates two valid PDFs with pdf-lib, uploads via the react-dropzone hidden input, waits for PROCESSING then DONE state, captures the browser download, verifies the file begins with `%PDF`, and confirms "Merge more PDFs" resets to IDLE
- `apps/web/tsconfig.json` — added `e2e` to `exclude` so E2E test files are not included in `tsc --noEmit`
- `"test:e2e": "playwright test"` script added to `apps/web/package.json`
- All 36 acceptance criteria verified; 25 Vitest unit/integration tests passing; `typecheck` and `lint` clean

**Session 002 — Planning & ADRs (2026-06-30)**
- `wiki/active-feature.md` — complete PDF Merge spec (file constraints, job lifecycle, 3 API contracts, worker spec, frontend state machine, 36 ACs)
- `docs/adr/001-pdf-processing-library.md` — Decision: pdf-lib (rejected Ghostscript, PyPDF2, MuPDF)
- `docs/adr/002-monorepo-structure.md` — Decision: Turborepo (rejected separate repos, Nx)
- 9-session implementation breakdown (Sessions 002–010)

---

**Session 003 — Monorepo Scaffolding (2026-06-30)**
- Turborepo monorepo with `apps/web`, `apps/worker`, `packages/shared`
- Next.js 14 (App Router, TypeScript, Tailwind CSS) in `apps/web`
- `apps/worker` TypeScript service stub with SIGTERM/SIGINT handling
- `packages/shared` with `JobStatus`, `JobType`, and `MergeJobPayload` types
- `docker-compose.yml` — 5 services: web, worker, postgres, redis, minio (all with health checks)
- Dev Dockerfiles for web and worker
- Vitest configured for both apps

**Session 009 — Frontend Status Polling & Download (2026-06-30)**
- `app/providers.tsx` — `'use client'` `QueryClientProvider` wrapper; `retry: false`, `staleTime: 0`
- `app/layout.tsx` — wraps `<body>` children with `<Providers>` for app-wide TanStack Query access
- `app/merge/page.tsx` — replaced PROCESSING stub with TanStack Query `useQuery` polling `GET /api/merge/jobs/:jobId/status` every 2 seconds; polling stops automatically on `COMPLETED` or `FAILED`
- DONE state: success checkmark, "Your PDFs have been merged successfully", download button (calls `GET /api/merge/jobs/:jobId/download` → pre-signed URL → browser download), "Merge more PDFs" link resets to IDLE
- ERROR state: error icon, "Merge failed", `errorMessage` from API or generic fallback, "Try again" button resets to IDLE
- Phase type expanded: `'IDLE' | 'UPLOADING' | 'PROCESSING' | 'DONE' | 'ERROR'`

**Session 008 — Frontend Upload UI (2026-06-30)**
- `app/merge/page.tsx` — `/merge` route; client component with IDLE → UPLOADING → PROCESSING state machine
- Dropzone: drag-and-drop + click-to-browse via `react-dropzone`; accepts `application/pdf` only; 50 MB per-file cap enforced at drop time with inline error messages
- File list: sortable via `@dnd-kit/sortable` drag-and-drop + up/down buttons; per-file remove (×) button; filename + formatted size displayed
- Merge button: disabled when fewer than 2 files; shows spinner during UPLOADING; re-enables and shows error banner on API failure
- `app/merge/validation.ts` — `formatBytes()` utility + shared constants (`MAX_FILE_SIZE_BYTES`, `MAX_FILES`, `MIN_FILES`)
- `app/merge/validation.test.ts` — 9 unit tests for `formatBytes` and constants
- PROCESSING state stub (spinner + file count) ready for Session 009 to replace with polling UI

**Session 007 — Job Status & Download API (2026-06-30)**
- `GET /api/merge/jobs/:jobId/status` — polls job status from PostgreSQL; returns `{ jobId, status, createdAt, updatedAt, errorMessage }` or 404 `JOB_NOT_FOUND`
- `GET /api/merge/jobs/:jobId/download` — issues a 5-minute pre-signed MinIO URL for COMPLETED jobs; returns 409 `JOB_NOT_COMPLETE` (with current status) for non-COMPLETED jobs, 404 `JOB_NOT_FOUND` for unknown IDs
- `apps/web/lib/storage.ts` — added `getPresignedDownloadUrl()` using `@aws-sdk/s3-request-presigner`; sets `Content-Disposition: attachment; filename="merged-YYYY-MM-DD.pdf"` via `ResponseContentDisposition`
- 7 new unit tests (3 for status endpoint, 4 for download endpoint); total web test count: 16

**Session 006 — Worker & pdf-lib Merge Processor (2026-06-30)**
- `apps/worker/src/lib/env.ts` — Zod-validated env config for the worker (DATABASE_URL, REDIS_URL, MINIO_*, WORKER_CONCURRENCY)
- `apps/worker/src/lib/logger.ts` — pino logger singleton
- `apps/worker/src/lib/storage.ts` — S3Client + `downloadFile()` + `uploadFile()`
- `apps/worker/src/lib/db.ts` — Prisma singleton
- `apps/worker/src/jobs/merge.ts` — `processMergeJob()`: downloads PDFs from MinIO, validates magic bytes, merges with pdf-lib, uploads output, updates job status to COMPLETED or FAILED
- `apps/worker/src/jobs/merge.test.ts` — 4 unit tests (happy path + magic bytes failure + pdf-lib error + upload error)
- `apps/worker/src/index.ts` — BullMQ Worker wiring with concurrency, SIGTERM/SIGINT graceful shutdown
- `packages/shared/package.json` — updated exports to use compiled dist (enables NodeNext module resolution for the worker)

**Session 004 — Database Schema & Health Endpoint (2026-06-30)**
- `prisma/schema.prisma` — Job model with all fields from spec
- `apps/web/lib/db.ts` — Prisma singleton + `checkDatabaseConnection()` helper
- `GET /api/health` — returns 200 ok or 503 degraded based on DB reachability
- `prisma/migrations/20260630141036_init` — initial migration applied to PostgreSQL
- `.env` for local dev (gitignored) with all service connection strings
- 2 unit tests covering both health states

---

## [0.0.1] — 2026-06-30

### Added
- Project repository initialized and pushed to GitHub (public)
- `CLAUDE.md` — Claude Code operating manual
- `PROJECT.md` — Product and engineering handbook
- `TASKS.md` — Feature tracker with 15-item backlog
- `CHANGELOG.md` — Release history
- `wiki/` — 10-document long-term knowledge base (architecture, coding standards, workflow, testing strategy, roadmap, decisions, lessons learned)
- `docs/adr/` — Architectural Decision Records directory with template
- `docs/session-notes/` — Engineering journal with Session 001 note
- `.gitignore` — Standard Node.js/Next.js ignores
- Technology stack selected and fully justified
- Development process and Git workflow defined
- PDF Merge identified and approved as Feature 1

---

*This file is updated at the completion of every feature.*
