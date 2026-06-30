# Wiki: Completed Features

> A running log of every feature that has been completed and merged.
> Each entry should summarize what was built, what decisions were made, and any lessons learned.

---

## Feature Log

| # | Feature | Completed | Version | Notes |
|---|---|---|---|---|
| 0 | Project Initialization & Engineering Foundation | 2026-06-30 | v0.0.1 | Docs, stack decisions, process. No app code. |
| 1 | PDF Merge | 2026-06-30 | v0.1.0 | Full upload → worker → download pipeline; 36 ACs verified; 25 unit tests + 1 Playwright E2E test. |

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

*Last updated: 2026-06-30 — Session 010 (PDF Merge Complete)*
