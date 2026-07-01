# Wiki: Lessons Learned

> A record of things that surprised us, mistakes we made, and techniques that worked well.
> Future sessions should consult this before making similar decisions.
> Each entry includes what happened and what we'd do differently.

---

## How to Add an Entry

Add entries after completing a feature, resolving a production issue, or a notable PR self-review finding. Format:

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

### 2026-07-01 — App Router's client Router Cache can outlive the state it depends on
**Context:** User Authentication frontend — after `signIn('credentials', { redirect: false })` succeeds client-side, `router.push('/')` was used to return to the home page.
**What happened:** The nav (a server component reading `auth()`) kept showing the stale logged-out state, even though the new session cookie was already set correctly. Next.js's client Router Cache reuses the previously-rendered root layout across a soft navigation instead of re-invoking server components in it; `router.refresh()` before the push did not fix it either. A hard reload always showed the correct state, isolating the bug to router-cache staleness rather than the cookie/session itself.
**Lesson:** When a client action changes state that a server component depends on (here: the session cookie feeding `auth()` in the root layout's nav), use a full navigation (`window.location.href`) for the immediately-following redirect rather than `router.push` — the same full-round-trip approach the logout server action already used unaffected.
**Applies to:** architecture, DX

### 2026-07-01 — Auth.js v5 forces JWT sessions for a Credentials-only provider
**Context:** User Authentication planning (ADR-007) originally specified database sessions (`session.strategy: 'database'`) to match the project's existing pattern of Postgres as the source of truth.
**What happened:** Auth.js rejects database sessions when Credentials is the only configured provider — discovered mid-implementation (Session 024), not during planning, requiring a same-session correction (ADR-007 Addendum) that touched the schema doc, API contract, and several acceptance criteria's wording.
**Lesson:** For future auth-adjacent work, check a library's documented provider/session-strategy compatibility matrix during the planning session, before locking scope decisions into an ADR — not just its headline feature list.
**Applies to:** architecture, workflow

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

### 2026-07-01 — When an AC's example trigger is structurally unreachable, seed the failure state directly
**Context:** PDF Split Session 015 — AC-21 says "if the split job fails after being queued (e.g. corrupted PDF), the page shows the ERROR state."
**What happened:** A corrupted PDF can never actually reach the worker as a post-queue failure in this system, because `POST /api/split/jobs` runs the exact same magic-bytes check and `PDFDocument.load()` call the worker runs — corrupt files are rejected with `400` before a job is ever enqueued. Attempting to "exercise" AC-21 with a literal corrupted upload would just re-test the upload validator, not the post-queue failure path.
**Lesson:** When a spec's example trigger turns out to be unreachable through the real flow because an earlier validation layer already prevents it, don't force a flaky or misleading test around it. Seed the target state directly (here: a `Job` row written via Prisma with `status: FAILED`, plus a Playwright `page.route()` intercept on the upload POST to point at it) so the test exercises the actual reachable code — the status endpoint and the UI's polling/ERROR-state logic — deterministically.
**Applies to:** testing, async processing

### 2026-07-01 — A required-approval branch rule isn't satisfied by a bot's "COMMENTED" review
**Context:** Disabling CodeRabbit as a workflow gate (user instruction) while PR #3 (feature/pdf-split → develop) was open.
**What happened:** `develop`'s branch protection requires 1 approving review. Checking PR #2's (PDF Merge) review history showed CodeRabbit's review state was `COMMENTED`, never `APPROVED` — so CodeRabbit was never actually satisfying that gate; PR #2 was merged by the repo owner directly, who bypasses branch protection as an admin (`enforce_admins: false`). Removing CodeRabbit from the workflow didn't remove a working approval source — there wasn't one — it just made the always-present gap visible.
**Lesson:** Don't assume a status-check bot is providing what a branch protection rule asks for; check the actual review `state`, not just that the bot ran. Required-approval rules and required-status-check rules are enforced differently (and admins can bypass the former but not, by default, the latter) — verify both before assuming a PR can merge cleanly through the API.
**Applies to:** workflow, DX

### 2026-06-30 — `COPY . .` without `.dockerignore` silently re-imports the host's build artifacts
**Context:** Manually verifying PDF Split end-to-end via `docker compose up`, ahead of starting the next feature.
**What happened:** Neither `Dockerfile.web` nor `Dockerfile.worker` had a `.dockerignore`. `RUN npm install` correctly produced an Alpine-native (`musl`) `node_modules`, but the following `COPY . .` overwrote it with the host's `node_modules` — including a Prisma client built for the host's glibc and `packages/shared/dist` built on the host. The container booted but every DB-touching route 503'd with a Prisma engine mismatch, and `/api/split/jobs` 500'd with `Module not found: @ilovepdf/shared` once the dockerignore fix removed the accidental host copy. Three separate fixes were needed together: add `.dockerignore` (exclude `node_modules`, `.git`, `.next`, `dist`), add `RUN npx prisma generate` after `COPY . .` (schema didn't exist at `npm install` time, so Prisma's postinstall hook had nothing to read), add `openssl` to `apk add` (Alpine lacked it, so Prisma's musl engine detection at generate-time silently picked the wrong binary target), and add `RUN npm run build --workspace=@ilovepdf/shared` (its `dist/` is gitignored, so it must be compiled in-image, not inherited from the host).
**Lesson:** A monorepo Dockerfile that does `COPY . .` after `npm install` needs a `.dockerignore` from day one — without it, the image silently runs on a mix of container-built and host-built artifacts that happens to "work" until a platform-specific binary (a native addon, a Prisma engine) is involved, then fails in a way that looks like an application bug. Test `docker compose up --build` from a clean state (or at least reason about what `COPY . .` actually copies) before trusting a containerized dev environment.
**Applies to:** DX, developer experience, infrastructure

### 2026-07-01 — A library's custom `Error` subclass can silently fail `instanceof` in an ES5 build
**Context:** PDF Compress Session 019 — detecting encrypted PDFs by catching pdf-lib's `EncryptedPDFError` from `PDFDocument.load()`.
**What happened:** `catch (err) { if (err instanceof EncryptedPDFError) ... }` never matched, even though pdf-lib clearly threw that error type. pdf-lib 1.17.1's build targets ES5, and its `EncryptedPDFError` extends the native `Error` via a helper whose `super()` call returns a fresh plain `Error` object rather than initializing `this` — a known ES5-transpilation pitfall for subclassing built-ins. The thrown object's prototype chain doesn't actually include `EncryptedPDFError.prototype`.
**Lesson:** When an `instanceof` check against a third-party library's custom error class silently fails, suspect the library's build target before assuming the wrong error is being thrown — log/inspect the caught object's constructor name and message directly. A message-substring match (`err.message.includes('is encrypted')`) is a reasonable fallback when a library's error hierarchy can't be trusted across its transpiled build.
**Applies to:** architecture, testing

### 2026-07-01 — When a library exposes low-level document structure but no rendering semantics, you may have to compute geometry yourself
**Context:** PDF Compress Session 020 — downsampling embedded images to a target DPI required knowing each image's actual placed size on the page, not just its raw pixel dimensions.
**What happened:** pdf-lib has no public API for reading what size/position a page actually draws an image XObject at — that information only exists as operators (`cm`, `Do`) inside the page's content stream. Recompressing purely off pixel dimensions would have downsampled correctly-sized images and under-downsampled oversized ones. A minimal hand-rolled tokenizer tracking `q`/`Q`/`cm`/`Do` through the content stream was needed to resolve the effective CTM at each draw call — also handling an image reused at different sizes across pages (keep the largest) and rotated placements.
**Lesson:** A "read-only" library operation (here: figuring out an image's on-page size) can require reimplementing a sliver of the format's execution model when the library only exposes structure, not semantics. Before writing that code, check whether the scope can be narrowed (this implementation explicitly did not walk into nested Form XObjects, falling back to quality-only recompression there) rather than building a general-purpose interpreter for a v1.
**Applies to:** architecture, performance

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

*Last updated: 2026-07-01 — Session 022 (PDF Compress Complete)*
