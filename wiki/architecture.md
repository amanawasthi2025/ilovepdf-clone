# Architecture

> This document describes the system architecture, technology stack, and the reasoning behind every major decision.
> Update this document when architecture evolves.

---

## System Overview

The platform is a document-processing SaaS. Users upload files through a web browser, the system processes those files asynchronously in background workers, and users download the results.

The core data flow:

```
User Browser
    │  (1) Upload file
    ▼
Next.js API (Route Handler)
    │  (2) Store raw file in object storage
    │  (3) Create job record in PostgreSQL
    │  (4) Enqueue job in BullMQ
    ▼
BullMQ Worker (Node.js process)
    │  (5) Pull job from Redis queue
    │  (6) Fetch input file(s) from object storage
    │  (7) Process document
    │  (8) Store output file in object storage
    │  (9) Update job status in PostgreSQL
    ▼
Next.js API (Route Handler)
    │  (10) Client polls job status
    ▼
User Browser
    │  (11) Download output file
```

---

## Deployment Architecture

### Local Development

Infrastructure runs natively on the host (see ADR-004 — no Docker):

```
Native services
├── app (Next.js dev server: port 3000, `npm run dev`)
├── worker (BullMQ Node.js worker via tsx, `npm run dev`)
├── postgres (native install: port 5432)
├── redis (native install: port 6379)
└── minio (standalone binary: port 9000, console 9001)
```

### Production (Target)

Not yet built. The deployment target (containerized, PaaS, or otherwise) is TBD and will be decided when production deployment is actually undertaken — this is intentionally left undecided rather than speculated on. What's fixed regardless of that choice:

```
Cloud Provider
├── App Server (Next.js)
├── Worker Pool (horizontally scalable)
├── PostgreSQL (managed, e.g. RDS or Supabase)
├── Redis (managed, e.g. Upstash or ElastiCache)
└── S3 (AWS S3 or compatible)
```

---

## Repository Structure

```
/
├── CLAUDE.md                    # Claude Code operating manual
├── PROJECT.md                   # Product & engineering handbook
├── TASKS.md                     # Feature tracker
├── CHANGELOG.md                 # Release history
│
├── apps/
│   ├── web/                     # Next.js application (frontend + API)
│   │   ├── app/                 # Next.js App Router
│   │   │   ├── (tools)/         # Tool pages (merge, split, compress, ...)
│   │   │   ├── api/             # API Route Handlers
│   │   │   └── layout.tsx       # Root layout
│   │   ├── components/          # React components
│   │   │   ├── ui/              # Primitive UI components (shadcn/ui)
│   │   │   └── features/        # Feature-specific components
│   │   ├── lib/                 # Shared utilities (client + server)
│   │   └── ...
│   │
│   └── worker/                  # BullMQ document processing worker
│       ├── src/
│       │   ├── jobs/            # One file per job type
│       │   ├── processors/      # Document processing logic
│       │   └── index.ts         # Worker entry point
│       └── ...
│
├── packages/
│   └── shared/                  # Shared TypeScript types and utilities
│       ├── src/
│       │   ├── types/           # Shared type definitions
│       │   └── constants/       # Shared constants
│       └── ...
│
├── prisma/
│   ├── schema.prisma            # Database schema
│   └── migrations/              # Migration history
│
├── wiki/                        # Long-term knowledge base
└── docs/
    ├── adr/                     # Architectural Decision Records
    └── session-notes/           # Engineering journal
```

---

## Technology Stack

### Frontend

**Next.js 14 (App Router) + TypeScript**

- React-based, well-established, excellent ecosystem
- App Router gives us server components (reduce client bundle), server actions, and co-located API routes
- TypeScript eliminates entire categories of runtime bugs
- Single deployment unit: frontend + API in one process
- **Alternative considered:** Separate React SPA (Vite) + Express API. Rejected because it doubles the deployment surface and adds cross-origin complexity without meaningful benefit at this scale.

**Tailwind CSS**

- Utility-first; no context switching between files
- JIT compilation keeps bundle small
- Highly maintainable — styles are co-located with markup
- **Alternative considered:** CSS Modules. Rejected because it requires more boilerplate for the same result. Styled Components rejected for performance reasons (runtime CSS generation).

**shadcn/ui**

- Accessible, composable components built on Radix UI primitives
- Components are copied into the project (not a dependency) — we own them
- No lock-in; easy to customize
- **Alternative considered:** MUI, Mantine. Rejected because they impose opinionated styling that conflicts with Tailwind, and they are harder to customize.

**TanStack Query (React Query)**

- Server state management: caching, background refetching, polling
- Essential for polling job status
- Eliminates manual loading/error/data state management
- **Alternative considered:** SWR. Rejected — TanStack Query is more full-featured and has better DevTools.

### API Layer

**Next.js Route Handlers**

- Co-located with the frontend in the same codebase
- No CORS configuration required for same-origin requests
- Shared TypeScript types between frontend and API without extra setup
- **Alternative considered:** Separate Fastify or Express API. Considered for clean separation but rejected as unnecessary complexity at this scale. Can be extracted later if needed.

### Database

**PostgreSQL + Prisma ORM**

- PostgreSQL is the most reliable open-source RDBMS; well-supported by every managed service
- Prisma provides type-safe queries, auto-generated types, and migration management
- ACID guarantees are important for job state management
- **Alternative considered:** MongoDB. Rejected — document processing jobs have predictable schemas; relational integrity is beneficial, not harmful.
- **Alternative considered:** SQLite. Rejected — single-writer limitation is unacceptable for a web service.

### Queue & Background Processing

**BullMQ + Redis**

- BullMQ is the most mature Node.js job queue; built on Redis
- Features: retry with exponential backoff, delayed jobs, priority queues, job events
- Redis is a first-class dependency many architectures already include
- Workers are stateless Node.js processes — horizontally scalable
- **Alternative considered:** Database polling (pg-boss). Considered as simpler but rejected because Redis-based queuing has better throughput, visibility, and tooling for this use case.
- **Alternative considered:** AWS SQS. Rejected as a first-class dependency — adds cloud vendor lock-in. Can be swapped in later.

### Object Storage

**S3-compatible (MinIO for dev / AWS S3 for prod)**

- Industry standard interface; portable across providers
- MinIO makes local development identical to production
- `@aws-sdk/client-s3` is the access library — works with any S3-compatible endpoint
- Files are temporary: uploaded inputs and processed outputs are deleted after a configurable TTL
- **Alternative considered:** Local filesystem storage. Rejected because it doesn't scale horizontally (worker on a different machine can't access files on the API server's disk).

### Authentication

**Auth.js (NextAuth v5)**

- Deep Next.js integration; handles session cookies, CSRF, OAuth provider configuration
- Supports email/password and OAuth (Google, GitHub) out of the box
- Well-maintained, widely used
- **Note:** Authentication is not built in the first feature. This entry documents the planned choice.
- **Alternative considered:** Clerk. Considered for faster setup but rejected because it is a paid third-party service with more vendor lock-in. Auth.js keeps auth in-house.

### Document Processing Libraries

**pdf-lib (JavaScript)**

- Pure JavaScript; runs in Node.js without system dependencies
- Handles: merge, split, rotate, watermark, metadata
- **Limitation:** Does not support format conversion
- **Used for:** All purely PDF-to-PDF operations

**LibreOffice Headless (future)**

- Required for format conversions: Word ↔ PDF, Excel → PDF
- Runs as a system service inside the worker container
- **Used for:** Feature 9+ (Word to PDF, PDF to Word)
- Not installed until needed

**Sharp (future)**

- High-performance image processing (Node.js + libvips)
- Used for: image resizing, format conversion for "PDF to Image" feature
- Not installed until needed

### Testing

**Vitest**

- Jest-compatible; significantly faster due to native ESM support
- Co-located tests (`.test.ts` files next to source)
- Used for: unit tests, integration tests (with test database)

**Playwright**

- Browser automation for E2E tests
- Tests real user flows against the running application
- Used for: acceptance testing of every user-facing feature

### Infrastructure / Tooling

**Native local services (PostgreSQL, Redis, MinIO)**

- No containerization for local development — see ADR-004
- PostgreSQL and Redis installed natively via the OS package manager; MinIO runs as a standalone binary
- Application code is unaffected: both still speak the same protocols (Postgres wire protocol, Redis protocol, S3-compatible HTTP API) as their managed-service production counterparts

**No CI/CD**

- No GitHub Actions, no automated review tool — see ADR-005
- Lint → typecheck → test → E2E are run manually before opening and before merging every PR (`wiki/development-workflow.md`)
- Deployment mechanism (and any CD) remains TBD, same as the still-undecided production target above

**Turborepo** (monorepo build system)

- Caches build outputs; speeds up local task runs
- Orchestrates tasks across `apps/` and `packages/`

---

## Security Architecture

- **File uploads:** Size limits enforced at the API layer. Content-Type validation. Files scanned for MIME type against expected value.
- **File storage:** Non-guessable UUIDs as storage keys. No public URLs — all downloads via pre-signed URLs with short TTL.
- **File retention:** Input and output files are automatically deleted after TTL (default: 1 hour). Configurable.
- **Input validation:** All API inputs validated with Zod schemas at the route handler boundary.
- **SQL injection:** Prevented by Prisma parameterized queries — raw SQL is never constructed from user input.
- **XSS:** Next.js escapes React output by default. `dangerouslySetInnerHTML` is not used.
- **CSRF:** Auth.js handles CSRF protection for auth endpoints.
- **Authentication:** Sessions are HTTP-only cookies — not accessible to JavaScript.

---

## Observability

- **Logging:** Structured JSON logs using `pino`. Every log line includes: `timestamp`, `level`, `service`, `correlationId`, `message`, context fields.
- **Correlation IDs:** Every request generates a UUID correlation ID, passed through to workers via job metadata.
- **Health checks:** `GET /api/health` on the web app; equivalent on workers.
- **Error handling:** Errors are caught at the API boundary, logged with context, and returned as structured JSON responses. Unhandled promise rejections crash the process (intentional — let the process manager restart).

---

## Constraints and Non-Goals

- We do not run document processing in the browser (WebAssembly PDF libraries exist but are complex and have format limitations).
- We do not store files permanently — this is a stateless processing service, not a document management system.
- We do not provide real-time collaboration.
- We do not support legacy browsers (IE, old Edge).

---

*Last updated: 2026-07-01 — Session 017 (CI/CD and CodeRabbit removed, native local dev only)*
