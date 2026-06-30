# Session Note: Session 005 — File Upload API

**Date:** 2026-06-30
**Session Goal:** Implement `POST /api/merge/jobs` — validate uploaded PDF files, store them in MinIO, create a Job record in PostgreSQL, and enqueue a BullMQ merge job.
**Status:** COMPLETE ✅

---

## What Was Done

### New Packages Installed (apps/web)

| Package | Purpose |
|---|---|
| `@aws-sdk/client-s3` | S3-compatible client for MinIO uploads |
| `bullmq` | Job queue (enqueues merge jobs to Redis) |
| `zod` | Environment variable validation; API boundary validation |
| `pino` | Structured JSON logging (satisfies no-console rule) |

### Files Created

```
apps/web/lib/env.ts                            ← Zod-validated env config (fail-fast startup)
apps/web/lib/logger.ts                         ← pino logger singleton
apps/web/lib/storage.ts                        ← S3Client + uploadFile() + ensureBucketExists()
apps/web/lib/queue.ts                          ← BullMQ Queue singleton
apps/web/app/api/merge/jobs/route.ts           ← POST /api/merge/jobs handler
apps/web/app/api/merge/jobs/route.test.ts      ← 7 unit tests (all validation paths + happy path)
.env.example                                   ← Documents all env vars (coding standards requirement)
```

### Files Updated

```
apps/web/next.config.mjs                       ← Added webpack extensionAlias fix
```

### Verification Results

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ 3/3 packages |
| `npm run test` | ✅ 9/9 tests (7 new + 2 from Session 004) |
| `npm run lint` | ✅ No errors |
| `POST /api/merge/jobs` with 2 valid PDFs | ✅ 202 `{"jobId":"..."}` |
| 1 file → 400 `MINIMUM_FILES_REQUIRED` | ✅ |
| Wrong MIME → 400 `INVALID_FILE_TYPE` | ✅ |
| Bad magic bytes → 400 `INVALID_FILE_TYPE` | ✅ |

---

## Design Decisions

### `env.ts` — Zod env validation at module load time

All environment configuration is validated once when `env.ts` is first imported. If a required variable is missing, the process throws immediately rather than crashing mid-request. For unit tests, `@/lib/env` is mocked entirely so no real env values are needed.

### `ensureBucketExists()` — module-level flag

The first call to the upload endpoint checks if the MinIO bucket exists (creating it if not). A `bucketReady` module flag prevents the check from repeating on every subsequent request. The `CreateBucketCommand` is idempotent: we ignore `BucketAlreadyOwnedByYou` / `BucketAlreadyExists` errors.

### `documentProcessingQueue` — URL-parsed Redis connection

BullMQ connection config is constructed by parsing `REDIS_URL` with `new URL()`. This avoids needing `ioredis` as an explicit dependency (BullMQ already installs it as a transitive peer dep).

### Unit test: TOTAL_SIZE_EXCEEDED strategy

To test total-size rejection without allocating hundreds of MB of `Buffer` in-process, the test imports the mocked `env` object and temporarily lowers `MAX_TOTAL_SIZE_BYTES` to 512 bytes. Two 512-byte test files then produce a combined 1024 bytes > 512, triggering the error. The value is always restored in a `finally` block.

### `// @vitest-environment node` on route test file

Next.js API route handlers using `request.formData()` fail in the jsdom environment because jsdom's `FormData` + binary `File` implementation conflicts with Next.js's internal multipart parser. The `node` environment uses Node.js's built-in Web APIs which are compatible with `NextRequest`. The health route test continues using jsdom (which it doesn't need changed since it has no `request.formData()` call).

---

## Issues Encountered

### 1. `packages/shared` imports use `.js` extension — webpack can't resolve them

**Error:** `Module not found: Can't resolve './types/job.js'`

**Root cause:** `packages/shared/src/index.ts` uses `export { ... } from './types/job.js'`. This is correct for TypeScript NodeNext ESM (TypeScript doesn't rewrite imports, so you write the output extension `.js`). But Next.js webpack looks for a real `.js` file.

**Fix:** Added `extensionAlias` to `apps/web/next.config.mjs`:
```javascript
webpack: (config) => {
  config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] }
  return config
}
```
This is the standard pattern for TypeScript-first monorepos using Next.js.

### 2. `npm allow-scripts` required for `msgpackr-extract`

`bullmq` installs `msgpackr-extract` which has a native build script. Approved via `npm approve-scripts msgpackr-extract`. The `allowScripts` entry was added to root `package.json` automatically.

---

## Next Steps

**Session 006: Worker & pdf-lib Merge Processor**

- Install `pdf-lib` in `apps/worker`
- Install `bullmq`, `@aws-sdk/client-s3`, `@prisma/client` in `apps/worker`
- Implement the merge job processor in `apps/worker/src/jobs/merge.ts`
- Wire up the BullMQ Worker in `apps/worker/src/index.ts`
- Unit tests for the merge processor

---

*Session note written by: Claude Code (claude-sonnet-4-6)*
*Next session: Session 006 — Worker & pdf-lib Merge Processor*
