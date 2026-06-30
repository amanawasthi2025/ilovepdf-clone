# PROJECT.md — Product & Engineering Handbook

> This document is the primary reference for both humans and AI collaborators working on this project.
> It describes what we are building, why, and how we work together.

---

## Product Vision

We are building a document-processing SaaS platform that gives users fast, reliable, browser-based tools to work with PDF and office documents — without installing software, without friction, and without compromising their privacy.

The product is inspired by the category of tools that make document operations (merge, split, compress, convert, sign) accessible to anyone. Our implementation is entirely original: original code, original architecture, original UI, original design.

The long-term vision is a platform where:
- Users can complete any common document task in under 60 seconds
- File processing is fast, accurate, and produces high-quality output
- The product is trustworthy: users understand what happens to their files
- The business model is sustainable: a generous free tier supported by a paid subscription

---

## Project Goals

### Short-Term (MVP)
- Deliver a small set of high-quality document tools
- Establish a production-grade engineering foundation
- Prove the architecture can scale to additional tools
- Ship with professional UI/UX that instills user confidence

### Medium-Term
- Cover the 10 most-used PDF operations
- Implement user accounts and job history
- Introduce a subscription/payment model
- Achieve measurable performance and reliability targets

### Long-Term
- Expand to office document formats (Word, Excel, PowerPoint)
- Offer an API for developer integrations
- Support team/organization accounts
- Build processing infrastructure that handles high concurrency

---

## Scope

### In Scope
- Browser-based document processing tools (no native app)
- PDF as the primary document format initially
- Asynchronous background processing for large files
- File upload, processing, temporary storage, and download
- User authentication and account management (after initial tools are proven)
- Usage-based rate limiting and a subscription model (future)

### Out of Scope (for now)
- Mobile native applications
- Real-time collaboration
- Document editing (as opposed to processing)
- Optical character recognition (OCR) — future feature
- E-signature with legal enforceability — future feature
- Enterprise SSO — future feature

---

## Engineering Philosophy

This project is guided by the following principles, applied in every decision:

**SOLID** — Each module has one responsibility. Dependencies point inward. High-level policy does not depend on low-level details.

**DRY** — Logic is defined once. Duplication is a signal, not a pattern.

**KISS** — The simplest solution that meets the requirement is preferred. Complexity must justify itself.

**YAGNI** — We build what is needed now. Speculative infrastructure is waste.

**Clean Architecture** — Business logic is framework-independent. The domain does not know about HTTP, databases, or queues.

**Twelve-Factor App** — Configuration via environment variables. Stateless processes. Explicit dependency declaration. Logs as streams.

**Secure by Default** — Input validation at every boundary. Principle of least privilege. No secrets in code.

**Observability First** — Structured logs, health endpoints, and metrics from day one.

---

## Architecture Overview

See `wiki/architecture.md` for the detailed architecture document.

**Summary:**

The system follows a layered, vertically-sliced architecture:

```
Browser (Next.js)
     │
     ▼
API Layer (Next.js API Routes / Route Handlers)
     │
     ▼
Application Services (business logic, orchestration)
     │
     ├─► Document Processing Workers (BullMQ + Redis)
     │
     ├─► PostgreSQL (job state, user data)
     │
     └─► Object Storage (S3-compatible: uploads, outputs)
```

Workers perform the actual document transformations. The API layer coordinates and tracks state. The frontend polls or subscribes to job status.

---

## Technology Stack

See `wiki/architecture.md` for full justification. Summary:

| Layer | Technology | Justification |
|---|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript | SSR, great DX, single deployment unit |
| Styling | Tailwind CSS + shadcn/ui | Maintainable, accessible, production-ready |
| API | Next.js Route Handlers | Co-located with frontend, reduces ops overhead |
| ORM | Prisma | Type-safe DB access, great migrations |
| Database | PostgreSQL | Reliable, well-understood, excellent Prisma support |
| Queue | BullMQ + Redis | Production-grade job queue, retry/backoff built in |
| Storage | S3-compatible (MinIO local / AWS S3 prod) | Industry standard, cost-effective |
| Auth | Auth.js (NextAuth v5) | Flexible, well-maintained, integrates with Next.js |
| Document Processing | pdf-lib (JS) + LibreOffice headless | JS for simple ops, LibreOffice for format conversion |
| Testing | Vitest + Playwright | Fast unit tests, reliable E2E |
| Linting | ESLint + Prettier | Consistent code style |
| CI | GitHub Actions | Integrated, widely supported |
| Containerization | Docker + Docker Compose | Reproducible local dev, easy deployment |

---

## Quality Standards

### Code Quality
- TypeScript strict mode — no errors, no `any` without justification
- Zero lint warnings in production commits
- All tests pass before merge
- Code reviewed (by CodeRabbit) before merge to `develop`

### Test Coverage
- Unit tests for all business logic
- Integration tests for all API endpoints
- E2E tests for all user-facing flows
- Coverage is a floor, not a target — test meaningful behavior

### Performance
- API response time P95 < 500ms for metadata operations
- File upload initiation < 200ms
- Processing time is workload-dependent — must be communicated to the user
- No memory leaks in workers (workers should be stateless)

### Security
- OWASP Top 10 mitigated by design
- File content validated, not just extension
- Files stored with non-guessable identifiers
- Automatic deletion of processed files after a configurable TTL

### Observability
- Structured JSON logs with correlation IDs
- Health check endpoint on all services
- Errors logged with context (never silently swallowed)

---

## Definition of Done

A feature is **Done** only when:

1. All acceptance criteria are met and manually verified
2. Unit + integration + E2E tests written and passing
3. No TypeScript errors, no lint errors
4. Documentation updated (`TASKS.md`, `CHANGELOG.md`, `wiki/`)
5. Session note written
6. Any ADRs created for architectural decisions made
7. Git commit on a feature branch
8. CodeRabbit review completed and findings addressed

---

## Development Workflow

1. Read `CLAUDE.md` and required docs
2. Confirm the current feature from `TASKS.md`
3. Read `wiki/active-feature.md` for the detailed spec
4. Summarize understanding and implementation plan
5. Get approval before writing code
6. Implement the feature as a vertical slice
7. Write tests
8. Update all documentation
9. Open PR → CodeRabbit review → address findings
10. Merge → update `TASKS.md` and `CHANGELOG.md`
11. Stop and wait for next feature assignment

---

## Contribution Guidelines

This is currently a solo project assisted by Claude Code. The following guidelines keep the repository in a clean, releasable state at all times.

- Never commit directly to `main`
- Never commit broken or untested code
- Never commit secrets, keys, or credentials
- Write commit messages that explain *why*, not *what*
- Keep PRs small — one feature, one PR
- All PRs require CodeRabbit review
- Update documentation as part of the same PR, not as a follow-up

---

## AI Collaboration Guidelines

This project is primarily developed with Claude Code as the engineering assistant.

**For Claude Code:**
- Read `CLAUDE.md` before every session
- Follow the one-feature-at-a-time rule without exception
- Never implement features that aren't in the current `TASKS.md`
- Ask before assuming on any ambiguous requirement
- Explain trade-offs before making recommendations
- Stop after each milestone and wait for approval
- Update all required documentation as part of feature completion
- The repository is the source of truth — not the conversation history

**For human collaborators:**
- Trust the process — the slow, disciplined approach produces better software
- Approve milestones explicitly — don't assume Claude will continue
- Challenge trade-off analyses — push back if something doesn't feel right
- Keep `TASKS.md` up to date — it drives all AI sessions

---

*Last updated: 2026-06-30 — Session 001 (Project Initialization)*
