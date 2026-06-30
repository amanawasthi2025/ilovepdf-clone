# Session Note: Session 002 — PDF Merge Planning

**Date:** 2026-06-30
**Session Goal:** Produce the complete, unambiguous specification for the PDF Merge feature — ADRs, acceptance criteria, API contract, database schema, worker spec, and frontend spec. No application code.
**Status:** COMPLETE ✅

---

## What Was Done

### ADRs Created

**ADR-001: PDF Processing Library** (`docs/adr/001-pdf-processing-library.md`)
- Decision: `pdf-lib` (pure JavaScript/TypeScript)
- Alternatives evaluated: Ghostscript CLI, PyPDF2/pypdf (Python), MuPDF/mupdf-js (WASM)
- Key rationale: zero system dependencies, TypeScript-native, in-process execution (fully unit-testable), covers all initially required operations (merge, split, rotate, watermark)
- Accepted limitation: no format conversion — LibreOffice headless will be added alongside pdf-lib when Feature 9 (PDF→Word) is needed

**ADR-002: Monorepo Structure** (`docs/adr/002-monorepo-structure.md`)
- Decision: Turborepo monorepo with `packages/shared`
- Alternatives evaluated: separate repositories, single package without tooling, Nx
- Key rationale: first-party Next.js recommendation, shared types without a publish step, task caching in CI, clean separation of deployment units

### Active Feature Spec Rewritten

`wiki/active-feature.md` now contains the complete PDF Merge specification:

- Feature summary and rationale
- File constraints (per-file 50MB, total 200MB, 2–10 files, PDF-only validated by magic bytes)
- Job lifecycle (PENDING → PROCESSING → COMPLETED / FAILED)
- Full Prisma schema for the `Job` model
- Complete API contract for all three endpoints (upload, status, download) with all request/response shapes and error codes
- Worker specification (queue name, concurrency, retry policy, processing steps, logging requirements)
- Frontend specification (four UI states: IDLE, UPLOADING, PROCESSING, DONE/ERROR; polling behaviour; client-side validation)
- 36 acceptance criteria covering upload, processing, download, error handling, API, and quality

### Open Questions Resolved

All five open questions from Session 001 that affect this feature are now answered:

| Question | Decision |
|---|---|
| File retention TTL | 1 hour, configurable via `FILE_TTL_SECONDS` |
| Anonymous session / rate limiting | Not implemented; `jobId` is the access token |
| Per-file size limit | 50MB |
| Total size limit | 200MB |
| Output filename | `merged-YYYY-MM-DD.pdf` via Content-Disposition |
| Merge order | Submission order; UI allows pre-submission reordering |

Three open questions remain open but do not affect this feature: deployment target, domain name, payment provider.

### Session Roadmap Approved

The following session breakdown was approved by the human at the start of this session:

| Session | Title |
|---|---|
| 002 | Planning, ADRs & Acceptance Criteria (this session) |
| 003 | Monorepo Scaffolding & Dev Environment |
| 004 | Database Schema & Health Endpoint |
| 005 | File Upload API |
| 006 | Worker & pdf-lib Merge Processor |
| 007 | Job Status & Download API |
| 008 | Frontend: Upload UI |
| 009 | Frontend: Status Polling & Download |
| 010 | E2E Tests, Polish & Definition of Done |

### Feature Branch Created

`feature/pdf-merge` created from `master`.

---

## Key Decisions Made This Session

### Why pdf-lib (ADR-001)

The initial three backlog features (merge, split, compress) are all purely PDF-to-PDF operations. pdf-lib handles all three without any system dependencies. The format conversion features (Feature 9+) are many sessions away; when they arrive, LibreOffice headless will be added as a second processor alongside pdf-lib.

The decisive factor over Ghostscript was the security surface: shell invocation with user-controlled filenames requires careful escaping. In-process pdf-lib eliminates that surface entirely.

### Why jobId-as-access-token

Without authentication, there is no session to tie a job to. Options were: IP-based rate limiting, anonymous session cookies, or no restriction. We chose no restriction for the first feature because:
1. The jobId is a CUID — 25 characters of random-ish characters; not guessable by enumeration
2. The download URL itself is a 5-minute pre-signed URL — window for abuse is narrow
3. Rate limiting adds complexity before we have validated that anyone is actually using the tool
4. This decision is explicitly revisited when authentication is introduced

### Why 1-hour TTL

One hour is long enough that a user who merges a file and gets interrupted can return and still download. It is short enough that storage costs are bounded. The value is communicated in the UI ("available for 1 hour") to set expectations.

TTL enforcement is intentionally deferred to a separate session — the `expiresAt` field is stored now so the cleanup worker can be built without a migration.

---

## Risks Identified

1. **pdf-lib memory usage:** pdf-lib loads the entire PDF into memory. At our 50MB per-file limit and up to 10 files, a single merge job could require ~500MB of worker memory in the worst case. Worker concurrency is limited to 2 (configurable) to bound total memory use. This should be monitored.

2. **Magic bytes validation:** MIME type headers sent by browsers are client-controlled and cannot be trusted. We rely on reading the first 4 bytes of each file to verify `%PDF`. This is performed in the API handler before storing the file — not after.

3. **MinIO pre-signed URL expiry:** The download URL is valid for 5 minutes. If the client fetches the download URL but then delays the actual download (e.g. slow connection, tab in background), the URL may expire. This is a known limitation; 5 minutes is generous for most cases.

4. **BullMQ job visibility:** If the worker crashes mid-job, the job will be stuck in PROCESSING indefinitely unless BullMQ's lock expiry mechanism reclaims it. BullMQ handles this automatically (lock timeout = 30 seconds by default). The Job record in PostgreSQL will eventually be updated when the worker retries.

---

## Next Steps

**Session 003: Monorepo Scaffolding & Dev Environment**

Deliverables:
- Turborepo root (`package.json`, `turbo.json`, base `tsconfig.json`)
- `packages/shared` — `JobStatus`, `JobType` enums and job payload types
- `apps/web` — Next.js 14, Tailwind, shadcn/ui, ESLint, Vitest
- `apps/worker` — bare Node.js TypeScript shell
- `docker-compose.yml` — five services (web, worker, postgres, redis, minio)
- `docker/Dockerfile.web` and `docker/Dockerfile.worker`
- `.env.example` with all required variables

End state: `docker compose up` → all services healthy; `curl localhost:3000` → 200; `npm run typecheck` and `npm run lint` exit 0.

---

*Session note written by: Claude Code (claude-sonnet-4-6)*
*Next session: Session 003 — Monorepo Scaffolding & Dev Environment*
