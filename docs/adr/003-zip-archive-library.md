# ADR-003: ZIP Archive Library for Split Output

**Status:** Accepted
**Date:** 2026-07-01
**Author:** Claude Code Session 011

---

## Context

PDF Split produces multiple output PDFs (one per requested page range) from a single job. Per the approved feature decision, these outputs are delivered to the user as a single ZIP archive rather than multiple individual download links — this reuses the existing `Job.outputKey: String?` field and the download endpoint shape unchanged from Merge.

The worker (`apps/worker`) currently follows an in-memory, non-streaming pattern throughout: `downloadFile()` returns a `Buffer`, pdf-lib operates on `Uint8Array`/`Buffer` in memory, and `uploadFile()` accepts a single `Buffer` (see `apps/worker/src/lib/storage.ts`, `apps/worker/src/jobs/merge.ts`). This is consistent with ADR-001's choice of pdf-lib, which itself does not stream. File size limits (50MB/file, 200MB total per job, per `wiki/active-feature.md`) make in-memory handling acceptable.

---

## Problem

Which library should the worker use to build a ZIP archive from the set of split PDF buffers before uploading it to MinIO?

---

## Options Considered

### Option 1: jszip

**Description:** Pure JavaScript, in-memory ZIP creation and reading. Add files via `zip.file(name, buffer)`, then call `zip.generateAsync({ type: 'nodebuffer' })` to get a single `Buffer`.

**Pros:**
- In-memory API matches the worker's existing pattern exactly — output is a `Buffer`, passed directly to the existing `uploadFile(key, body: Buffer, contentType)` with no signature changes
- Pure JavaScript, no native dependencies, MIT license
- Simple, well-documented API; easy to unit test (build a zip, read it back with the same library, assert entries)
- Actively maintained, very widely used

**Cons:**
- Builds the full archive in memory before returning it — not suitable for very large archives (acceptable here given the 200MB total job size cap)

**Estimated effort:** Low

---

### Option 2: archiver

**Description:** Streaming ZIP library built around Node.js streams — `archive.append(buffer, { name })`, `archive.pipe(writableStream)`, `archive.finalize()`.

**Pros:**
- Streaming design scales to very large archives without holding the whole thing in memory
- Mature, widely used in Node.js backends

**Cons:**
- Stream-based API does not fit the worker's current Buffer-in/Buffer-out pattern — would require either buffering the stream back into memory anyway (defeating the benefit) or changing `uploadFile()` to accept a `Readable`, which has no other caller today
- Adds API surface and test complexity (stream assembly, error propagation through pipes) for no benefit at our file size limits

**Estimated effort:** Medium

---

### Option 3: adm-zip

**Description:** Synchronous, in-memory ZIP library — `zip.addFile(name, buffer)`, `zip.toBuffer()`.

**Pros:**
- Simple synchronous API, in-memory like jszip
- No native dependencies

**Cons:**
- Synchronous (blocking) archive generation ties up the Node.js event loop during compression — undesirable in a worker process handling concurrent jobs (`WORKER_CONCURRENCY`)
- Smaller community and slower release cadence than jszip

**Estimated effort:** Low

---

## Decision

We chose **Option 1: jszip**.

Reasoning:
- It is the only option whose API matches the worker's existing in-memory, async, Buffer-in/Buffer-out pattern without requiring changes to `uploadFile()` or introducing a second I/O model alongside pdf-lib
- Async generation (`generateAsync`) does not block the event loop, unlike adm-zip
- The streaming benefits of `archiver` are not needed at our enforced size limits (200MB total per job) and would add complexity (ADR-001's same reasoning: prefer the simpler in-process model given current scale)

---

## Consequences

### Positive
- No changes needed to `apps/worker/src/lib/storage.ts` — `uploadFile()` keeps its existing `Buffer` signature
- Split processor follows the same testable shape as `processMergeJob()`: build buffers in memory, assert on the result directly in unit tests
- Zero new system dependencies in the worker Docker image

### Negative
- Not suitable if a future feature required archiving far larger total payloads than 200MB; would need to be revisited (likely alongside a switch to streaming uploads generally, affecting Merge too)

### Neutral / Trade-offs
- Consistent with the in-memory trade-off already accepted for pdf-lib in ADR-001 — we are not introducing a new scaling limitation, just extending the existing one to archive creation

---

## Alternatives Rejected

- **archiver** — Rejected: stream-based API mismatches the worker's existing Buffer-based I/O; would add complexity with no benefit at current size limits.
- **adm-zip** — Rejected: synchronous archive generation blocks the event loop in a worker process designed for concurrent job processing.

---

## Implementation Notes

- Import: `import JSZip from 'jszip'`
- Pattern: `const zip = new JSZip(); zip.file('range-1-3.pdf', buffer1); ...; const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })`
- Output uploaded via existing `uploadFile(outputKey, zipBuffer, 'application/zip')`
- Per-file naming inside the archive: `split-<startPage>-<endPage>.pdf` (matches the requested range)

---

## References

- Related: ADR-001 (PDF Processing Library) — same in-memory reasoning applied here
- Related: `apps/worker/src/lib/storage.ts` — existing `uploadFile()` signature this decision preserves
- jszip documentation: https://stuk.github.io/jszip/

---

*This template follows the format recommended by Michael Nygard (https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)*
