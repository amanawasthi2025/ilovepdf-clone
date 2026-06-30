# Session Note: Session 015 — E2E Tests, Polish & Definition of Done

**Date:** 2026-07-01
**Session Goal:** Write the Split E2E suite, exercise AC-21 (job fails after being queued), walk the full 38-item acceptance criteria list, run all quality gates, and update every document required by the Definition of Done.
**Status:** COMPLETE ✅

---

## What Was Done

### `apps/web/e2e/split.spec.ts` (new)
3 Playwright tests, mirroring `merge.spec.ts`'s structure:
1. **Happy path:** generates a 10-page PDF with pdf-lib, uploads it via the react-dropzone hidden input, submits ranges `1-3,4-6,7-10`, waits for PROCESSING ("Splitting your file…", "Creating 3 PDFs") then DONE, captures the ZIP download, opens it with `jszip`, and re-parses each entry with pdf-lib to confirm `split-1-3.pdf`/`split-4-6.pdf`/`split-7-10.pdf` have exactly 3/3/4 pages. Confirms AC-11 through AC-19 and AC-37.
2. **`RANGE_OUT_OF_BOUNDS`:** submits ranges `1-99` against the same 10-page file; confirms the error banner appears with the server's message, the selected file remains, and the Split button stays usable. Confirms AC-20.
3. **AC-21 (job fails after being queued):** see below.

### AC-21 — design problem and resolution
The spec's example trigger for AC-21 is "(e.g. corrupted PDF)". In the implemented system this is structurally unreachable through the real upload flow: `POST /api/split/jobs` already runs the same magic-bytes check and the same `PDFDocument.load()` call the worker runs, so a corrupted PDF is rejected with `400 INVALID_FILE_TYPE` before a job is ever created or enqueued. The worker can only reach `FAILED` for reasons unrelated to file validity (MinIO download/upload errors, ZIP generation errors) — all of which are already covered by `apps/worker/src/jobs/split.test.ts` (Session 013).

To exercise the part of AC-21 that actually lives in `apps/web` — the status endpoint reading a `FAILED` job and the page's polling/ERROR-state/reset code — the third E2E test seeds a `Job` row directly via `@prisma/client` with `status: FAILED` and a known `errorMessage`, then uses `page.route()` to intercept the `POST /api/split/jobs` call and fulfill it with that job's id (skipping the real upload, which isn't the part under test). The real `GET /api/split/jobs/:jobId/status` route and the real page code then drive the transition to ERROR; the test asserts the exact error message renders and "Try again" resets to IDLE. The seeded job row is deleted in a `finally` block.

### Acceptance Criteria — all 38 verified
Walked `wiki/active-feature.md`'s full list and checked every box:

| Range | ACs | Verified by |
|---|---|---|
| AC-01–AC-10 | Upload UI | `app/split/page.tsx` code + `validation.test.ts` (16 tests) |
| AC-11–AC-19 | Processing & Download | E2E test 1 |
| AC-20 | Range out-of-bounds | E2E test 2 |
| AC-21–AC-23 | Error handling | E2E test 3 (AC-21); `page.tsx` upload-catch logic (AC-22, AC-23) |
| AC-24–AC-33 | API contracts | `route.test.ts` suites (8 + 3 + 4 = 15 tests across the 3 split routes) |
| AC-34–AC-37 | Quality gates | This session's full run (below) |
| AC-38 | No auth | By design — `jobId` is the only access token, unchanged from Merge |

### Final Quality Gate Results
| Check | Result |
|---|---|
| `npm run typecheck` | ✅ 0 errors, 3 workspaces |
| `npm run lint` | ✅ 0 errors/warnings, 3 workspaces |
| `npm run test` | ✅ 75/75 (9 worker, 66 web) |
| `npx playwright test` | ✅ 4/4 (1 merge, 3 split) |

### Documentation updated
- `wiki/active-feature.md` — Status → COMPLETE, all 38 ACs checked, Session 015 marked COMPLETE
- `wiki/completed-features.md` — Feature 2 (PDF Split) entry added with full detail
- `TASKS.md` — PDF Split moved to Previous Feature (Approved); Current Feature cleared per the One-Feature-at-a-Time rule, awaiting next-feature approval
- `CHANGELOG.md` — `[Unreleased]` promoted to `[0.2.0]`; Session 015 entry added

---

## Design Decisions

### Seeding the `FAILED` job directly instead of attempting a live corrupted-PDF flow
Covered above. The alternative — pausing the BullMQ queue mid-test to race a real corrupted upload against the worker — was considered and rejected: it would require pausing the shared `document-processing` queue, which is global and could stall the concurrently-running `merge.spec.ts` test (Playwright runs different spec files in separate workers even with `fullyParallel: false`). Seeding via Prisma + a single route intercept is deterministic, fast, and doesn't touch infrastructure shared with other tests.

### Dev servers started manually for this session
Docker Compose's `postgres`, `redis`, and `minio` containers were already running from a previous session, but neither `apps/web` nor `apps/worker`'s dev process was up. Both were started in this session: `apps/worker` already loads the root `.env` via `node --env-file=../../.env` in its own `dev` script; `apps/web`'s plain `next dev` does not (there is no `apps/web/.env`, and Next.js does not walk up to a parent directory's `.env`), so it was started with the root `.env` sourced into the shell first. Same Docker/sudo sandbox limitation noted in Sessions 013–014 — `docker ps` confirms permission denied from this shell, so the three infra containers were assumed to already be running (confirmed via TCP port checks) rather than started here.

---

## Issues Encountered

None — no new bugs surfaced during this session's verification, unlike Session 013.

---

## Next Steps

PDF Split is now Done per the `CLAUDE.md` Definition of Done checklist, pending:
- Final commit on `feature/pdf-split`
- `gh pr create` from `feature/pdf-split` → `develop`
- CodeRabbit review cycle (findings fixed or replied to inline)
- Merge `feature/pdf-split` → `develop` once CodeRabbit is clean

No next feature has been started — per the One-Feature-at-a-Time rule, `TASKS.md`'s Current Feature is empty and awaits explicit approval.

---

*Session note written by: Claude Code (claude-sonnet-5)*
