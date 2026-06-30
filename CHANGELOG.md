# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) conventions.
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added (PDF Split — In Progress 🚧)

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
