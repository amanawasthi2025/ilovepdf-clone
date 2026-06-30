# Wiki: Coding Standards

> These standards apply to all code in this repository.
> They exist to make the codebase consistent, readable, and maintainable across sessions.

---

## Language and Type Safety

### TypeScript

- **Strict mode is required.** Every `tsconfig.json` must include `"strict": true`.
- **No `any`** without a comment explaining why it is unavoidable.
- **Prefer `unknown` over `any`** when the type is genuinely unknown — then narrow it.
- **No non-null assertions (`!`)** without a comment explaining the invariant that makes it safe.
- **Explicit return types** on all exported functions.
- **Prefer `type` over `interface`** for object shapes unless you need declaration merging.

```typescript
// Bad
export function processFile(file: any) { ... }

// Good
export function processFile(file: UploadedFile): Promise<ProcessedFile> { ... }
```

---

## Naming

- **Files:** `kebab-case.ts` for all source files. Components: `kebab-case.tsx`.
- **Components:** `PascalCase`.
- **Functions / variables:** `camelCase`.
- **Constants:** `SCREAMING_SNAKE_CASE` for true compile-time constants; `camelCase` for everything else.
- **Types / interfaces:** `PascalCase`.
- **Database models:** `PascalCase` (Prisma convention).

Names should be **descriptive and self-documenting**:
- `getUserById` not `getUser`
- `maxFileSizeBytes` not `maxSize`
- `isProcessingComplete` not `done`

Avoid abbreviations unless universally understood (`id`, `url`, `api`).

---

## Functions

- **One responsibility per function.** If you need an "and" in the description, split it.
- **Small functions.** Aim for < 30 lines. If it's getting long, extract.
- **Pure functions preferred.** Minimize side effects. Side effects belong at the edges.
- **No silent failures.** Every error must be handled or explicitly propagated.
- **Prefer early returns** to deep nesting.

```typescript
// Bad — deep nesting
function handleJob(job: Job) {
  if (job) {
    if (job.status === 'pending') {
      if (job.files.length > 0) {
        process(job);
      }
    }
  }
}

// Good — early returns
function handleJob(job: Job) {
  if (!job) return;
  if (job.status !== 'pending') return;
  if (job.files.length === 0) return;
  process(job);
}
```

---

## Error Handling

- **Never swallow errors silently.**
- **Never use empty catch blocks.**
- **Log errors with context** — include correlation ID, relevant entity IDs.
- **Distinguish operational errors** (expected: invalid input, file too large) from programmer errors (unexpected: null reference, type mismatch).
- **API errors** must return structured JSON: `{ error: { code: string, message: string } }`.
- **Worker errors** must update the job status to `'failed'` with a reason.

```typescript
// Bad
try {
  await processFile(file);
} catch (e) {
  // ignore
}

// Good
try {
  await processFile(file);
} catch (error) {
  logger.error({ error, jobId: job.id }, 'File processing failed');
  await updateJobStatus(job.id, 'failed', { reason: 'processing_error' });
  throw error; // re-throw if the caller needs to know
}
```

---

## Comments

- **Write comments sparingly.** Well-named code is self-documenting.
- **Comment the WHY, not the WHAT.** If the code reads naturally, no comment is needed.
- **Good comment triggers:** Hidden constraints, non-obvious invariants, workarounds for external bugs, behavior that would surprise a reader.
- **No commented-out code** in commits. Use `git` history for recovery.
- **No `// TODO` comments** without a linked issue or feature in `TASKS.md`.
- **No multi-paragraph docstrings.** One short line max, only when the function name isn't enough.

---

## Imports

- **No circular imports.**
- **Group imports:** external packages first, then internal `@/` paths, then relative paths. Blank line between groups.
- **No wildcard imports** (`import * as X`) unless working with a namespace that requires it.
- **Import types explicitly:** `import type { Foo } from './foo'` for type-only imports.

---

## React / Next.js

- **Server Components by default.** Only add `'use client'` when interactivity or browser APIs are required.
- **Co-locate state close to where it's used.** Lift state only when necessary.
- **No prop drilling beyond 2 levels.** Use context or a state store.
- **Keys in lists must be stable and unique.** Never use array index as key for lists that can reorder.
- **Effect dependencies must be complete.** No suppressing exhaustive-deps warnings without a comment.
- **Form submissions via server actions** (preferred) or `react-hook-form` for complex client-side forms.

---

## API Design

- **REST conventions:** `GET` to read, `POST` to create, `PATCH` to update, `DELETE` to remove.
- **Consistent URL structure:** `/api/v1/<resource>/<id>/<sub-resource>`
- **All inputs validated with Zod** at the route handler boundary.
- **Structured error responses:**
  ```json
  {
    "error": {
      "code": "FILE_TOO_LARGE",
      "message": "File exceeds the maximum allowed size of 50MB."
    }
  }
  ```
- **HTTP status codes used correctly:** 200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 413 Payload Too Large, 422 Unprocessable Entity, 500 Internal Server Error.
- **No sensitive information in error messages** returned to clients.

---

## Environment Variables

- All configuration comes from environment variables (12-Factor App, Factor III).
- Variables are validated at startup using Zod (fail fast if required config is missing).
- A `.env.example` file documents every variable — no secrets, just structure.
- Never commit `.env` files.
- Variable naming: `SCREAMING_SNAKE_CASE`. Prefix with service name for clarity: `DATABASE_URL`, `REDIS_URL`, `S3_BUCKET_NAME`, `S3_ENDPOINT`.

---

## Logging

- Use `pino` (structured JSON logging). Never `console.log` in production code.
- Every log line includes `timestamp`, `level`, `service`, `correlationId`.
- Log levels:
  - `error` — something is broken and requires attention
  - `warn` — something unexpected happened but the system recovered
  - `info` — normal operational events (job started, job completed)
  - `debug` — verbose detail for development/debugging (not enabled in production)
- Never log sensitive data: passwords, tokens, file contents, PII.

---

## Testing Conventions

See `wiki/testing-strategy.md` for the full testing strategy.

- Test files co-located: `foo.ts` → `foo.test.ts`
- Test names: `describe('functionName') > it('returns X when Y')`
- No mocking of things you own — test the real behavior
- Mock at external boundaries only: database (use test DB), S3 (use MinIO), external HTTP (use MSW)

---

## Git Conventions

See `wiki/development-workflow.md` for the full workflow.

- Commit messages: `<type>(<scope>): <description>`
- No commits with failing tests
- No commits with lint errors
- No force-push to `main` or `develop`

---

## File Size and Organization

- **Prefer many small files over a few large ones.**
- A file that exceeds ~200 lines is a signal to split.
- One exported concept per file (one component, one service, one utility function set).
- Group by feature/domain, not by file type:
  ```
  # Preferred (feature-grouped)
  app/merge/page.tsx
  app/merge/merge-service.ts
  app/merge/merge-service.test.ts

  # Avoid (type-grouped)
  components/MergePage.tsx
  services/MergeService.ts
  tests/MergeService.test.ts
  ```

---

*Last updated: 2026-06-30 — Session 001 (Project Initialization)*
