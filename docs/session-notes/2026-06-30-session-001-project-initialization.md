# Session Note: Session 001 — Project Initialization

**Date:** 2026-06-30
**Session Goal:** Establish the engineering foundation — documentation, repository structure, technology stack decisions, and development process. No application code.
**Status:** IN PROGRESS (awaiting human approval)

---

## What Was Done

### Repository Structure Created

The following files and directories were created:

```
CLAUDE.md                                  ← Claude Code operating manual
PROJECT.md                                 ← Product & engineering handbook
TASKS.md                                   ← Feature tracker
CHANGELOG.md                               ← Release history
wiki/
  project.md                               ← Project overview / elevator pitch
  architecture.md                          ← Technology stack and architecture
  coding-standards.md                      ← Coding conventions
  development-workflow.md                  ← Git and PR workflow
  testing-strategy.md                      ← Testing approach and tooling
  active-feature.md                        ← Current feature specification
  completed-features.md                    ← Completed feature log
  roadmap.md                               ← Product roadmap
  lessons-learned.md                       ← Engineering lessons
  decisions.md                             ← Decision log
docs/adr/
  README.md                                ← ADR index
  template.md                              ← ADR template
docs/session-notes/
  2026-06-30-session-001-project-initialization.md  ← This file
```

---

## Key Decisions Made

### Technology Stack

See `wiki/architecture.md` for full justifications. Summary of choices:

| Decision | Choice | Primary Reason |
|---|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript | SSR, co-located API, single deployment |
| Styling | Tailwind CSS + shadcn/ui | Maintainable, accessible, no lock-in |
| Database | PostgreSQL + Prisma | Relational guarantees, type-safe queries |
| Queue | BullMQ + Redis | Production-grade, retry/backoff built in |
| Storage | S3-compatible (MinIO dev / AWS prod) | Portable, industry standard |
| Auth | Auth.js (NextAuth v5) | In-house, no vendor lock-in |
| PDF Processing | pdf-lib (JS) | Pure JS, no system deps for basic ops |
| Unit Tests | Vitest | Fast, Jest-compatible, native ESM |
| E2E Tests | Playwright | Reliable, good DX |
| Build System | Turborepo (monorepo) | Shared types, cached builds |
| CI | GitHub Actions | Integrated with GitHub |
| Local Infra | Docker + Docker Compose | Reproducible, identical to prod |

### Development Process

- One feature at a time, with explicit approval between each
- Full vertical slice per feature (frontend + backend + worker + tests + docs)
- CodeRabbit review on every PR
- Repository as the source of truth (not conversation history)
- Anonymous-first: first features work without user accounts

### First Recommended Application Feature

**PDF Merge** — Allow users to upload multiple PDFs and download a merged result.

**Rationale:**
1. Most-demanded PDF tool globally
2. Exercises the entire stack end-to-end: upload → queue → worker → storage → download
3. No authentication required — delivers value to anonymous users immediately
4. Validates the architecture before we build more features on top of it
5. Concretely provable: upload two PDFs, get one back, open it — it works or it doesn't

---

## Reasoning Behind Process Decisions

### Why "One Feature at a Time"

In past projects (and with AI assistants generally), the tendency to "while I'm at it" leads to half-finished features, tangled codebases, and lost context between sessions. Strict feature gating prevents this.

### Why Anonymous First

Requiring authentication before any tool works is a friction-first design. The product needs to prove its value before asking users to commit to an account. Anonymous tools also validate the core processing pipeline without auth complexity layered on top.

### Why Monorepo

The web app and the worker are separate deployment units but share job type definitions and status enums. Without a monorepo, keeping these in sync requires a published package or copy-paste — both are worse than a shared `packages/` directory.

### Why pdf-lib Over a Python Worker

For the initial features (merge, split, rotate), pdf-lib handles everything in Node.js without system dependencies. This keeps the Docker image small and the worker simple. LibreOffice will be introduced later only when format conversion is needed.

---

## Open Questions

1. **Deployment target:** Where will this be deployed in production? (Railway, Fly.io, AWS, VPS?) This affects infrastructure decisions but doesn't block initial development.

2. **Domain name:** Not needed until a production deployment is planned.

3. **Payment provider:** Stripe is the obvious choice but not needed until monetization (Phase 5).

4. **File retention TTL:** Currently documented as "1 hour default, configurable." The right value depends on user expectations and storage costs. Should be confirmed before the first tool ships.

5. **Anonymous session tracking:** Without user accounts, how do we identify sessions for rate limiting? Options: IP address, anonymous session cookie, or no rate limiting initially. This needs a decision before shipping.

---

## Next Steps

1. Human reviews and approves this session's output.
2. If approved: begin planning the PDF Merge feature.
3. Create `docs/adr/001-pdf-processing-library.md` documenting the pdf-lib choice before starting.
4. Create detailed acceptance criteria for PDF Merge in `wiki/active-feature.md`.
5. Set up the monorepo scaffolding (package.json, tsconfig, docker-compose) as part of the PDF Merge feature.

---

## Process Improvement Suggestions

These are suggestions for the human to consider — not unilateral decisions.

1. **Explicit approval format:** When approving a feature, a short "Approved — proceed with PDF Merge" message avoids ambiguity. Silence could mean approval or absence.

2. **Session length:** Sessions are most productive when focused on one thing. A "documentation session" and a "coding session" produce better results than a mixed session.

3. **PR descriptions:** Consider keeping a PR description template in the repo so CodeRabbit has consistent context.

4. **Test fixtures early:** Add PDF test fixtures (`tests/fixtures/`) before writing tests, so the tests can reference real files from day one.

5. **Environment validation:** Before any code is written, establish the `.env.example` file with all required variables. This prevents missing configuration surprises mid-development.

---

*Session note written by: Claude Code (claude-sonnet-4-6)*
*Next session should begin by reading CLAUDE.md*
