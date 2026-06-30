# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) conventions.
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added (PDF Merge — in progress)

**Session 002 — Planning & ADRs (2026-06-30)**
- `wiki/active-feature.md` — complete PDF Merge spec (file constraints, job lifecycle, 3 API contracts, worker spec, frontend state machine, 36 ACs)
- `docs/adr/001-pdf-processing-library.md` — Decision: pdf-lib (rejected Ghostscript, PyPDF2, MuPDF)
- `docs/adr/002-monorepo-structure.md` — Decision: Turborepo (rejected separate repos, Nx)
- 9-session implementation breakdown (Sessions 002–010)

**Session 003 — Monorepo Scaffolding (2026-06-30)**
- Turborepo monorepo with `apps/web`, `apps/worker`, `packages/shared`
- Next.js 14 (App Router, TypeScript, Tailwind CSS) in `apps/web`
- `apps/worker` TypeScript service stub with SIGTERM/SIGINT handling
- `packages/shared` with `JobStatus`, `JobType`, and `MergeJobPayload` types
- `docker-compose.yml` — 5 services: web, worker, postgres, redis, minio (all with health checks)
- Dev Dockerfiles for web and worker
- Vitest configured for both apps

**Session 004 — Database Schema & Health Endpoint (2026-06-30)**
- `prisma/schema.prisma` — Job model with all fields from spec
- `apps/web/lib/db.ts` — Prisma singleton + `checkDatabaseConnection()` helper
- `GET /api/health` — returns 200 ok or 503 degraded based on DB reachability
- `prisma/migrations/20260630141036_init` — initial migration applied to PostgreSQL
- `.env` for local dev (gitignored) with all service connection strings
- 2 unit tests covering both health states

---

## [0.0.1] — 2026-06-30

### Added
- Project repository initialized and pushed to GitHub (public)
- `CLAUDE.md` — Claude Code operating manual
- `PROJECT.md` — Product and engineering handbook
- `TASKS.md` — Feature tracker with 15-item backlog
- `CHANGELOG.md` — Release history
- `wiki/` — 10-document long-term knowledge base (architecture, coding standards, workflow, testing strategy, roadmap, decisions, lessons learned)
- `docs/adr/` — Architectural Decision Records directory with template
- `docs/session-notes/` — Engineering journal with Session 001 note
- `.gitignore` — Standard Node.js/Next.js ignores
- Technology stack selected and fully justified
- Development process and Git workflow defined
- PDF Merge identified and approved as Feature 1

---

*This file is updated at the completion of every feature.*
