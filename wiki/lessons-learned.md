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

### 2026-06-30 — Never call `setState` inside TanStack Query's `select`
**Context:** PDF Merge frontend — `useQuery` polling job status; `select` was used to drive DONE/ERROR phase transitions.
**What happened:** `select` is a pure transform called on *every render* to shape cached data, not only when new data arrives from the network. Calling `setPhase()` inside it triggered a re-render → `select` ran again → `setPhase()` again → infinite loop crash (`Too many re-renders`).
**Lesson:** `select` is for transforming/filtering data only. Side effects (including `setState`) that react to new fetch results belong in `useEffect` with the query `data` as a dependency.
**Applies to:** architecture, async processing

### 2026-06-30 — npm workspace `devDependencies` are hoisted; local `.bin/` may be empty
**Context:** Worker `dev` script updated to use `node --env-file` + explicit tsx path.
**What happened:** `tsx` is a `devDependency` of `apps/worker` but npm workspaces hoisted it to the root `node_modules`. `apps/worker/node_modules/.bin/tsx` did not exist. The script referencing a local path failed at startup.
**Lesson:** In npm workspaces, never assume a package's binary is in the local `node_modules/.bin/`. Either use `../../node_modules/.bin/<bin>` for the root path, or use `npx <bin>` which resolves across the workspace.
**Applies to:** DX, developer experience

### 2026-06-30 — Local dev env vars require explicit loading for non-Next.js processes
**Context:** Worker startup — env vars not found despite `.env` existing at project root.
**What happened:** Next.js auto-loads `.env.local` from its own project directory. `tsx` (and Node.js generally) does not. The worker's Zod env schema threw at startup because all variables were `undefined`.
**Lesson:** For any non-Next.js Node process in the monorepo, the `dev` script must explicitly load env vars — use Node 20+'s `--env-file=../../.env` flag. For Next.js, copy or symlink the root `.env` to `apps/web/.env.local`.
**Applies to:** DX, developer experience

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

*Last updated: 2026-06-30 — Session 010 (PDF Merge Complete)*
