# Session Note: Session 031 — PDF to Image: Planning, ADR-009 & Acceptance Criteria

**Date:** 2026-07-01
**Session Goal:** Plan PDF to Image — the next feature after Job History (Sessions 027–030, complete), and the top item in `TASKS.md`'s Future Backlog — per the Required Workflow Before Coding in `CLAUDE.md`: read context, surface ambiguities, propose a plan, get explicit approval, and only then write the planning docs.
**Status:** COMPLETE ✅ (planning only — no application code written this session)

---

## What Was Done

### Scope decisions (user-confirmed before any docs were written)

The backlog note ("Converts pages to PNG/JPG") left several concrete decisions unstated. Per the Ask-Before-Assuming and Explain Trade-offs rules, four questions were put to the user directly rather than assumed:

1. **Which PDF rasterization approach?** → Sharp + bundled PDFium (already an installed, vetted dependency per ADR-006; confirmed via research that Sharp's official prebuilt binaries include PDFium, so no new system dependency is introduced). Rejected `pdfjs-dist`+canvas (better fidelity, but two new dependencies and DOM-shim complexity not justified by any demonstrated problem) and a `poppler-utils` CLI wrapper (new system-level binary dependency of the same category `wiki/architecture.md` already reserves for LibreOffice/Word conversion).
2. **Which output format(s) in v1?** → User chooses PNG or JPEG at submit time, mirroring Compress's level-selector UX.
3. **Custom page ranges, or all pages only?** → All pages only — the backlog note doesn't call for ranges; simplest v1 (YAGNI).
4. **Fixed or user-selectable resolution?** → Fixed 150 DPI (matches the DPI already used for Compress's `RECOMMENDED` tier) — no new selector UI needed.

### `docs/adr/009-pdf-to-image-rasterization.md`

Documents the rasterization library decision in full: Sharp + bundled PDFium chosen over `pdfjs-dist`+canvas and a `poppler-utils` CLI wrapper. This is the first feature requiring actual PDF-to-pixel rendering (as opposed to PDF structural manipulation via `pdf-lib`, or re-encoding already-decoded images via Sharp, as Compress does) — `wiki/architecture.md` already documented `pdf-lib`'s lack of rasterization support as a known limitation.

### `wiki/active-feature.md`

Full spec: schema (`JobType.PDF_TO_IMAGE`, new `ImageFormat` enum, `Job.imageFormat`), new API routes (`/api/pdf-to-image/jobs` + status/download, mirroring Compress's routes and Job History's ownership guard exactly), the `/pdf-to-image` frontend page, and 23 acceptance criteria across Upload & Processing, Status/Download/Ownership, History Integration, Frontend, Anonymous Use, and Quality.

**A latent bug was identified (not yet fixed) while writing the spec:** `apps/web/app/history/download-button.tsx` derives its per-type download route as `` `/api/${jobType.toLowerCase()}/jobs/${jobId}/download` ``. This has only ever worked because `MERGE`/`SPLIT`/`COMPRESS` are single words, where `.toLowerCase()` happens to equal the kebab-case route folder name. `PDF_TO_IMAGE` — the first multi-word job type — would produce `pdf_to_image` (underscore) instead of the `pdf-to-image` route folder, breaking the History page's Download control for this job type. This is documented in `wiki/active-feature.md`'s "Existing Code Change Required" section and scheduled as part of Session 033's frontend work (a small route-slug lookup replacing the naive `.toLowerCase()` call) — not a new instability introduced by this feature, but a pre-existing assumption this feature is the first to expose.

### `TASKS.md`, `CHANGELOG.md`

Updated to make PDF to Image the Current Feature (Status: PLANNING) with the Session 031–034 breakdown. Removed from the Future Backlog table (remaining items renumbered 1–9). `CHANGELOG.md` gained a new `[0.6.0]` in-progress section. Branch `feature/pdf-to-image` created off `origin/develop`.

---

## Acceptance Criteria Verified This Session

None — this was a planning-only session. All 23 ACs in `wiki/active-feature.md` remain unchecked, to be verified across Sessions 032–034.

---

## Risks / Notes Carried Forward

- **Rendering fidelity risk (low, monitored):** Sharp's bundled PDFium is the chosen rasterizer (ADR-009); if real-world testing in Session 032 surfaces a PDF that renders incorrectly, that would warrant a follow-up ADR reconsidering `pdfjs-dist`, not a silent workaround.
- **`download-button.tsx` route-slug fix is a small, well-scoped change to already-shipped Job History code** — Session 033 must re-run the existing `download-button.test.tsx` suite (currently covering only single-word job types) alongside adding coverage for the new mapping, to confirm no regression to Merge/Split/Compress's existing Download behavior.
- No implementation spike needed before Session 032 — Sharp's `{ page, density }` and `{ pages: -1 }` metadata API is small and already documented in ADR-009's Implementation Notes.

---

## Next Steps

**Session 032: Schema (`JobType.PDF_TO_IMAGE`, `ImageFormat`) + Worker Processor + API Routes**

Add the schema changes and migration, implement `apps/worker/src/jobs/pdf-to-image.ts` (Sharp-based rasterization + JSZip packaging, mirroring `compress.ts`/`split.ts` patterns), and add `POST /api/pdf-to-image/jobs` + status/download routes (mirroring Compress's routes, including the ADR-008 ownership guard).

---

*Session note written by: Claude Code (claude-sonnet-5)*
*Next session: Session 032 — Schema + Worker Processor + API Routes*
