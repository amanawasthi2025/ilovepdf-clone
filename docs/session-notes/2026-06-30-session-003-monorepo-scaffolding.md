# Session Note: Session 003 — Monorepo Scaffolding & Dev Environment

**Date:** 2026-06-30
**Session Goal:** Initialize the Turborepo monorepo, scaffold all three packages, configure all tooling, and get typecheck + lint + test passing across the whole workspace.
**Status:** COMPLETE ✅ (with one AC requiring local verification — see below)

---

## What Was Done

### Files Created

```
package.json                          ← Root workspace (Turborepo, npm workspaces)
turbo.json                            ← Pipeline: build, dev, typecheck, lint, test
tsconfig.base.json                    ← Shared TypeScript base config
.prettierrc.json                      ← Prettier formatting rules
.env.example                          ← All required environment variables documented

docker-compose.yml                    ← 5 services: web, worker, postgres, redis, minio
docker/Dockerfile.web                 ← Dev-mode Next.js container
docker/Dockerfile.worker              ← Dev-mode worker container (tsx)

packages/shared/package.json         ← @ilovepdf/shared
packages/shared/tsconfig.json
packages/shared/src/index.ts         ← Re-exports JobStatus, JobType, MergeJobPayload
packages/shared/src/types/job.ts     ← Enums and payload interface

apps/web/package.json                ← @ilovepdf/web (Next.js 14.2.5)
apps/web/tsconfig.json               ← Next.js tsconfig (moduleResolution: bundler)
apps/web/next.config.mjs             ← output: standalone
apps/web/tailwind.config.ts          ← Tailwind content paths
apps/web/postcss.config.js
apps/web/vitest.config.ts            ← jsdom environment, @ilovepdf/shared alias
apps/web/.eslintrc.json              ← next/core-web-vitals + no-console
apps/web/app/layout.tsx              ← Root layout
apps/web/app/page.tsx                ← Placeholder home page
apps/web/app/globals.css             ← Tailwind directives + system font

apps/worker/package.json             ← @ilovepdf/worker
apps/worker/tsconfig.json            ← NodeNext module resolution
apps/worker/vitest.config.ts         ← node environment
apps/worker/.eslintrc.json           ← @typescript-eslint recommended + no-console
apps/worker/src/index.ts             ← Worker placeholder (SIGTERM/SIGINT handlers)
```

### Verification Results

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ 3/3 packages pass |
| `npm run lint` | ✅ 2/2 packages with lint scripts pass |
| `npm run test` | ✅ 3/3 packages pass (no test files, exit 0 via --passWithNoTests) |
| `docker compose up` | ⚠️ Not verified — Docker not installed in this environment |
| `curl localhost:3000` | ⚠️ Not verified — depends on Docker |

**Action required from user:** Run `docker compose up` locally to verify all five services start healthy.

---

## Issues Encountered and Resolved

### 1. Turborepo 2.10.1 requires `packageManager` field

Turborepo 2.10.1 (the installed version) requires either `packageManager` or `devEngines.packageManager` in the root `package.json`. Added `"packageManager": "npm@11.16.0"`.

### 2. `next.config.ts` not supported in Next.js 14

TypeScript config files (`next.config.ts`) are a Next.js 15 feature. Next.js 14.2.5 only supports `.js` and `.mjs`. Converted to `next.config.mjs` with JSDoc type annotation.

### 3. Vite/Vitest type conflict with `@vitejs/plugin-react`

`@vitejs/plugin-react` and Vitest 1.6.x bundle different copies of Vite, causing TypeScript type conflicts in `vitest.config.ts`. Per YAGNI: there are no React component tests in Session 003. Removed the React plugin from `vitest.config.ts` and dropped `@vitejs/plugin-react` from `apps/web` devDependencies. Will be re-added in Session 008 when frontend unit tests are written.

### 4. `@typescript-eslint` rules not found in Next.js ESLint config

`next/core-web-vitals` bundles its own typescript-eslint. Adding custom `@typescript-eslint/*` rules in `.eslintrc.json` without installing the plugin separately causes "rule not found" errors. Resolution: removed the custom typescript-eslint rules from `apps/web/.eslintrc.json` — the TypeScript compiler already enforces `noUnusedLocals`, `noUnusedParameters`, and `noImplicitAny` via `tsconfig.json`'s strict settings.

### 5. Vitest exits with code 1 when no test files found

`vitest run` exits 1 when there are no test files. Added `--passWithNoTests` flag to the test scripts in both `apps/web` and `apps/worker`. This is the standard Vitest flag for this scenario.

---

## Security Note

`next@14.2.5` has a known security vulnerability (disclosed 2025-12-11). An upgrade to a patched version is deferred to a future session to avoid introducing breaking changes mid-feature. This does not affect local development security posture.

---

## Architectural Notes

### `packages/shared` as TypeScript source (not compiled)

`packages/shared` exports TypeScript source files directly (`"main": "./src/index.ts"`). Consuming apps import the source via TypeScript path resolution, not a compiled `dist/`. This avoids a build step dependency in development. If a compiled output is ever needed (e.g. for a separate CLI tool), a `build` script with `tsc` is already present.

### Dev Dockerfiles vs Production Dockerfiles

The current `Dockerfile.web` and `Dockerfile.worker` run in development mode (no compilation step, `next dev` and `tsx`). They are functional for integration testing but are not production-optimized. Production Dockerfiles using Turborepo's `prune` command (multi-stage, minimal images) will be added when deployment is planned.

### `@vitejs/plugin-react` deferred to Session 008

The React plugin is needed for Vitest to properly render and test React components. Since we have no component tests until Session 008 (Frontend: Upload UI), adding it now would be premature. It will be added alongside the first component tests.

---

## Open Items

1. **Docker verification:** User should run `docker compose up` to confirm all 5 services start and `curl localhost:3000` returns 200. If any service fails, investigate with `docker compose logs <service>`.

2. **Next.js security update:** `next@14.2.5` has a known CVE. Should be upgraded before production deployment.

3. **MinIO bucket creation:** The docker-compose starts MinIO, but the bucket (`ilovepdf`) must be created on first start. This will be handled in Session 005 (File Upload API) when the S3 client is set up. The MinIO console is available at `localhost:9001` for manual bucket creation.

---

## Next Steps

**Session 004: Database Schema & Health Endpoint**

- Add Prisma to `apps/web`
- Create `prisma/schema.prisma` with the `Job` model (schema defined in `wiki/active-feature.md`)
- Run first migration: `prisma migrate dev --name init`
- Implement `GET /api/health` route handler — checks database connectivity
- Unit test: health handler returns degraded status when DB is unreachable

---

*Session note written by: Claude Code (claude-sonnet-4-6)*
*Next session: Session 004 — Database Schema & Health Endpoint*
