# ADR-007: User Authentication — Auth.js Credentials Provider + Database Sessions

**Status:** Accepted
**Date:** 2026-07-01
**Author:** Claude Code Session 023

---

## Context

`wiki/architecture.md` already named Auth.js (NextAuth v5) as the planned authentication library, back when the tech stack was first documented — that entry was written before any auth code existed and is now being acted on. `PROJECT.md`'s Medium-Term goals list "user accounts and job history" as the natural next step once the initial anonymous tool set (Merge, Split, Compress) is proven, which it now is (v0.1.0–v0.3.0, all merged to `develop`).

This feature is scoped narrowly, per explicit user decisions made ahead of this ADR:
- Merge/Split/Compress remain fully anonymous — this feature adds signup/login/logout only, no gating of existing tool routes
- Email/password only for the MVP — no OAuth providers
- Database sessions, not JWT
- No email verification, no password reset flow (both deferred — noted as known limitations, not gaps)
- No new user-facing surface beyond the auth forms themselves and a session-aware nav (no account/profile page yet — that belongs to the future Job History feature)

---

## Problem

Which library/pattern should implement email+password signup, login, logout, and session persistence, given the constraints above and the existing Next.js 14 (App Router) + Prisma + PostgreSQL stack?

---

## Options Considered

### Option 1: Auth.js v5 (`next-auth`) + `@auth/prisma-adapter`, Credentials provider, database sessions

**Description:** Use Auth.js's `Credentials` provider for email/password, backed by a custom `authorize()` callback that looks up the `User` row and verifies the password hash. `@auth/prisma-adapter` persists `Session` rows in PostgreSQL (via Prisma) rather than issuing JWTs. Auth.js's standard `User`/`Account`/`Session`/`VerificationToken` tables are added to `prisma/schema.prisma` (the adapter requires this exact shape).

**Pros:**
- Matches the tech stack decision already recorded in `wiki/architecture.md` — no reversal to explain later
- Deep Next.js App Router integration: middleware-friendly session helpers, HTTP-only cookie handling, CSRF protection built in
- Database sessions align with the project's existing pattern of Postgres as the single source of truth for all state (jobs, and now sessions) — a session can be revoked server-side by deleting its row, no JWT-secret rotation/blacklist complexity
- The adapter's schema is additive to `prisma/schema.prisma`; `Job` is untouched, so Merge/Split/Compress need zero code changes
- Well-maintained, no vendor lock-in, auth stays in-house (no third-party service dependency or cost)

**Cons:**
- Auth.js's official schema requires several tables (`Account`, `VerificationToken`) that are unused with a Credentials-only, no-OAuth, no-verification setup for now — minor unused-columns overhead, acceptable since they cost nothing at rest and keep the door open for OAuth/verification later without a migration rewrite
- Credentials provider is explicitly documented by Auth.js as less turnkey than OAuth providers — the `authorize()` callback, hashing, and validation are the app's own responsibility, not the library's

**Estimated effort:** Medium

---

### Option 2: Auth.js v5 with JWT sessions

**Description:** Same as Option 1, but sessions are signed JWTs in a cookie rather than database rows.

**Pros:**
- No `Session` table, no DB read on every request to validate a session
- Marginally simpler adapter setup

**Cons:**
- Revoking a session (e.g., a future "log out all devices" feature) requires a token-blacklist workaround, since a JWT is valid until it expires by design
- Breaks from the project's established pattern of Postgres as the durable source of truth for all mutable state
- No measurable performance need for statelessness here — this is a single-process Next.js app talking to one Postgres instance, not a fleet of independently-scaling stateless services

**Estimated effort:** Low

---

### Option 3: Clerk (or similar hosted auth-as-a-service)

**Description:** Delegate signup/login/session management entirely to a third-party hosted service.

**Pros:**
- Fastest to integrate; offloads password hashing, session security, and future MFA/OAuth entirely
- Managed service handles security patching

**Cons:**
- `wiki/architecture.md` already rejected this exact option when Auth.js was chosen: paid third-party service, more vendor lock-in, auth data lives outside our own database
- Contradicts the project's "auth stays in-house" preference and the general engineering philosophy of avoiding unnecessary third-party dependencies for core product functionality

**Estimated effort:** Low

---

## Decision

We chose **Option 1: Auth.js v5 + `@auth/prisma-adapter`, Credentials provider, database sessions**.

- It is the decision `wiki/architecture.md` already recorded; no new library evaluation needed, only the passwordhashing and adapter integration work
- Database sessions fit the project's existing single-source-of-truth pattern better than JWTs, with no downside significant enough to justify deviating
- Keeps the door open for OAuth and email verification later (both already supported by Auth.js) without a schema rewrite, while building none of that unused surface now (YAGNI)

Passwords are hashed with **`bcryptjs`** (pure JavaScript, no native compilation step) rather than a native-binding hasher like `argon2`. `apps/worker` already has one native dependency (`sharp`, per ADR-006) for a good reason — real image recompression has no pure-JS equivalent with acceptable performance. Password hashing has no such constraint: `bcryptjs` is well-audited, widely used, and avoids adding a second native-binding surface to the stack for a marginal security difference at this scale.

---

## Consequences

### Positive
- Session revocation is a simple DB delete; consistent with how `Job` state is already managed
- No new runtime infrastructure — sessions live in the same PostgreSQL instance as everything else, no new service to run locally or in production
- Existing anonymous tool routes (`/merge`, `/split`, `/compress` and their APIs) require zero changes

### Negative
- Every authenticated request now does a DB read to validate the session (acceptable at this project's scale; would need revisiting only if traffic grows enough to matter)
- `bcryptjs` is slower than native `bcrypt`/`argon2` implementations — acceptable for interactive login (not a hot path called at high frequency)

### Neutral / Trade-offs
- The Auth.js schema's `Account`/`VerificationToken` tables are provisioned now but unused until OAuth/email-verification are added — small, inert schema surface in exchange for not needing a migration to add them later

---

## Alternatives Rejected

- **Option 2 (JWT sessions)** — Rejected because it breaks from the project's Postgres-as-source-of-truth pattern for no offsetting benefit at this scale, and complicates future session revocation.
- **Option 3 (Clerk)** — Rejected because `wiki/architecture.md` already rejected it when Auth.js was originally chosen; the reasoning (vendor lock-in, cost, auth data leaving our own database) still holds.

---

## Implementation Notes

- Add `User`, `Account`, `Session`, `VerificationToken` models to `prisma/schema.prisma` per `@auth/prisma-adapter`'s required shape; `User.passwordHash` is a project-specific addition (not part of Auth.js's own schema, since Auth.js does not itself implement credential storage)
- Signup is a plain API route (`POST /api/auth/signup`) that creates the `User` row directly — Auth.js does not provide a signup flow, only session/login machinery
- Login flows through Auth.js's `signIn('credentials', ...)`, which calls the app's `authorize()` callback
- Session cookie must be HTTP-only, matching the security posture already documented in `wiki/architecture.md`'s Security Architecture section

---

## References

- `wiki/architecture.md` — original Auth.js decision (Technology Stack, Authentication section)
- Related ADRs: ADR-001 (pdf-lib, precedent for preferring pure-JS over native/system dependencies where viable)
