# ADR-010: Image to PDF — Embedding Library and Page-Sizing Choice

**Status:** Accepted
**Date:** 2026-07-01
**Author:** Claude Code Session 035

---

## Context

Image to PDF is `TASKS.md`'s Future Backlog priority #1 — the inverse of PDF to Image (ADR-009): take one or more raster images and produce a single downloadable PDF, one image per page.

Unlike PDF to Image, this feature does not need to *render* anything — it needs to *embed* already-decoded raster images into a new PDF document. `pdf-lib` (already a dependency in both `apps/web` and `apps/worker`, established by ADR-001 for Merge/Split/Compress) is a full PDF-authoring library, not just a manipulation library. Before assuming it could handle this — after ADR-009's Session 032 correction, where an unverified library claim caused a wasted implementation attempt, this project treats "does library X support Y" as something to check against the actual installed package, not something to assume from general familiarity — this was verified directly against the installed `pdf-lib@1.17.1` package's TypeScript definitions in this repo (`node_modules/pdf-lib/cjs/api/PDFDocument.d.ts`, `PDFPage.d.ts`, `PDFImage.d.ts`), which confirm `PDFDocument.embedPng(bytes)`, `PDFDocument.embedJpg(bytes)`, `PDFDocument.addPage([width, height])`, and `PDFPage.drawImage(image, options)` all exist in the installed version.

---

## Problem

Two related decisions:
1. Which library should the worker use to embed images into a new PDF?
2. How should each page be sized relative to its source image?

---

## Options Considered — Embedding Library

### Option 1: `pdf-lib` (already installed)

**Description:** For each input image, call `PDFDocument.embedPng()`/`embedJpg()` (chosen by sniffing the image's magic bytes) to get a `PDFImage`, `addPage([width, height])` sized from that image's pixel dimensions, then `page.drawImage(image, { x: 0, y: 0, width, height })`.

**Pros:**
- Already a vetted dependency in both `apps/web` and `apps/worker` (ADR-001) — zero new dependencies of any kind, npm or system-level
- Confirmed working API surface for exactly this use case (embed + draw), verified against the installed package's typings before writing this ADR
- Consistent with every other worker job (`merge.ts`, `split.ts`, `compress.ts`) already built on `pdf-lib`

**Cons:**
- Native PNG/JPEG embedding only — no built-in support for WEBP/GIF/BMP (out of scope for v1 regardless, see Format Scope decision below)

**Estimated effort:** Low

---

### Option 2: Sharp (convert each image to a single-page PDF, then merge)

**Description:** Use Sharp (already a worker dependency per ADR-006) to convert each image to an intermediate format, then rely on `pdf-lib` merge logic anyway to assemble the final PDF.

**Pros:**
- Sharp is already installed for Compress

**Cons:**
- Strictly more moving parts than Option 1 for a capability `pdf-lib` already provides directly — an unnecessary indirection (image → Sharp → intermediate → pdf-lib merge instead of image → pdf-lib embed, direct)
- No PDF-authoring capability of its own — Sharp cannot create a PDF page; it would still hand off to `pdf-lib` for the actual PDF assembly, making this strictly worse than Option 1 with no offsetting benefit

**Estimated effort:** Medium (for no functional gain)

---

## Options Considered — Page Sizing

### Option A: Page size = image pixel dimensions (chosen)

**Description:** Each PDF page is created at `[imageWidthPx, imageHeightPx]` points, and the image is drawn full-bleed (`x: 0, y: 0`, no scaling). One image pixel maps to one PDF point.

**Pros:**
- Simplest possible implementation — no scaling, centering, or margin math, no aspect-ratio edge cases
- Preserves the image at its native resolution/aspect ratio exactly, with no cropping or letterboxing
- No page-size selector needed in the UI (YAGNI — no demonstrated need for one)

**Cons:**
- A PDF built from images of different pixel dimensions has inconsistent page sizes across the document — unusual if the resulting PDF is printed, though correct on-screen

**Estimated effort:** Low

---

### Option B: Fixed page size (A4), image scaled to fit and centered

**Description:** Every page is a fixed A4 size; each image is scaled (aspect-ratio preserved) to fit within the page and centered, leaving whitespace margins for non-matching aspect ratios.

**Pros:**
- Produces a visually consistent, traditionally "document-like" PDF, closer to a scan-to-PDF tool's typical output

**Cons:**
- Requires scaling/centering math and introduces whitespace-margin edge cases for extreme aspect ratios (very wide or very tall images)
- No demonstrated user need for print-consistent page sizing over exact image fidelity — speculative polish, not a requirement (YAGNI)

**Estimated effort:** Medium

---

## Decision

**Embedding library: Option 1 — `pdf-lib`.** Zero new dependencies, verified API fit, consistent with every other worker job in this codebase.

**Page sizing: Option A — page size matches image dimensions, full-bleed.** Simplest implementation, preserves image fidelity exactly, and matches this project's YAGNI discipline — no page-size selector or scaling logic is added without a demonstrated need. Confirmed with the user during Session 035 planning (two locked scope decisions, alongside format scope below).

---

## Consequences

### Positive
- Zero new npm dependencies, zero new system dependencies — the smallest-footprint feature added to this codebase so far
- Consistent with the existing `pdf-lib`-based worker code path (`merge.ts`, `split.ts`, `compress.ts`)
- No new UI controls needed (no page-size selector, no scaling options)

### Negative
- Mixed-dimension image sets produce a PDF with inconsistent page sizes — acceptable for v1 per the locked scope decision; a future "fit to fixed page size" option (Option B) would be a follow-up feature, not a quick patch, since it changes the drawing math and adds a UI control

### Neutral / Trade-offs
- This decision only affects presentation, not asset fidelity — no image data is scaled or resampled at any point in the pipeline, unlike Compress (ADR-006), which intentionally recompresses image data

---

## Alternatives Rejected

- **Sharp-based embedding (Option 2)** — Rejected: strictly more indirection than `pdf-lib`'s direct embed/draw API for the same result, with no PDF-authoring capability of its own.
- **Fixed A4 page size with scaling (Option B)** — Rejected for v1: no demonstrated need for print-consistent output over exact image fidelity; adds scaling/centering complexity and whitespace edge cases without a concrete requirement driving it. Revisit only if users request it.

---

## Implementation Notes

- Format sniffing: PNG magic bytes (`89 50 4E 47`) vs JPEG magic bytes (`FF D8 FF`), mirroring the existing `PDF_MAGIC`-byte-check pattern already used in `merge.ts`'s and `pdf-to-image.ts`'s API routes — the file's declared MIME type (`image/png` / `image/jpeg`) is validated at the API boundary, and magic bytes are re-validated server-side before processing, same defense-in-depth pattern as every other upload route in this codebase.
- `PDFDocument.embedPng(bytes)` / `embedJpg(bytes)` returns a `PDFImage` exposing `.width`/`.height` in pixels — used directly as the new page's `[width, height]` in `addPage()`.
- Output is a single `application/pdf` file, **not** a ZIP — this mirrors Merge's output shape (N inputs → 1 direct-download PDF), not Split's or PDF to Image's always-ZIP behavior, since there is exactly one output file regardless of input count.
- Page order follows upload/form order — same as `merge.ts`'s existing multi-file ordering.

---

## References

- ADR-001 (`001-pdf-processing-library.md`) — establishes `pdf-lib` as the project's core PDF library
- ADR-006 (`006-sharp-image-recompression.md`) — establishes Sharp as a worker dependency (considered and rejected here as unnecessary for this feature)
- ADR-009 (`009-pdf-to-image-rasterization.md`) and its Session 032 Addendum — the precedent for verifying library capability claims against the actually-installed package before writing implementation code, applied here proactively rather than reactively
- `wiki/architecture.md` — documents `pdf-lib` as the library for "all purely PDF-to-PDF operations"; this feature extends that to image-to-PDF authoring, still within `pdf-lib`'s existing capability
