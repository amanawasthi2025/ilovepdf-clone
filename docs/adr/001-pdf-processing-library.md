# ADR-001: PDF Processing Library

**Status:** Accepted
**Date:** 2026-06-30
**Author:** Claude Code Session 002

---

## Context

The document processing worker needs to manipulate PDF files server-side. The initial required operation is merging: combining two or more PDF files into a single output file in a specified page order. Future planned operations include split, rotate, and watermark.

The choice of processing library directly affects:
- Docker image size and build complexity (system dependencies vs. pure JavaScript)
- Security surface (shell invocations vs. in-process calls)
- Type safety and testability in our TypeScript worker
- Which future operations can be supported without changing the library

---

## Problem

Which library or tool should handle PDF manipulation in the Node.js worker process?

---

## Options Considered

### Option 1: pdf-lib (JavaScript)

**Description:** A pure TypeScript/JavaScript library for creating and modifying PDFs. Runs entirely in-process with no native binaries or system dependencies.

**Pros:**
- Zero system dependencies — no changes to the Docker image beyond `npm install`
- Native TypeScript: full type safety, excellent IDE support, no shell-escape risk
- Handles all initially required operations: merge, split, rotate, add pages, watermark, set metadata
- Actively maintained (MIT license, frequent releases)
- In-process execution: no child_process overhead, easier to unit test with real PDFs
- Errors surface as thrown exceptions, not exit codes

**Cons:**
- Does not support format conversion (PDF → Word, PDF → Image)
- Not suitable for rendering PDFs to raster (no display engine)
- Performance on very large PDFs may be slower than native tools (acceptable for our file size limits)

**Estimated effort:** Low

---

### Option 2: Ghostscript CLI (system tool)

**Description:** Industry-standard PDF utility invoked from Node.js via `child_process.execFile`. Installed as a system package in the Docker image.

**Pros:**
- Battle-tested: decades of production use
- Handles virtually every PDF operation including compression and format conversion
- Output quality for compression and rendering is excellent

**Cons:**
- System dependency: must be installed in the Docker image (adds ~100MB+ to image size)
- Shell invocation introduces a security surface: filenames must be carefully escaped
- Not type-safe: interactions are string-based CLI flags and exit codes
- Harder to unit test: requires Ghostscript installed in the test environment
- Logging and error context are less structured (stderr parsing)
- Licensing: AGPL (commercial use requires compliance review)

**Estimated effort:** Medium

---

### Option 3: PyPDF2 / pypdf (Python worker)

**Description:** Python-native PDF library running in a separate Python worker process. The Node.js worker dispatches to the Python process via a queue or subprocess.

**Pros:**
- Mature Python ecosystem for document processing
- Good support for PDF reading and page manipulation

**Cons:**
- Requires a Python runtime in the worker container (significant image complexity)
- Splits the worker implementation across two languages — two test frameworks, two dependency sets
- Cross-language boundary adds latency and complexity for no meaningful gain over pdf-lib for basic operations
- PyPDF2 is now abandoned (superseded by pypdf); pypdf is newer but less battle-tested than pdf-lib for merge/split

**Estimated effort:** High

---

### Option 4: MuPDF / mupdf-js (WASM-based)

**Description:** MuPDF is a high-performance PDF engine compiled to WebAssembly via mupdf-js, runnable in Node.js.

**Pros:**
- Very fast PDF rendering and manipulation (C library under the hood)
- Comprehensive feature set including rendering and format support

**Cons:**
- WASM bundle is large (~10MB+)
- mupdf-js Node.js bindings are less mature and have a smaller community than pdf-lib
- API is less ergonomic for TypeScript use
- License: AGPL (same compliance concern as Ghostscript)
- Overkill for merge/split operations

**Estimated effort:** High

---

## Decision

We chose **Option 1: pdf-lib** for all purely PDF-to-PDF operations (merge, split, rotate, watermark).

Reasoning:
- The initial operations (merge, and the planned split/rotate/watermark) are all purely PDF-to-PDF — no rendering or format conversion required. pdf-lib handles all of them well.
- Zero system dependencies keeps the Docker image small, the CI pipeline fast, and the security surface narrow.
- TypeScript-native API integrates cleanly with our worker codebase.
- In-process execution makes unit tests simple: pass a `Uint8Array` in, get one back, assert on it.
- The one significant limitation (no format conversion) affects features that are many sessions away (PDF→Word is Feature 9 in the backlog). When that time comes, LibreOffice headless will be added alongside pdf-lib — not instead of it.

---

## Consequences

### Positive
- Worker Docker image stays small and simple (no system packages beyond Node.js)
- PDF processing logic is fully unit-testable with real fixture files
- No shell invocation means no shell-escape vulnerabilities
- TypeScript types throughout the processing pipeline

### Negative
- Format conversion (PDF ↔ Word, PDF ↔ Image) cannot be done with pdf-lib; a second library will be required for those features
- Very large PDFs (approaching our 50MB/file limit) may process more slowly than Ghostscript

### Neutral / Trade-offs
- pdf-lib parses and re-serializes the entire PDF; it does not stream. This is acceptable given our 50MB per-file limit but would be a concern at much larger sizes.
- We accept the format conversion limitation explicitly — it is documented in `wiki/architecture.md` and does not affect the first three features in the backlog.

---

## Alternatives Rejected

- **Ghostscript** — Rejected: AGPL license risk, system dependency, shell invocation security surface, poor TypeScript integration.
- **PyPDF2/pypdf** — Rejected: Python runtime adds image complexity; cross-language boundary adds overhead with no benefit for basic operations.
- **MuPDF/mupdf-js** — Rejected: AGPL license, immature Node.js bindings, WASM overhead, overkill for our use case.

---

## Implementation Notes

- Import: `import { PDFDocument } from 'pdf-lib'`
- Merge pattern: `PDFDocument.create()`, then `copyPages()` from each input document, then `save()`
- Input files are fetched from MinIO as `Buffer`, converted to `Uint8Array` for pdf-lib
- Output is a `Uint8Array`, uploaded back to MinIO as a PDF
- When LibreOffice headless is introduced (Feature 9+), it runs as a separate processor alongside the pdf-lib processor — not as a replacement

---

## References

- pdf-lib documentation: https://pdf-lib.js.org
- pdf-lib GitHub: https://github.com/Hopding/pdf-lib
- Related: `wiki/architecture.md` — Document Processing Libraries section
- Future: LibreOffice headless will be documented in a new ADR when introduced

---

*This template follows the format recommended by Michael Nygard (https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)*
