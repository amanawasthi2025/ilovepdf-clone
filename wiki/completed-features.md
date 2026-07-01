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
| 3 | PDF Compress | 2026-07-01 | v0.3.0 | pdf-lib + Sharp image recompression, 3 levels (Low/Recommended/High); 40 ACs verified; 104 unit tests + 11 Playwright E2E tests. |
| 4 | User Authentication | 2026-07-01 | v0.4.0 | Auth.js v5 + Credentials provider, JWT session cookie; signup/login/logout, session-aware nav; 28 ACs verified; 124 unit tests + 13 Playwright E2E tests. |

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

### Feature 3: PDF Compress
**Completed:** 2026-07-01
**Version:** v0.3.0
**Branch:** feature/pdf-compress

#### What Was Built
Users can upload a single PDF and choose a compression level (Low / Recommended / High) through a browser interface; the server recompresses in-scope embedded raster images via Sharp and optimizes the PDF's object structure via pdf-lib, then the smaller output PDF can be downloaded — no authentication required. Reuses the full Merge/Split pipeline (upload API → BullMQ queue → worker → MinIO storage → polling frontend) with one new dependency (`sharp`, worker-only, ADR-006).

#### Key Decisions
- Three fixed compression-level presets rather than an open-ended quality slider — matches category convention, avoids unnecessary UI/API complexity (ADR-006)
- Image recompression scoped to RGB/Grayscale JPEG (`DCTDecode`) and raw/Flate bitmap (`FlateDecode`) XObjects in v1; CMYK, Indexed-color, JPEG2000, and CCITT fax images are left untouched and explicitly documented as out of scope rather than silently skipped
- DPI-based downsampling computed against each image's actual placed size on the page (via a hand-rolled content-stream CTM tracker), not raw pixel dimensions — correctly handles rotated/reused placements
- Every recompression result is compared against the original and discarded if not smaller, so pathological inputs can never make the output larger
- Encrypted/password-protected PDFs rejected at upload with an explicit `400 UNSUPPORTED_ENCRYPTED_PDF` — foreseeable input for a compress tool

#### Tests Added
- 104 Vitest unit/integration tests across the monorepo (16 worker, 88 web), including 7 for `compress/validation.ts` and 8 for the upload API's compression-level/encrypted-PDF error paths
- `apps/worker/src/jobs/compress.test.ts` — 7 tests using real pdf-lib/Sharp against generated fixtures (JPEG recompression smaller at every level, grayscale FlateDecode preserving `/DeviceGray`, text-only PDF still completing, CMYK image left untouched, FAILED paths)
- 11 Playwright E2E tests (`apps/web/e2e/compress.spec.ts`): full upload → process → download flow verified at **each** of the three compression levels (output smaller than input, page count/order/dimensions preserved), level-selector interaction, `UNSUPPORTED_ENCRYPTED_PDF` error-banner path, network-failure-during-upload path, and a seeded post-queue FAILED job driving the ERROR state

#### Known Limitations
- Same as Merge/Split: no TTL cleanup worker, no rate limiting, fixed worker concurrency
- Images only reachable via a nested Form XObject are not walked in v1 and fall back to quality-only JPEG re-encoding rather than a computed resize target
- No compression-ratio/size-reduction display in the UI — deferred as it would require new status-response fields no other feature needs yet (YAGNI)

#### Lessons Learned
- pdf-lib 1.17.1's `EncryptedPDFError` fails `instanceof` checks due to an ES5-targeted build issue (its `super()` call returns a fresh plain `Error`, discarding the subclass prototype) — detection had to fall back to matching on `err.message`
- pdf-lib has no public API for reading a page's drawing operators; resolving an image's true on-page placed size (needed for correct DPI-based downsampling) required a minimal hand-rolled tokenizer tracking `q`/`Q`/`cm`/`Do` through the content stream
- Sharp's JPEG encoder defaults to sRGB output regardless of input channel count — grayscale sources need an explicit `.toColourspace('b-w')` to avoid silently becoming 3-channel
- A proof-of-concept spike at the start of the worker-processor session (before committing to the full implementation) resolved the exact low-level pdf-lib API for stream mutation (`context.assign(ref, PDFRawStream.of(...))`) — same pattern used elsewhere in this project for high-uncertainty implementation risks, and worth continuing to reach for whenever a session starts with a named unresolved API question in `TASKS.md`

---

### Feature 4: User Authentication
**Completed:** 2026-07-01
**Version:** v0.4.0
**Branch:** feature/user-auth

#### What Was Built
Users can create an account with an email and password, log in, and log out through a browser interface. Auth.js v5 (`next-auth`) with a Credentials provider handles the login/session machinery; a custom `POST /api/auth/signup` route handles account creation (Auth.js has no signup flow of its own). Sessions are tracked via a signed, HTTP-only JWT cookie with a 30-day expiry. Purely additive: Merge, Split, and Compress remain fully anonymous — no tool route requires a session. The only new user-facing surface is the signup/login forms and a session-aware nav.

#### Key Decisions
- Auth.js v5 + `@auth/prisma-adapter`, Credentials provider only — no OAuth, matching the already-planned choice in `wiki/architecture.md` and avoiding external OAuth app registration (ADR-007)
- Session strategy corrected from the originally-planned database sessions to JWT mid-implementation (ADR-007 Addendum) — Auth.js rejects `session.strategy: 'database'` when Credentials is the only configured provider; `Account`/`Session`/`VerificationToken` tables stay provisioned via the adapter for future OAuth but are unused by the JWT path
- `bcryptjs` (pure JS) for password hashing over a native-binding alternative — avoids a second native dependency alongside the worker's existing `sharp` (ADR-006)
- Login failures return one generic "Invalid email or password" message regardless of whether the email exists or the password is wrong — standard anti-enumeration practice, same reasoning applied to signup's `409 EMAIL_ALREADY_REGISTERED` (a narrower, accepted trade-off since mitigating it fully requires a verification-email flow, explicitly out of scope)
- No account/profile page, no email verification, no password reset, no tool gating — all explicitly deferred per user-confirmed scope; Job History (backlog #4) will own the account-page surface later

#### Tests Added
- 124 Vitest unit/integration tests across the monorepo (108 web, 16 worker — the 16 worker tests are unchanged from Compress; no worker code was touched by this feature), including 6 for `authorizeCredentials()`, 7 for the signup API's validation/error paths, and 7 for signup's client-side validation
- 13 Playwright E2E tests total (11 pre-existing Merge/Split/Compress, no regressions), plus 2 new specs in `apps/web/e2e/auth.spec.ts`: the full signup → login → session-persists-on-reload → logout flow (AC-27), and duplicate-email-signup / wrong-password-login error states (AC-28)
- AC-19 (tampered/expired session cookie treated as logged-out, no error page) and AC-14 (cookie is HTTP-only, unreadable via `document.cookie`) verified directly against a live session rather than assumed from Auth.js's documented behavior

#### Known Limitations
- No rate limiting on signup/login — acceptable for now since no sensitive data sits behind an account yet (no Job History, no payments); revisit when either lands
- No "remember me" toggle — one fixed 30-day session duration for all logins
- `Account`, `Session`, and `VerificationToken` tables are provisioned but entirely unused in v1 (JWT sessions don't touch them) — intentional, to avoid a second schema-rewrite migration if OAuth or database sessions are added later

#### Lessons Learned
- Auth.js v5 (beta) forces JWT session strategy when Credentials is the only provider — this wasn't caught during planning and required a same-session course correction (ADR-007 Addendum) once implementation started; worth explicitly checking a library's documented provider/strategy compatibility matrix during planning for future auth-adjacent work, not just its headline feature list
- Next.js App Router's client Router Cache can serve a stale server-component render (here: the nav) across a `router.push` soft navigation even when the underlying cookie/session state has already changed — a full navigation (`window.location.href`) is the reliable fix when a server component's output depends on state a client action just changed
- `next-auth/react`'s `signIn`/`signOut` don't interact with `SessionContext` — only `useSession` does — so a project with no client components calling `useSession` doesn't need a `<SessionProvider>` wrapped anywhere, confirmed by reading the library source rather than assuming a provider is always required

---

*Last updated: 2026-07-01 — Session 026 (User Authentication Complete)*
