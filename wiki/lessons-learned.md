# Wiki: Lessons Learned

> A record of things that surprised us, mistakes we made, and techniques that worked well.
> Future sessions should consult this before making similar decisions.
> Each entry includes what happened and what we'd do differently.

---

## How to Add an Entry

Add entries after completing a feature, resolving a production issue, or completing a CodeRabbit review. Format:

```
### YYYY-MM-DD — <Short Title>
**Context:** What were we doing when this came up?
**What happened:** What was surprising, wrong, or worked well?
**Lesson:** What should we do differently (or the same) next time?
**Applies to:** <area: testing, architecture, DX, security, performance, workflow>
```

---

## Lessons

*(No entries yet — this file will be populated as features are built and reviewed.)*

---

## Categories to Watch

The following categories commonly produce learnable moments in document-processing systems:

**File Handling**
- MIME type validation vs. file extension validation (they can differ)
- Handling corrupted or password-protected PDFs
- Large file processing and memory pressure

**Async Processing**
- Job queue failure modes and retry behavior
- Worker crashes mid-job (partial output cleanup)
- Status polling UX (how often, what states to show)

**Developer Experience**
- Local dev environment setup friction
- Test fixture quality (too small = misses real bugs)
- Type drift between frontend and backend

**Security**
- Path traversal in filename handling
- Upload MIME type spoofing
- Timing attacks on file availability checks

**Performance**
- Memory usage in pdf-lib for large documents
- Redis connection pool sizing for workers
- S3 presigned URL expiry mismatches

---

*Last updated: 2026-06-30 — Session 001 (Project Initialization)*
