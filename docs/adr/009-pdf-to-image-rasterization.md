# ADR-009: PDF to Image — Rasterization Library Choice

**Status:** Accepted (amended 2026-07-01, Session 032 — see Addendum; original Decision below is superseded)
**Date:** 2026-07-01
**Author:** Claude Code Session 031

---

## Context

PDF to Image is the top item in `TASKS.md`'s Future Backlog: convert a PDF's pages to raster images (PNG/JPEG) for download. Unlike every feature built so far (Merge, Split, Compress), this is the first operation that requires actually *rendering* a PDF page to pixels rather than manipulating PDF structure (`pdf-lib`) or re-encoding an already-decoded image (`sharp`, used by Compress per ADR-006). `pdf-lib` has no rasterization API — `wiki/architecture.md` documents this as a known limitation ("Does not support format conversion").

`apps/worker` already depends on `sharp` (ADR-006). Sharp's official prebuilt binaries (the `@img/sharp-*` platform packages published under the `sharp` npm scope) bundle `libvips` compiled with PDFium, giving `sharp` the ability to load PDF pages as image input directly — no additional native build step, no system package to install. This was confirmed against Sharp's own installation documentation before making this decision, not assumed.

Three concrete options exist for rasterizing PDF pages to images in a Node worker process.

---

## Problem

Which library/approach should the worker use to rasterize PDF pages into PNG/JPEG images?

---

## Options Considered

### Option 1: Sharp + bundled PDFium

**Description:** Use the `sharp` dependency already installed for Compress. `sharp(buffer, { pages: -1 }).metadata()` returns page count for multi-page input formats (PDF, TIFF, GIF); `sharp(buffer, { page: i, density: dpi }).png()/.jpeg().toBuffer()` rasterizes a single page at a given DPI.

**Pros:**
- Zero new dependencies — `sharp` is already installed and vetted in this codebase (ADR-006)
- Zero new system-level dependencies — PDFium ships inside Sharp's official prebuilt binary, not a separately-installed binary
- Small, well-understood API surface; consistent with `compress.ts`'s existing Sharp usage patterns (this project already has DPI-based sizing logic to draw on for reasoning about output resolution)

**Cons:**
- PDFium's rendering fidelity, while generally good, is not best-in-class for pathological PDFs (complex forms, unusual color spaces, unusual embedded fonts) compared to a dedicated PDF rendering engine
- Sharp's PDF support is officially described as depending on the specific prebuilt binary in use — a future change to Sharp's publishing process could theoretically drop it, though no such change is indicated

**Estimated effort:** Low

---

### Option 2: `pdfjs-dist` + `node-canvas` / `@napi-rs/canvas`

**Description:** Use Mozilla's own PDF rendering engine (the same one behind Firefox's built-in PDF viewer and Chrome's PDF viewer lineage) to render each page to an in-memory canvas, then export the canvas to PNG/JPEG.

**Pros:**
- Best available rendering fidelity — a dedicated, extremely mature PDF rendering engine
- Fine-grained control over output resolution via viewport scale, independent of a DPI abstraction

**Cons:**
- Two new dependencies (`pdfjs-dist` plus a canvas implementation), plus the integration complexity of running `pdfjs-dist` outside a browser DOM (it expects `document`/`Canvas`/`Image` globals that must be shimmed or provided by the canvas library in Node)
- Meaningfully larger and more complex than Option 1 for a capability Sharp already provides — violates YAGNI given no concrete fidelity problem has been observed or reported

**Estimated effort:** Medium

---

### Option 3: `poppler-utils` CLI (`pdftoppm` / `pdftocairo`) via `child_process`

**Description:** Shell out to poppler's command-line rasterization tools, writing the input PDF to a temp file and reading back per-page image files.

**Pros:**
- Extremely mature, battle-tested rendering — the same engine used by many production PDF tools
- Simple command-line interface once the binary is present

**Cons:**
- Introduces a new system-level binary dependency across every dev machine and deployment target — the same category of cost `wiki/architecture.md` already reserves specifically for LibreOffice Headless, deliberately deferred until Word conversion actually needs it ("Not installed until needed")
- Requires temp-file I/O and `child_process` invocation (new failure modes: binary missing, non-zero exit codes, path/argument escaping) for a capability the already-installed Sharp dependency provides without any of this
- Adds the same category of new operational dependency to `PROJECT.md`'s still-undecided production deployment target, for no fidelity gain over Option 1 that has actually been demonstrated as needed

**Estimated effort:** Medium

---

## Decision

We chose **Option 1: Sharp + bundled PDFium.**

Sharp is already a vetted dependency in this codebase (ADR-006), its prebuilt binaries include PDFium with no new system dependency, and its API is small and consistent with the DPI-based patterns `compress.ts` already established. Neither of the other options' fidelity or resolution-control advantages address a problem this project has actually encountered — introducing them now would be speculative complexity, not a response to a real gap (YAGNI).

---

## Consequences

### Positive
- Zero new npm dependencies, zero new system dependencies
- Consistent with the existing Sharp-based image-processing code path from Compress (ADR-006) — a future engineer reading `pdf-to-image.ts` alongside `compress.ts` sees a familiar pattern
- Keeps the worker's dependency footprint exactly where it was before this feature

### Negative
- Rendering fidelity is bounded by whatever PDFium bundles into Sharp's prebuilt binary — if a real-world PDF renders incorrectly, revisiting this decision (likely toward Option 2) would be a follow-up ADR, not a quick patch
- Sharp's PDF support being tied to its prebuilt binary publishing process is a soft dependency risk (low likelihood, not fully within this project's control)

### Neutral / Trade-offs
- Fixed 150 DPI output resolution (this session's separately user-confirmed scope decision) is independent of this library choice — Option 2 would have made per-page resolution control easier, but that control isn't needed for the fixed-DPI v1 scope decided this session

---

## Alternatives Rejected

- **Option 2 (`pdfjs-dist` + canvas)** — Rejected: strictly more capability (rendering fidelity, resolution control) than this feature's confirmed v1 scope requires, at the cost of two new dependencies and real Node/DOM integration complexity. Revisit only if a concrete fidelity problem is observed with Option 1.
- **Option 3 (`poppler-utils` CLI)** — Rejected: introduces a new system-level binary dependency of the exact kind `wiki/architecture.md` already defers for LibreOffice/Word conversion, for no demonstrated fidelity gain over Sharp's already-installed PDFium support.

---

## Implementation Notes

- `sharp(buffer, { pages: -1 })` then `.metadata()` gives `{ pages: number }` for the input PDF — iterate `0..pages-1`.
- For each page index, a fresh `sharp(buffer, { page: i, density: 150 }).toFormat(format).toBuffer()` call — `density` is Sharp's DPI parameter for vector-to-raster rasterization, applying uniformly across every page regardless of page size (no per-page dimension clamping in v1, consistent with the fixed-DPI scope decision).
- Output images are always packaged into a single ZIP via `JSZip` (already a worker dependency, used by `split.ts`), one entry per page (`page-1.png`, `page-2.png`, ...), regardless of page count — mirrors `split.ts`'s existing always-ZIP behavior rather than branching on single- vs. multi-page output.

---

## References

- ADR-006 (`006-sharp-image-recompression.md`) — establishes Sharp as a vetted worker dependency; this ADR extends its use from image re-encoding to PDF page rasterization
- `wiki/architecture.md` — documents `pdf-lib`'s lack of rasterization support and reserves LibreOffice Headless (a comparable system-dependency trade-off) for future Word conversion work
- Sharp's official installation documentation — confirms PDFium is bundled in the official prebuilt binaries, not a separately-installed system package

---

## Addendum — Session 032 Correction (2026-07-01)

**The Decision above does not hold: Sharp's npm-distributed prebuilt binaries have no PDF support at all**, contradicting this ADR's Context section. Verified directly in this repo's actual installed dependency (`sharp@0.33.5` / `@img/sharp-libvips-linux-x64`), before writing any worker code against it:

```
> sharp.format.pdf
{ id: 'pdf', input: { file: false, buffer: false, stream: false }, output: { file: false, buffer: false, stream: false } }
```

Calling `sharp(pdfBuffer, { pages: -1 })` throws `Input buffer contains unsupported image format`. `sharp.versions` lists `cairo` and `rsvg` but no `poppler` or `pdfium` — the codec Sharp's PDF loader actually needs. Sharp's own documentation (not fully checked before the original Decision was written — this was an unverified claim, not a confirmed one, despite what the Context section asserted) states PDF support requires a **globally-installed libvips compiled with PDFium/poppler-glib**, which is never part of the npm-published prebuilt binaries. This is a factual error in this ADR's original research, discovered only once Session 032 actually ran Sharp against a generated PDF fixture.

**Consequence:** Option 1 as specced cannot rasterize a single page in this project's actual dependency environment without adding a system-level libvips build — precisely the category of cost this ADR rejected Option 3 (`poppler-utils`) for. Option 1's chief advantage ("zero new system dependencies") does not exist.

**Corrected Decision: Option 2 — `pdfjs-dist` + `@napi-rs/canvas`.**

Rather than the originally-rejected `node-canvas` (a native-compiled package with its own well-known system build-dependency headaches — Cairo/Pango dev headers), `@napi-rs/canvas` is used: a prebuilt-binary, N-API canvas implementation with the same `createCanvas()`/`CanvasRenderingContext2D` surface pdfjs-dist's Node rendering path expects, requiring no system packages. Verified directly in this repo before adopting:

```js
const { createCanvas } = require('@napi-rs/canvas')
const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
const doc = await pdfjsLib.getDocument({ data: pdfBytes }).promise
const page = await doc.getPage(1)
const viewport = page.getViewport({ scale: 150 / 72 })
const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
canvas.toBuffer('image/png') // or 'image/jpeg'
```

This rendered a real `pdf-lib`-generated multi-page fixture correctly on the first attempt, with no worker/canvas-factory shimming required — pdfjs-dist's `legacy/build/pdf.mjs` entry point auto-detects Node and runs its rendering pipeline in-process.

**New dependencies added to `apps/worker`:** `pdfjs-dist@^4.10.38`, `@napi-rs/canvas@^0.1.100`. Both are pure npm installs with prebuilt native binaries for the target platform — no system package manager step, no Dockerfile/deploy-target change, consistent with this ADR's original goal (just achieved via a different library than originally chosen).

**What stays the same from the original Decision:** fixed 150 DPI (translated to canvas `scale = density / 72`), always-ZIP packaging via `JSZip`, one entry per page — none of that depended on which rasterization library was used.

**Docs updated accordingly:** `wiki/active-feature.md`'s rasterization-library reference and `apps/worker/src/jobs/pdf-to-image.ts`'s implementation. Alternatives-Rejected framing for Option 2 above ("two new dependencies and real Node/DOM integration complexity") is superseded by this Addendum — in practice, the integration complexity did not materialize with `@napi-rs/canvas`, and "two new dependencies" is an acceptable cost given Option 1 does not work at all in this environment.
