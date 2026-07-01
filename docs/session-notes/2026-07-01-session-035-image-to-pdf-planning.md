# Session Note: Session 035 — Image to PDF: Planning, ADR-010 & Acceptance Criteria

**Date:** 2026-07-01
**Session Goal:** Plan Image to PDF — the next feature after PDF to Image (Sessions 031–034, complete), and the top item in `TASKS.md`'s Future Backlog — per the Required Workflow Before Coding in `CLAUDE.md`: read context, surface ambiguities, propose a plan, get explicit approval, and only then write the planning docs.
**Status:** COMPLETE ✅ (planning only — no application code written this session)

---

## What Was Done

### Library research before writing the ADR

Before assuming any library choice, `pdf-lib@1.17.1` (already installed in both `apps/web` and `apps/worker` per ADR-001) was checked directly against its installed TypeScript definitions (`node_modules/pdf-lib/cjs/api/PDFDocument.d.ts`, `PDFPage.d.ts`, `PDFImage.d.ts`) to confirm `embedPng`/`embedJpg`/`addPage`/`drawImage` actually exist in this project's installed version — applying the lesson from ADR-009's Session 032 correction (an unverified Sharp/PDF claim there caused a wasted implementation attempt) proactively rather than reactively. Confirmed: `pdf-lib` can embed PNG/JPEG images and author new PDF pages directly, meaning this feature needs **zero new dependencies**, npm or system-level.

### Scope decisions (user-confirmed before any docs were written)

Two concrete product decisions were ambiguous and put to the user directly (Ask-Before-Assuming / Explain Trade-offs):

1. **How should each image be sized on its PDF page?** → Page size = image pixel dimensions, image drawn full-bleed with no scaling. Rejected a fixed-A4-with-scaling-and-centering alternative — no demonstrated need for print-consistent page sizing over exact image fidelity (YAGNI); that alternative also adds real scaling/centering/whitespace-margin complexity.
2. **Which input image formats for v1?** → PNG and JPEG only, matching `pdf-lib`'s native embed support exactly and mirroring the existing `ImageFormat` enum. Rejected broader format support (WEBP/GIF/BMP via a Sharp conversion step) as unneeded v1 scope.

Additional decisions made without a question (low ambiguity, consistent with existing patterns, stated in the plan and not pushed back on): 1–10 images per job (unlike Merge's 2-file minimum — a single image is a valid use case), upload-order pages (mirrors Merge), single direct-download PDF output rather than a ZIP (mirrors Merge's output shape, not Split's/PDF to Image's always-ZIP behavior, since there's always exactly one output file).

### `docs/adr/010-image-to-pdf-embedding.md`

Documents both decisions in full: `pdf-lib` chosen over a Sharp-based indirection for embedding (Sharp has no PDF-authoring capability of its own — it would still hand off to `pdf-lib`, making it strictly worse for no gain), and image-dimensioned full-bleed pages chosen over fixed-A4-with-scaling for page sizing.

### `wiki/active-feature.md`

Full spec: schema (`JobType.IMAGE_TO_PDF`, no new columns — `inputKeys`/`outputKey` already fit, unlike PDF to Image which needed a new `imageFormat` field), new API routes (`/api/image-to-pdf/jobs` + status/download, mirroring Merge's multi-file upload route and Job History's ownership guard exactly), the `/image-to-pdf` frontend page, and 24 acceptance criteria across Upload & Processing, Status/Download/Ownership, History Integration, Frontend, Anonymous Use, and Quality.

**Two existing lookup tables identified as needing a new entry (not new bugs — Session 037 work):** `apps/web/app/history/download-button.tsx`'s `JOB_TYPE_ROUTE_SLUGS` map and `apps/web/app/history/page.tsx`'s `JOB_TYPE_LABELS` map. Both were generalized in Sessions 033/034 specifically to handle multi-word job types correctly (the `PDF_TO_IMAGE` route-slug bug and missing-label gap found during that feature) — `IMAGE_TO_PDF` is exactly the case those maps were built to cover, so this is expected incremental work, not a regression.

### `TASKS.md`, `CHANGELOG.md`

Updated to make Image to PDF the Current Feature (Status: IN PROGRESS — Session 035 Planning complete) with the Session 035–038 breakdown. Removed from the Future Backlog table (remaining items renumbered 1–8). `CHANGELOG.md` gained a new `[0.7.0]` in-progress section. Branch `feature/image-to-pdf` created off `develop`.

---

## Acceptance Criteria Verified This Session

None — this was a planning-only session. All 24 ACs in `wiki/active-feature.md` remain unchecked, to be verified across Sessions 036–038.

---

## Risks / Notes Carried Forward

- **No implementation spike needed before Session 036** — `pdf-lib`'s embed/draw API is small, already used elsewhere in this codebase (`merge.ts`, `split.ts`, `compress.ts`), and was verified against installed typings this session (see ADR-010).
- **Mixed page sizes across a single output PDF are expected, not a bug** — a locked v1 scope decision (image-dimensioned pages), not an oversight. Worth remembering if a future session is tempted to "fix" inconsistent page sizes without a explicit scope change.
- Session 037 must add `IMAGE_TO_PDF` entries to both `JOB_TYPE_ROUTE_SLUGS` and `JOB_TYPE_LABELS`, and re-run the existing `download-button.test.tsx`/`page.test.tsx` suites to confirm no regression to the other four job types' History behavior.

---

## Next Steps

**Session 036: Schema (`JobType.IMAGE_TO_PDF`) + Worker Processor + API Routes**

Add the schema migration, implement `apps/worker/src/jobs/image-to-pdf.ts` (`pdf-lib`-based embed-and-assemble, mirroring `merge.ts`'s structure), and add `POST /api/image-to-pdf/jobs` + status/download routes (mirroring `/api/merge/jobs`'s multi-file validation and the ADR-008 ownership guard).

---

*Session note written by: Claude Code (claude-sonnet-5)*
*Next session: Session 036 — Schema + Worker Processor + API Routes*
