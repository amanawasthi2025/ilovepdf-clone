# ADR-006: Sharp for Image Recompression in PDF Compress

**Status:** Accepted
**Date:** 2026-07-01
**Author:** Claude Code Session 018

---

## Context

PDF Compress needs to meaningfully reduce PDF file size. ADR-001 chose `pdf-lib` for all PDF-to-PDF operations (merge, split, rotate, watermark, metadata) specifically to avoid system dependencies, shell invocation, and AGPL licensing risk. That ADR's own pros list for pdf-lib does **not** include compression — pdf-lib re-serializes a PDF's object graph but does not decode, downsample, or re-encode embedded raster images, which is where the large majority of real-world PDF size reduction comes from. A pdf-lib-only compressor would only recover object-table/duplicate-object overhead (typically low single-digit percent, near-zero on already-optimized files) and would not meet the baseline expectation of a "Compress PDF" tool in this product category.

`wiki/architecture.md`'s Document Processing Libraries section already lists **Sharp** as a planned future dependency, earmarked for the PDF-to-Image feature (backlog #5): "High-performance image processing (Node.js + libvips). Used for: image resizing, format conversion... Not installed until needed." This ADR is the point at which it becomes needed — pulled forward from PDF-to-Image to PDF Compress, which needs the same underlying capability (decode a raster image, resize/re-encode at a target quality).

---

## Problem

Which approach should the worker use to achieve real, meaningful PDF file size reduction, given ADR-001's constraint against system dependencies and shell invocation?

---

## Options Considered

### Option 1: pdf-lib + Sharp

**Description:** Enumerate image XObjects in the PDF via pdf-lib's low-level object API (`PDFDocument.context`), extract each image's raw stream bytes, decode/downsample/re-encode with Sharp (libvips via native bindings, no shell invocation), and write the recompressed bytes back into the same XObject stream before saving.

**Pros:**
- Real compression: image downsampling and re-encoding is where the actual file size savings live
- No shell invocation, no `child_process` — Sharp's native bindings are called in-process, consistent with ADR-001's "no shell-escape risk" reasoning
- Permissive license (Apache 2.0), no AGPL compliance review needed
- Already the planned choice for a near-future feature (PDF-to-Image) — not a net-new dependency decision, just an earlier pull-forward
- Combined with pdf-lib's `useObjectStreams: true` (free, lossless object-table compression), gives compounding gains

**Cons:**
- Significantly more complex than any prior feature's worker logic: reading/replacing raw XObject stream bytes and their dictionary entries (`Filter`, `Width`, `Height`, `ColorSpace`, `BitsPerComponent`) is not a first-class pdf-lib API — it requires working with pdf-lib's low-level object model (`PDFRawStream`, `PDFDict`, `PDFName`)
- v1 scope must exclude CMYK and Indexed-color images (see `wiki/active-feature.md` scope decisions) — round-tripping those color spaces through Sharp reliably is materially harder and not required for a first version
- Exact low-level pdf-lib API surface for this (whether raw stream decoding helpers are public in the installed `pdf-lib@^1.17.1`) has not yet been spiked — flagged as a risk for Session 020, not yet fully de-risked

**Estimated effort:** Medium-High

---

### Option 2: pdf-lib only (object-table optimization)

**Description:** Rely solely on pdf-lib's `save({ useObjectStreams: true })` and manual removal of duplicate/unused objects. No image recompression.

**Pros:**
- Zero new dependencies
- Simplest possible implementation, fully consistent with ADR-001 as originally written
- Lossless — no risk of visible quality degradation

**Cons:**
- Does not deliver what users expect from a "Compress" tool — savings are marginal (rarely more than 5-10%) and near-zero on the common case of image-heavy PDFs (scanned documents, photo-containing reports)
- Ships a feature that would likely need to be redone once real compression is prioritized, wasting the session investment

**Estimated effort:** Low

---

### Option 3: Ghostscript CLI

**Description:** Shell out to Ghostscript with a quality preset (`-dPDFSETTINGS=/ebook`, etc.), as already evaluated and rejected in ADR-001.

**Pros:**
- Industry-standard compression quality, well past what a custom pdf-lib+Sharp pipeline is likely to match on the first attempt
- Handles every image color space and filter type without custom code

**Cons:**
- Directly reverses ADR-001's reasoning: reintroduces a system dependency, a shell invocation security surface, and AGPL licensing review
- Nothing about PDF Compress's requirements has changed since ADR-001 that would justify overturning that decision — the same trade-offs apply

**Estimated effort:** Medium

---

## Decision

We chose **Option 1: pdf-lib + Sharp**.

Reasoning:
- It is the only option that delivers real compression while staying inside the architectural boundaries this project has already committed to (in-process, no shell-out, no system dependency, permissive license)
- Sharp was already the documented future choice for image work in `wiki/architecture.md` — this decision executes an existing plan rather than opening a new one
- The added complexity (Option 1's main con) is scoped down deliberately in `wiki/active-feature.md` (RGB/Grayscale JPEG/PNG-style images only, v1) to keep the first implementation tractable; broader color-space support can be added later without an architecture change

---

## Consequences

### Positive
- No new system dependencies in the worker Docker image (Sharp ships prebuilt native binaries via npm, no separate install step)
- Meaningful, real file size reduction — the feature actually does what it claims to do
- Establishes the image-decode/re-encode pattern that PDF-to-Image (backlog #5) will reuse directly

### Negative
- Worker logic for this feature is the most complex written so far in this project — low-level pdf-lib object manipulation, not just its high-level document API
- CMYK and Indexed-color images pass through unmodified in v1 — compression results will vary more than users might expect on PDFs containing those color spaces (documented as a known limitation, not a silent gap)

### Neutral / Trade-offs
- Sharp adds ~30-50MB of native binary payload to `apps/worker`'s `node_modules` (prebuilt libvips) — acceptable; there is no Docker image size concern to weigh against since ADR-004 already removed containerized deployment for local dev, and production packaging is still TBD
- The exact low-level pdf-lib API needed (raw stream decode/replace) is confirmed only at the "this is how pdf-lib's object model works" level, not yet against the specific installed version — Session 020 opens with a short spike to confirm before committing to the full processor

---

## Alternatives Rejected

- **pdf-lib only** — Rejected: does not deliver meaningful compression on the common case (image-heavy PDFs); would ship a feature that doesn't do what it claims.
- **Ghostscript** — Rejected: same reasoning as ADR-001 (system dependency, shell invocation surface, AGPL licensing risk). Nothing about this feature's requirements changes that calculus.

---

## Implementation Notes

- Sharp added as a dependency of `apps/worker` only — `apps/web` never touches raw image bytes, so it does not need Sharp
- Compression pipeline (per image XObject): read raw stream bytes → decode per existing `Filter` (DCTDecode = already JPEG, pass through to Sharp directly; FlateDecode raw bitmap = inflate then hand to Sharp as raw pixel data) → `sharp(...).resize({ withoutEnlargement: true, ... }).jpeg({ quality })` → write re-encoded bytes back into the XObject's stream, updating `Filter` to `/DCTDecode` and `Width`/`Height` if resized
- Always apply `useObjectStreams: true` on `PDFDocument.save()` regardless of compression level or image content
- v1 image scope: RGB and Grayscale JPEG (`DCTDecode`) and raw/Flate bitmap (`FlateDecode`) XObjects only. Images with `ColorSpace` of `/DeviceCMYK` or `/Indexed`, or `Filter` of `/JPXDecode` (JPEG2000) or `/CCITTFaxDecode`, are left untouched — detected and skipped, not treated as errors
- Session 020 opens with a small proof-of-concept spike against a real fixture PDF to confirm the exact pdf-lib low-level API before writing the full processor

---

## References

- Related: ADR-001 (PDF Processing Library) — the constraint this decision operates within
- Related: `wiki/architecture.md` — Document Processing Libraries section, where Sharp was originally earmarked for PDF-to-Image
- Related: `wiki/active-feature.md` — PDF Compress scope decisions (image color-space/filter scope, compression levels)
- Sharp documentation: https://sharp.pixelplumbing.com
- pdf-lib low-level object model: https://pdf-lib.js.org (Advanced Usage / PDFDocument.context)

---

*This template follows the format recommended by Michael Nygard (https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)*
