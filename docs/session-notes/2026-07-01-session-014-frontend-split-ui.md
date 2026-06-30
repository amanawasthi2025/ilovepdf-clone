# Session Note: Session 014 — Frontend: `/split` Upload, Polling & Download UI

**Date:** 2026-07-01
**Session Goal:** Build the `/split` page (dropzone, page-ranges input, IDLE → UPLOADING → PROCESSING → DONE/ERROR state machine, TanStack Query polling, ZIP download) per the frontend spec locked in Session 011 and the API contracts shipped in Sessions 012–013.
**Status:** COMPLETE ✅

---

## What Was Done

### `apps/web/app/split/validation.ts` (new)
`formatBytes()` and `MAX_FILE_SIZE_BYTES` copied from `merge/validation.ts` (same 50 MB cap, same constant — no shared module created since two near-identical 3-line copies didn't justify a `packages/shared` promotion). Added `isValidRangesSyntax(input)`, a client-side mirror of the syntax half of `apps/web/lib/ranges.ts`'s `RANGE_SYNTAX` regex (`^\d+-\d+(,\d+-\d+)*$`) — syntax only, since page-count bounds can't be checked client-side without parsing the PDF.

### `apps/web/app/split/validation.test.ts` (new)
16 unit tests: `formatBytes` (6, identical to Merge's), constants (1), and `isValidRangesSyntax` (9 — valid single/multi range, empty, whitespace-only, internal spaces, missing dash, trailing comma, non-numeric, surrounding whitespace tolerated).

### `apps/web/app/split/page.tsx` (new)
Mirrors `merge/page.tsx`'s structure and Tailwind classes, simplified for the single-file case:
- Single-file dropzone (`react-dropzone`, `multiple: false`), accepts `application/pdf`, 50 MB cap, rejects with inline error messages
- Selected file shown as filename + formatted size + remove (×) button — no list/reorder UI (single file only)
- Page-ranges text input (`id="ranges"`), inline error shown only once the field is non-empty and fails syntax validation (empty input disables the Split button without an error message, per spec)
- Split button disabled until a file is selected and ranges syntax is valid; shows a spinner during UPLOADING
- On API error during UPLOADING: returns to IDLE with an error banner, **without** clearing the selected file or the ranges input — covers `RANGE_OUT_OF_BOUNDS`, `INVALID_FILE_TYPE`, etc., all of which can only be caught server-side for ranges
- PROCESSING: full-page spinner, "Splitting your file…", range count derived from the current `ranges` string (`"Creating N PDFs"`)
- DONE: success message, "Download ZIP" button (fetches the pre-signed URL via `GET /api/split/jobs/:jobId/download`, triggers browser download), "Split another PDF" resets all state to IDLE
- ERROR: shows `errorMessage` from the failed job or a generic fallback, "Try again" resets to IDLE
- Status polling: same TanStack Query pattern as Merge (`refetchInterval: 2000`, stops on `COMPLETED`/`FAILED`), keyed on `['split-job-status', jobId]`

### Tests & Quality Gates
- `npm run typecheck` — 0 errors, all 3 packages
- `npm run lint` — 0 errors/warnings, all 3 packages
- `npm run test` — 66 tests pass (9 `apps/worker`, 57 `apps/web`, including the 16 new `split/validation.test.ts` tests)

### Manual Verification — Performed

Docker was already running (user-started, same environment limitation as Session 013 — `docker`/`sudo` aren't usable from this shell directly). Dev servers (`npm run dev`) were already running for `apps/web`.

No project-specific "run" skill exists yet, so verification used the generic browser-driven pattern: Playwright (already a project dependency for the Merge E2E suite) launched headless Chromium against `http://localhost:3000/split`, scripted from `apps/web/node_modules/.bin` via `NODE_PATH`.

Two flows exercised, screenshotted at each step:
1. **Error path:** uploaded a generated 10-page PDF, submitted ranges `1-99`. Server returned `400 RANGE_OUT_OF_BOUNDS`; UI showed the error banner with the exact server message (`Range "1-99" is out of bounds for a 10-page document.`), the selected file (`split-test.pdf`) remained visible, and the page returned to the IDLE/Split-button state. Confirms AC-20.
2. **Happy path:** same file, ranges `1-3,4-6,7-10`. UI transitioned IDLE → UPLOADING → PROCESSING ("Splitting your file…", "Creating 3 PDFs") → DONE ("Your PDF has been split successfully"). Clicked "Download ZIP"; captured the browser download, extracted it, and re-opened each entry with pdf-lib:
   - `split-1-3.pdf` → 3 pages
   - `split-4-6.pdf` → 3 pages
   - `split-7-10.pdf` → 4 pages
   All match the requested ranges exactly. Confirms AC-11 through AC-19.

No unexpected browser console errors (the only console entry was the expected 400 from the intentional out-of-bounds request in step 1).

Formal sign-off against the full 38-item acceptance criteria list in `wiki/active-feature.md` is deferred to Session 015 (E2E Tests, Polish & Definition of Done), matching the pattern used for Merge (Session 010 was the session that checked off all ACs, not the intermediate frontend sessions).

---

## Design Decisions

### No shared validation module between `merge/validation.ts` and `split/validation.ts`
Both files now contain an identical `formatBytes()` and `MAX_FILE_SIZE_BYTES`. Promoting these to `packages/shared` was considered and rejected for this session — YAGNI: two call sites with no near-term third, and the two files diverge in their other exports (`MAX_FILES`/`MIN_FILES` for Merge vs. `isValidRangesSyntax` for Split), so a shared module would need to either over-generalize or only partially deduplicate. Worth revisiting if a third tool repeats the same pattern.

### Range count for the PROCESSING message computed from client state, not a server round-trip
The "Creating N PDFs" message in the PROCESSING state is derived by splitting the `ranges` string already held in component state, not from a new field on the job-status response. The API contract for `GET /api/split/jobs/:jobId/status` doesn't return range count, and adding one would mean changing a contract shared with Merge's status shape for a cosmetic label — not justified for this session.

### Playwright used directly instead of a `chromium-cli`-based driver
The `/run` skill recommends `chromium-cli` for browser-driven verification, but it isn't installed in this environment. The project already depends on Playwright (`apps/web/playwright.config.ts`, used by Merge's E2E suite), so verification scripted Playwright directly via `node` with `NODE_PATH` pointing at the repo's `node_modules`, rather than installing a new tool for one verification pass.

---

## Issues Encountered

- Running the verification script with `node script.js` from the scratchpad directory failed to resolve `playwright` (Node resolves `require()` relative to the script's own location, not `cwd`). Fixed by setting `NODE_PATH=$(pwd)/node_modules` (repo root) when invoking the script.
- No other issues — no new bugs found in this session (unlike Session 013, which surfaced a Session 012 filename bug during its own manual verification).

---

## Next Steps

**Session 015: E2E Tests, Polish & Definition of Done**

- `apps/web/e2e/split.spec.ts` — Playwright E2E test (upload → valid ranges → download ZIP → verify entries), mirroring `merge.spec.ts`
- Walk the full 38-item acceptance criteria list in `wiki/active-feature.md` and check off each one (including AC-21: job fails after being queued, e.g. a corrupted PDF — not yet exercised)
- Once all ACs are met and the full Definition of Done checklist in `CLAUDE.md` is satisfied: open the PR from `feature/pdf-split` → `develop` and run the CodeRabbit review workflow

---

*Session note written by: Claude Code (claude-sonnet-5)*
*Next session: Session 015 — E2E Tests, Polish & Definition of Done*
