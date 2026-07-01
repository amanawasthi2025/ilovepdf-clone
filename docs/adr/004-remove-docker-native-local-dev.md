# ADR-004: Remove Docker, Run Local Dev Services Natively

**Status:** Accepted
**Date:** 2026-07-01
**Author:** Claude Code Session 016

---

## Context

Local development infrastructure (PostgreSQL, Redis, MinIO) has run via `docker-compose.yml` since Session 001. `apps/web` and `apps/worker` themselves were already run natively on the host (`npm run dev`), with `.env` pointing at `localhost`-mapped container ports — the optional `web`/`worker` services in `docker-compose.yml` and their dev Dockerfiles (`docker/Dockerfile.web`, `docker/Dockerfile.worker`) were not part of the actual day-to-day workflow.

This is a solo-developer project. Docker Compose adds a layer of indirection (image builds, container lifecycle, volume management, the `.dockerignore`/Prisma-musl class of bugs recorded in `wiki/lessons-learned.md`) that buys reproducibility across a team of developers this project doesn't have. CI (`.github/workflows/ci.yml`) never depended on Docker — it runs `typecheck`/`lint`/`test` directly on the runner, and all unit/integration tests mock the database and S3 clients rather than hitting live infrastructure.

---

## Problem

How should local development infrastructure (PostgreSQL, Redis, object storage) run once Docker is removed, while preserving the existing S3-compatible storage abstraction and the `.env`-driven, twelve-factor configuration this project already follows?

---

## Options Considered

### Option 1: Native installs (PostgreSQL, Redis via apt; MinIO via standalone binary)

**Description:** Install PostgreSQL and Redis as native services on the host. Run MinIO's official standalone server binary as a local process. `apps/web`/`apps/worker`'s S3 client code (`lib/storage.ts`, `lib/env.ts`) is untouched — it already talks to an S3-compatible endpoint over HTTP via env vars, and MinIO is still that endpoint, just not containerized.

**Pros:**
- Zero application code changes — `MINIO_*` env vars and the `@aws-sdk/client-s3` usage stay identical
- Dev/prod parity is preserved: storage is still S3-compatible (MinIO locally, AWS S3 in prod, per `wiki/architecture.md`)
- No image builds, no container lifecycle to manage — matches the "less complexity for solo dev" goal directly
- `.env`/`.env.example` already use `localhost` for every service — no config changes needed beyond removing Docker-specific overrides that lived only in `docker-compose.yml`

**Cons:**
- Local machine state (installed packages, a running MinIO process) is no longer captured as code — a new machine needs manual setup instead of `docker compose up`
- No automatic health-check/restart semantics that Compose provided

**Estimated effort:** Low

---

### Option 2: Local filesystem storage adapter (drop MinIO/S3 entirely for dev)

**Description:** Replace the S3 client in `lib/storage.ts` with a filesystem-based adapter for local development; keep real S3 in production.

**Pros:**
- No object storage service to install or run at all

**Cons:**
- Requires code changes and a second storage implementation to maintain and keep behaviorally equivalent (presigned URLs, content-type handling)
- Breaks the dev/prod parity `wiki/architecture.md` explicitly chose S3-compatible storage for — the same document rejected plain filesystem storage on scaling grounds; introducing it for dev reintroduces exactly the divergence that decision avoided
- Adds an abstraction (a second storage backend, selected by environment) that isn't needed by the current feature set — YAGNI

**Estimated effort:** Medium

---

### Option 3: Point local dev directly at a real AWS S3 bucket

**Description:** Use an actual AWS S3 bucket for local development instead of any local object storage.

**Pros:**
- Truest possible dev/prod parity — literally the same service

**Cons:**
- Requires an AWS account, IAM credentials, and a dedicated dev bucket — real external dependency and (small) ongoing cost for a solo local-dev workflow whose stated goal is *less* infrastructure
- Local dev requires network access and shared-account bookkeeping (separating dev objects from prod)

**Estimated effort:** Low, but contradicts the goal of reducing external dependencies

---

## Decision

We chose **Option 1: native installs (PostgreSQL, Redis, MinIO standalone binary)**.

Reasoning:
- It's the only option that removes Docker without touching application code or the storage abstraction
- It keeps the local/production architecture story intact: S3-compatible storage in both environments, just not containerized locally
- It directly serves the stated goal — less moving infrastructure for a solo workflow — without introducing a new abstraction (Option 2) or a new external dependency (Option 3)

---

## Consequences

### Positive
- `docker-compose.yml`, `docker/`, `.dockerignore` removed entirely — one less layer between "clone the repo" and "run the app"
- No application or test code changes required
- Local dev now starts faster (no image build/pull) once services are installed once

### Negative
- Local machine setup is now manual (documented in `wiki/development-workflow.md`) rather than a single `docker compose up` command
- A developer working across multiple machines must repeat native installation on each one

### Neutral / Trade-offs
- The previously-documented "Production (Target)" deployment architecture assumed containerized deployment (`wiki/architecture.md`). No production deployment exists yet, so that section is marked TBD rather than replaced with a new speculative target — deciding production deployment strategy is out of scope for this change.

---

## Alternatives Rejected

- **Local filesystem storage adapter** — Rejected: requires new code, breaks the dev/prod S3 parity `wiki/architecture.md` already chose deliberately, and adds an abstraction not needed by any current feature.
- **Real AWS S3 bucket for dev** — Rejected: trades local infrastructure for an external cloud dependency and cost, working against the goal of reducing complexity for solo local development.

---

## Implementation Notes

- MinIO standalone binary installed to `~/.local/bin/minio`; data directory at `~/minio-data`; run with `MINIO_ROOT_USER=minioadmin MINIO_ROOT_PASSWORD=minioadmin minio server ~/minio-data --console-address ":9001"` to match the credentials already in `.env.example`.
- PostgreSQL and Redis installed via `apt` (`postgresql`, `redis-server`); role/database created to match the existing `DATABASE_URL` in `.env.example` (`postgres`/`postgres`/`ilovepdf`).
- No changes to `apps/web/lib/env.ts`, `apps/web/lib/storage.ts`, `apps/worker/src/lib/env.ts`, or `apps/worker/src/lib/storage.ts` — same env var names, same S3 client configuration.

---

## References

- Related: ADR-002 (Monorepo Structure)
- Superseded local-dev-infra description in `wiki/architecture.md` (Deployment Architecture, Local Development)
- `wiki/lessons-learned.md` — the `.dockerignore`/Prisma-musl entry documents the class of problem this removes for local dev
- MinIO standalone server docs: https://min.io/docs/minio/linux/index.html

---

*This template follows the format recommended by Michael Nygard (https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)*
