# Session Note: Session 032 — PDF to Image: Schema + Worker Processor + API Routes

**Date:** 2026-07-01
**Session Goal:** Implement the schema changes, worker rasterization processor, and API routes for PDF to Image, per the plan locked in Session 031 (`wiki/active-feature.md`, `docs/adr/009-pdf-to-image-rasterization.md`).
**Status:** COMPLETE ✅

---

## What Was Done

### Schema

`prisma/schema.prisma`: `JobType` gains `PDF_TO_IMAGE`; new `ImageFormat` enum (`PNG`/`JPEG`); `Job` gains nullable `imageFormat`, mirroring the existing `compressionLevel` pattern. Migration `20260701114002_add_pdf_to_image_job_type` applied against the local Postgres instance. `packages/shared` exports the new `ImageFormat` enum and `PdfToImageJobPayload` type.

### ADR-009 correction — the planned rasterization library did not work

Before writing any worker code against Sharp, its actual PDF support was verified directly in this repo rather than assumed: `sharp.format.pdf.input.buffer` is `false`, and calling `sharp(pdfBuffer, ...)` throws `Input buffer contains unsupported image format`. `sharp.versions` lists `cairo`/`rsvg` but no `poppler`/`pdfium` — the codec Sharp's PDF loader needs. ADR-009's Context section had asserted PDFium ships in Sharp's official prebuilt binaries; this was not actually true for this project's installed `sharp@0.33.5`/`@img/sharp-libvips-linux-x64`. Sharp's real PDF-support requirement is a globally-installed libvips compiled with PDFium/poppler — a system dependency, which is exactly the cost ADR-009 rejected `poppler-utils` for.

This was surfaced to the user directly (not silently worked around) with three options: install a system-level PDF-capable libvips, switch to ADR-009's originally-rejected Option 2 (`pdfjs-dist` + canvas), or pause the session to formally revisit the ADR first. **User chose Option 2.** `@napi-rs/canvas` (a prebuilt-binary N-API canvas) was used instead of the originally-considered `node-canvas`, to keep the "zero new system dependencies" property ADR-009 cared about — verified working against a real generated PDF fixture before adopting it. Both the rasterization API and its `standardFontDataUrl` requirement were manually verified in a scratch script before any processor code was written.

**ADR-009 was amended with a "Session 032 Correction" Addendum** (not silently edited — the original Decision is marked superseded, with the Addendum explaining what was wrong and why). `wiki/active-feature.md`'s Scope Decisions table and Open Questions table were updated to match.

### Worker processor: `apps/worker/src/jobs/pdf-to-image.ts`

Rasterizes each page via `pdfjs-dist`'s legacy/Node build + `@napi-rs/canvas` at fixed 150 DPI (`scale = 150/72`), packaged into a ZIP via `JSZip` (mirrors `split.ts`'s always-ZIP pattern, `page-N.{png,jpg}` naming). Two implementation issues were found and fixed before this could be considered correct, not just "typechecks and imports cleanly":

1. **`pdfjs-dist`'s legacy build is pure ESM (`.mjs`).** A static `import` of it compiles to `require(...)` under this package's CommonJS output (`tsconfig` `module: NodeNext`, no `"type": "module"` in `package.json`), which throws `ERR_REQUIRE_ESM` on Node < 22.12 — below this project's declared `>=20` engine floor (it happened to work in this dev environment only because it runs Node 24). Fixed with a cached dynamic `import()`, which loads ESM from a CJS module on every supported Node version. Verified by compiling with `tsc` and grepping the emitted `dist/` output for `import(` instead of `require(`.
2. **Text silently failed to rasterize** (blank output pages) without `standardFontDataUrl` pointed at pdfjs-dist's bundled `standard_fonts/` directory — needed for the 14 base PDF fonts (Helvetica, etc.) when not embedded in the source PDF. The natural fix (`pathToFileURL(...).href`) still failed, because pdfjs-dist's Node font loader (`node_utils.js`) passes the URL straight to `fs.promises.readFile`, not a URL parser — it needs a plain filesystem path, not a `file://` string. A dedicated regression test (`hasNonWhitePixel`, decodes the output PNG and checks for non-white pixels) was added and confirmed to fail without the fix and pass with it, before moving on.

### API routes

`POST /api/pdf-to-image/jobs`, `GET .../[jobId]/status`, `GET .../[jobId]/download` — new routes mirroring Compress's routes exactly, including Job History's (ADR-008) ownership guard. `apps/worker/src/index.ts` and `apps/web/lib/queue.ts` register `pdf-to-image` as a fourth BullMQ job name/payload type.

### Tests

5 new worker unit tests (real `pdfjs-dist`/`@napi-rs/canvas` run against `pdf-lib`-generated fixture PDFs — only db/storage/logger I/O boundaries mocked, same approach `compress.test.ts` already established, since mocking the rasterization library itself would test nothing here) + 26 new web route tests across the three new route files, mirroring Compress's existing test suites.

---

## Acceptance Criteria Verified This Session

AC-01 through AC-11 (upload/processing/status/download/ownership) and AC-18 (no regression to existing tests) — see `wiki/active-feature.md` for the full checklist. AC-12–AC-23 (history integration, frontend, E2E, final quality-gate sign-off) remain for Sessions 033–034.

---

## Quality Gates (this session)

- `npm run typecheck` — 0 errors (all 3 packages)
- `npm run lint` — 0 errors/warnings (all 3 packages)
- `npm run test` — 178 web + 21 worker tests passing, no regressions to Merge/Split/Compress/Auth/Job History

---

## Risks / Notes Carried Forward

- **ADR-009's rasterization library changed mid-feature.** Anyone reading Session 031's note in isolation will see the original (now-superseded) Sharp decision — the ADR file itself is the source of truth; its Addendum explains the correction in full.
- `download-button.tsx`'s route-slug bug (documented in Session 031, `wiki/active-feature.md`) is still unfixed — still scheduled for Session 033, unaffected by this session's rasterization-library change.
- No frontend page exists yet; `/pdf-to-image` cannot be manually exercised end-to-end until Session 033.

---

## Next Steps

**Session 033: Frontend — `/pdf-to-image` page + `download-button.tsx` route-slug fix**

Build the upload/format-selector/polling/download UI mirroring `/compress`, add the home page link, and fix the `JOB_TYPE_ROUTE_SLUGS` mapping in `download-button.tsx` (with regression coverage for the existing single-word job types).

---

*Session note written by: Claude Code (claude-sonnet-5)*
*Next session: Session 033 — Frontend: `/pdf-to-image` page + `download-button.tsx` route-slug fix*
