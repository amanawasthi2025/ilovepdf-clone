# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) conventions.
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.4.0] — 2026-07-01

### Added (User Authentication)

**Session 026 — E2E Tests, Polish & Definition of Done (2026-07-01)**
- `apps/web/e2e/auth.spec.ts` — 2 new Playwright E2E specs: full signup → login → nav-shows-logged-in-state → reload-persists-session → logout flow (AC-27), and duplicate-email-signup / wrong-password-login error states (AC-28). Each test creates its own uniquely-suffixed `User` and deletes it in a `finally` block, matching the try/finally seeded-row cleanup convention already used by `compress.spec.ts`
- Ran the full Definition of Done checklist against the real local stack (native Postgres/Redis/MinIO per ADR-004, `next dev`, worker `npm run dev`): `npm run typecheck` (0 errors), `npm run lint` (0 warnings/errors), `npm run test` (124/124 — 108 web + 16 worker), `npx playwright test` (13/13 — 2 new auth specs + 11 pre-existing Merge/Split/Compress specs, no regressions)
- All 28 acceptance criteria now verified — User Authentication is feature-complete
- `TASKS.md`, `wiki/active-feature.md`, `wiki/completed-features.md` updated to mark the feature Done; Current Feature reset to none pending explicit approval for the next feature (per the One-Feature-at-a-Time Rule)

**Session 025 — Frontend: `/signup`, `/login`, session-aware nav (2026-07-01)**
- `apps/web/app/signup/page.tsx` + `validation.ts`/`.test.ts` — signup form; submit disabled until email (Zod `.email()`, mirrors the API) and password (8–72 chars) are valid; `201` → redirect to `/login?signup=success`; `409` → inline "email already exists" under the email field; other errors → generic banner; entered values survive a network failure
- `apps/web/app/login/page.tsx` — login form using `next-auth/react`'s client `signIn('credentials', { redirect: false })`; generic "Invalid email or password" banner on failure (no field-specific detail, no user enumeration); shows the signup success message via a `?signup=success` query param
- `apps/web/components/nav.tsx` (new `components/` directory) — `async` Server Component reading `auth()`, rendered from `app/layout.tsx` on every route; logged in shows email + a "Log out" control wired to a server action calling `signOut`; logged out shows "Log in"/"Sign up" links
- **Bug found and fixed during manual verification:** `router.push('/')` after a successful client-side login left the nav showing the stale logged-out state (Next.js App Router client Router Cache reuses the previously rendered root layout across a soft navigation). Fixed by using a full navigation (`window.location.href = '/'`) for the post-login redirect instead — see `wiki/active-feature.md` Session 025 notes for the full root-cause writeup
- 7 new unit tests (`app/signup/validation.test.ts`); manually verified the full signup → login → nav → reload → logout flow plus duplicate-email, wrong-password, and tampered-session-cookie (AC-19) cases via a scripted headless-browser session against a live local Postgres + `next dev`
- `npm run typecheck`/`lint`/`test` all green (108/108 web + 16/16 worker)

**Session 024 — Schema (User/Account/Session/VerificationToken) + Signup/Login API (2026-07-01)**
- `prisma/schema.prisma` — added `User`, `Account`, `Session`, `VerificationToken` models per `@auth/prisma-adapter`'s required shape, plus `User.passwordHash`; migration `20260701093242_add_user_authentication`; `Job` untouched
- **ADR-007 corrected (Addendum):** Auth.js rejects `session.strategy: 'database'` when Credentials is the only provider — discovered before implementation, flagged to the user, switched to `session.strategy: 'jwt'` (standard supported path). `wiki/active-feature.md`'s Scope Decisions, Session Duration, API Contract, and ACs 13/17/19 updated to match; original ADR-007 Decision left intact as the historical record
- `apps/web/lib/auth.ts` — Auth.js config: `PrismaAdapter`, JWT sessions (30-day `maxAge`), one `Credentials` provider; `authorize()` logic extracted into an exported, independently unit-tested `authorizeCredentials()`
- `apps/web/app/api/auth/[...nextauth]/route.ts` — standard Auth.js App Router handler wiring
- `apps/web/app/api/auth/signup/route.ts` — `POST /api/auth/signup`: Zod-validated email/password, lowercased/trimmed email, `bcryptjs`-hashed password, `409 EMAIL_ALREADY_REGISTERED` via Prisma `P2002` catch (no separate existence check, avoids a race)
- Dependencies added to `apps/web`: `next-auth@5.0.0-beta.31` (pinned exact version), `@auth/prisma-adapter@^2.11.2`, `bcryptjs@^2.4.3`, `@types/bcryptjs` (dev) — `npm audit` confirmed no new vulnerabilities
- `AUTH_SECRET` added to `apps/web/lib/env.ts`, `.env`, `.env.example`
- 13 new unit tests (`lib/auth.test.ts`, `app/api/auth/signup/route.test.ts`); manually verified signup/login/session/wrong-password against a live local Postgres + `next dev`
- `npm run typecheck`/`lint`/`test` all green across `@ilovepdf/shared`, `@ilovepdf/web`, `@ilovepdf/worker`

**Session 023 — Planning, ADR-007 & Acceptance Criteria (2026-07-01)**
- `wiki/active-feature.md` — complete User Authentication spec (scope decisions, password/email requirements, `User`/`Account`/`Session`/`VerificationToken` schema, signup/login API contracts, frontend spec, 28 ACs)
- `docs/adr/007-user-authentication.md` — Decision: Auth.js v5 + `@auth/prisma-adapter`, Credentials provider, database sessions, `bcryptjs` password hashing (rejected JWT sessions, rejected Clerk — both per user-confirmed scope and consistency with the project's existing Postgres-as-source-of-truth pattern)
- 4-session implementation breakdown (Sessions 023–026)
- User-confirmed scope, ahead of any code: Merge/Split/Compress remain fully anonymous (no tool gating); email/password only (no OAuth); no email verification; no password reset; no new UI beyond the auth forms and a session-aware nav (no account/profile page yet)

---

## [0.3.0] — 2026-07-01

### Added (PDF Compress)

**Session 022 — E2E Tests, Polish & Definition of Done (2026-07-01)**
- `apps/web/e2e/compress.spec.ts` — parametrized the full compress-and-download flow test over all three compression levels (Low/Recommended/High), each verifying downloaded output is smaller than the input with page count/order/dimensions preserved (AC-39); previously only Recommended had full download-flow coverage
- Ran full Definition of Done checklist: `npm run typecheck` (0 errors), `npm run lint` (0 warnings/errors), `npm run test` (104/104 — 88 web + 16 worker), `npx playwright test` (11/11 against the live local stack — native Postgres/Redis/MinIO per ADR-004, `next dev`, worker `npm run dev`)
- Confirmed AC-40: no authentication logic exists anywhere in the `/api/compress/*` routes, consistent with Merge/Split
- All 40 acceptance criteria now verified — PDF Compress is feature-complete
- `TASKS.md`, `wiki/active-feature.md`, `wiki/completed-features.md` updated to mark the feature Done; Current Feature reset to none pending explicit approval for the next feature (per the One-Feature-at-a-Time Rule)

**Session 021 — Frontend: `/compress` Upload, Level Selector, Polling & Download UI (2026-07-01)**
- `apps/web/app/compress/page.tsx` — the `/compress` route: IDLE → UPLOADING → PROCESSING → DONE/ERROR state machine, modeled directly on `apps/web/app/split/page.tsx`'s dropzone/polling/download pattern
- Compression level selector (Low / Recommended / High as a `role="radiogroup"` of buttons), `RECOMMENDED` selected by default; Compress button disabled until a file is selected, enabled for any level since one is always selected
- Client-side validation reused from the Merge/Split pattern: non-PDF and >50MB files rejected at drop/select with an inline error, before ever reaching the API
- TanStack Query polling of `GET /api/compress/jobs/:jobId/status` every 2 seconds while PROCESSING, stopping on `COMPLETED`/`FAILED`; DONE state triggers a real browser download via the pre-signed URL from `GET /api/compress/jobs/:jobId/download`
- `UNSUPPORTED_ENCRYPTED_PDF` (and any other 4xx/5xx from the upload API) surfaces via the same generic upload-error banner Split uses for its own server-side validation errors — no encryption-specific UI branch needed
- `apps/web/app/compress/validation.ts` — `MAX_FILE_SIZE_BYTES`/`formatBytes`, with 7 new unit tests
- `apps/web/e2e/compress.spec.ts` — 5 new Playwright E2E tests: full compress-and-download flow at the Recommended level with page count/size/order verified, level-selector interaction (AC-05), the `UNSUPPORTED_ENCRYPTED_PDF` error-banner path (AC-20, via `page.route` since a real encrypted-PDF fixture isn't buildable with this stack's dependencies), a network-failure-during-upload path (AC-24), and a seeded post-queue FAILED job driving the real ERROR state (AC-22/23). The fixture PDF's embedded image is built by hand via pdf-lib's low-level `context.flateStream`/`context.register` API (a real in-scope `/DeviceRGB` + `/FlateDecode` raw bitmap) rather than adding `sharp`/JPEG-encoding to `apps/web` — `sharp` stays a worker-only dependency per ADR-006
- 29 of 40 acceptance criteria now verified (all of Upload, Processing & Download, Error Handling except the final E2E/DoD sign-off criteria reserved for Session 022)
- Quality gates green across the whole monorepo: `npm run typecheck` (0 errors), `npm run lint` (0 warnings), `npm run test` (88/88 web + 16/16 worker), `npx playwright test` (9/9, including the pre-existing Merge/Split suites — no regressions)
- Manually verified against the real local stack (native Postgres/Redis/MinIO, `next dev`, worker `npm run dev`): all Playwright specs driven against live services, plus a direct screenshot of the IDLE state confirming the level selector and dropzone render correctly

**Session 020 — Worker: pdf-lib Image Extraction + Sharp Recompression Processor (2026-07-01)**
- `apps/worker/src/jobs/compress.ts` — the `compress` job processor: enumerates image XObjects via `pdf-lib`'s low-level object API, recompresses in-scope images (`/DCTDecode` RGB/Grayscale JPEG, `/FlateDecode` raw RGB/Grayscale bitmap) through Sharp per the selected level's max DPI and JPEG quality, leaves out-of-scope images (CMYK, Indexed, JPXDecode, CCITTFaxDecode) untouched, and saves with `useObjectStreams: true`
- DPI-based downsampling is computed relative to each image's actual **placed size** on the page, not just its pixel dimensions — a minimal hand-rolled content-stream tokenizer tracks `q`/`Q`/`cm`/`Do` to resolve the CTM in effect at each draw call (pdf-lib has no public API for reading a page's drawing operators); correctly handles rotated placements and an image reused at different sizes across pages by keeping the largest
- Images only reachable via a nested Form XObject (not walked in v1) fall back to quality-only JPEG re-encoding rather than guessing a resize target
- Every recompression is compared against the original size and discarded if not smaller, so pathological inputs never make the output larger
- `sharp` added as a dependency of `apps/worker` only (per ADR-006)
- Wired `compress` job name into `apps/worker/src/index.ts`'s dispatcher
- Proof-of-concept spike (opened the session, per the risk flagged in Session 018/019) confirmed the pdf-lib low-level API approach: `decodePDFRawStream()` doesn't support `/DCTDecode` (read via `getContents()` instead — it's already a complete JPEG); `PDFRawStream.contents` is readonly with a private constructor, so stream replacement uses `context.assign(ref, PDFRawStream.of(...))`, the same mechanism pdf-lib's own JPEG/PNG embedders use; Sharp's JPEG encoder defaults to sRGB output regardless of input channel count, so grayscale sources need an explicit `.toColourspace('b-w')` to stay 1-channel
- 7 new unit tests using real pdf-lib/Sharp against generated fixture PDFs (only db/storage/logger mocked) — JPEG recompression smaller at every level, grayscale FlateDecode preserving `/DeviceGray`, text-only PDF still completing (AC-18), CMYK image left untouched, and the FAILED paths
- Manually verified against the live local stack: a 1.79MB fixture PDF compressed to 446KB (LOW, 75.1% reduction), 151KB (RECOMMENDED, 91.6%), and 27KB (HIGH, 98.5%), with all three outputs downloading, opening, and rendering correctly with the original page count and layout intact

**Session 019 — Compress API (2026-07-01)**
- `POST /api/compress/jobs` — multipart upload (`file` + optional `level`, defaults to `RECOMMENDED`); validates MIME type, magic bytes, file size, and `level` (`LOW`/`RECOMMENDED`/`HIGH`); detects encrypted PDFs via pdf-lib load failure and returns `400 UNSUPPORTED_ENCRYPTED_PDF`; uploads to MinIO, creates a `COMPRESS` job record, enqueues a `compress` job on the shared `document-processing` queue; returns `202 { jobId }`
- `GET /api/compress/jobs/:jobId/status` and `GET /api/compress/jobs/:jobId/download` — same contract as Merge/Split, scoped to `COMPRESS` jobs; download filename is `compressed-YYYY-MM-DD.pdf`
- `apps/web/lib/queue.ts` — `documentProcessingQueue` generic widened to include `CompressJobPayload`
- 15 new unit tests covering every error code in the API contract (`FILE_REQUIRED`, `INVALID_FILE_TYPE`, `FILE_TOO_LARGE`, `INVALID_COMPRESSION_LEVEL`, `UNSUPPORTED_ENCRYPTED_PDF`) plus the success paths (explicit level, default level) and the status/download endpoints
- Found and worked around a pdf-lib 1.17.1 bug: `EncryptedPDFError` fails `instanceof` checks because its ES5-targeted build extends the native `Error` class via a helper whose `super()` call returns a fresh plain `Error` rather than initializing `this`, discarding the subclass prototype. Detection uses `err.message.includes('is encrypted')` instead
- Manually verified all success/error paths against the local dev stack (Postgres/Redis/MinIO, native per ADR-004) with `curl`

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
