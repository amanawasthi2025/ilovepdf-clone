# ADR-002: Monorepo Structure

**Status:** Accepted
**Date:** 2026-06-30
**Author:** Claude Code Session 002

---

## Context

The platform consists of two deployment units that must be developed and deployed independently:

1. **`apps/web`** — Next.js application (frontend + API route handlers)
2. **`apps/worker`** — Node.js BullMQ worker (document processing)

These two units share a non-trivial surface area of TypeScript types:
- `JobStatus` enum (PENDING, PROCESSING, COMPLETED, FAILED)
- `JobType` enum (MERGE, and future values)
- Job payload shapes (what the API enqueues, what the worker dequeues)
- Error code constants

Without a sharing strategy, these types must either be duplicated (leading to drift) or published as a separate npm package (adding a release workflow).

---

## Problem

How should the repository be structured to share TypeScript types between the web application and the worker while keeping them independently deployable?

---

## Options Considered

### Option 1: Turborepo Monorepo with `packages/shared`

**Description:** A single repository containing all deployment units under `apps/`, with shared code in `packages/`. Turborepo orchestrates build, lint, test, and typecheck tasks with a dependency graph and output caching.

**Pros:**
- First-party recommendation for Next.js monorepos (from Vercel, the Next.js maintainer)
- Shared types live in `packages/shared` and are available to all apps via workspace references — no publishing step
- Turborepo caches build outputs: if `packages/shared` hasn't changed, downstream apps skip rebuilding it
- Single `npm install` at the root installs all dependencies
- Single CI pipeline covers all packages; changes in `packages/shared` automatically invalidate caches for all apps that depend on it
- Hot-reloading of shared package changes works in development via TypeScript project references

**Cons:**
- `turbo.json` pipeline configuration adds a small amount of upfront complexity
- Developers must understand the workspace concept (`workspace:*` dependencies)

**Estimated effort:** Low–Medium

---

### Option 2: Separate Repositories

**Description:** `apps/web` and `apps/worker` live in separate Git repositories. Shared types are extracted into a third repository and published to npm (public or private registry).

**Pros:**
- Completely independent CI/CD pipelines per service
- Clear ownership boundaries if teams grow

**Cons:**
- Shared types require a publish step before they can be consumed — even a one-line change to `JobStatus` requires: bump version → publish → update both consumers → PR in each repo
- Version drift: web and worker may run on different versions of shared types, causing silent bugs in the job queue contract
- Three repositories to manage for what is currently a solo project
- No benefit at this scale

**Estimated effort:** High (ongoing coordination overhead)

---

### Option 3: Single Package (No Monorepo Tooling)

**Description:** All code lives in one repository with no workspace or build system. Shared types are placed in a top-level `shared/` directory and imported via relative paths.

**Pros:**
- No Turborepo configuration
- Simplest possible setup

**Cons:**
- No clean boundary between the web app and the worker — both apps import from a `../../shared/` path, which breaks if either app is ever extracted
- No task caching: every `npm run build` in CI rebuilds everything from scratch
- TypeScript project references and path aliasing must be configured manually to get the same DX that Turborepo provides automatically
- Harder to add a fourth package (e.g., a CLI tool) without restructuring

**Estimated effort:** Low initially, grows as project scales

---

### Option 4: Nx Monorepo

**Description:** Nx is a full-featured monorepo build system with generators, affected-command detection, and a plugin ecosystem.

**Pros:**
- More powerful than Turborepo for large teams
- Nx Cloud provides distributed caching

**Cons:**
- Significantly higher initial configuration overhead
- Steeper learning curve; more abstractions between developer and the actual build commands
- Overkill for a project with two apps and one shared package
- Can be migrated to later if needed

**Estimated effort:** Medium–High

---

## Decision

We chose **Option 1: Turborepo Monorepo with `packages/shared`**.

Reasoning:
- The shared types between `apps/web` and `apps/worker` are a hard requirement — the job queue contract must be identical in both. Option 1 satisfies this at the lowest ongoing cost.
- Turborepo is the first-party choice for Next.js monorepos, meaning documentation, examples, and compatibility with Next.js tooling are excellent.
- The configuration overhead is a one-time setup cost (Session 003). After that, developers run `npm run dev` from the root and Turborepo handles orchestration transparently.
- We avoid the publish-cycle overhead of Option 2 and the path-coupling fragility of Option 3.

---

## Consequences

### Positive
- Shared types are always in sync between web and worker — the type system enforces the queue contract
- `npm run typecheck` at the root typechecks all packages in dependency order
- CI is a single pipeline that covers the entire system
- Adding future packages (e.g., a CLI tool, a second worker type) follows the same established pattern

### Negative
- Turborepo must be understood by anyone new to the project
- `turbo.json` must be updated when new scripts are added to packages
- Docker builds for individual services require `--filter` flags or separate Dockerfiles that don't assume the monorepo root

### Neutral / Trade-offs
- `packages/shared` is a TypeScript-only package — it is not compiled separately. Apps import it via TypeScript path resolution at build time. This is simpler but means `packages/shared` changes always require a consumer rebuild (which Turborepo handles automatically).

---

## Alternatives Rejected

- **Separate repositories** — Rejected: shared type synchronization overhead is not justified for a solo project; version drift in the queue contract is a reliability risk.
- **Single package, no tooling** — Rejected: relative path imports across deployment units create coupling and break extraction; no caching in CI.
- **Nx** — Rejected: higher complexity than Turborepo with no meaningful benefit at our current scale.

---

## Implementation Notes

Repository layout (established in Session 003):
```
/
├── apps/
│   ├── web/          # Next.js application
│   └── worker/       # BullMQ Node.js worker
├── packages/
│   └── shared/       # Shared TypeScript types and constants
├── package.json      # Root package with workspaces declaration
└── turbo.json        # Turborepo pipeline configuration
```

`packages/shared` exports:
- `JobStatus` enum
- `JobType` enum
- Job payload types (what enters and exits the queue)
- Error code constants shared between API and worker

Apps depend on `packages/shared` via workspace reference in `package.json`:
```json
"dependencies": {
  "@ilovepdf/shared": "workspace:*"
}
```

---

## References

- Turborepo documentation: https://turbo.build/repo/docs
- Next.js + Turborepo starter: https://github.com/vercel/turborepo/tree/main/examples/with-nextjs
- Related: `wiki/architecture.md` — Repository Structure section

---

*This template follows the format recommended by Michael Nygard (https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)*
