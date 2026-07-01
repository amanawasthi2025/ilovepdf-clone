# Session Note: Session 024 — Schema (User/Account/Session/VerificationToken) + Signup/Login API

**Date:** 2026-07-01
**Session Goal:** Add the Auth.js-required Prisma models, wire up `next-auth`/`@auth/prisma-adapter`/`bcryptjs`, implement `POST /api/auth/signup`, and configure the Credentials-provider login flow at `/api/auth/[...nextauth]`, per the plan locked in Session 023.
**Status:** COMPLETE ✅

---

## What Was Done

### ADR-007 Correction (Addendum)

Before writing code, discovered that Auth.js's own runtime guard (`@auth/core`'s `assert.ts`) rejects `session.strategy: 'database'` when the Credentials provider is the only configured provider — a hard library constraint not known when ADR-007 was written in Session 023. Flagged to the user; decided to switch to `session.strategy: 'jwt'` (the standard, fully-supported Auth.js path for Credentials-only auth) rather than adding a workaround provider or hand-rolling session persistence. Documented as an Addendum in `docs/adr/007-user-authentication.md` (original Decision left intact as the historical record, per ADR immutability convention) and propagated the correction through `wiki/active-feature.md` (Scope Decisions table, Session Duration, API Contract, ACs 13/17/19, Open Questions table, schema comments).

`@auth/prisma-adapter` stays wired up (ready for future OAuth); the `Session` table remains provisioned in the schema but is unused for now, same treatment already given to `Account`/`VerificationToken`.

### Schema

Added `User`, `Account`, `Session`, `VerificationToken` models to `prisma/schema.prisma`, exactly matching `@auth/prisma-adapter`'s required shape plus `User.passwordHash`. `Job` untouched. Migration `20260701093242_add_user_authentication` applied cleanly against local Postgres.

### Dependencies

Added to `apps/web/package.json`: `next-auth@5.0.0-beta.31` (pinned exact beta version, not a floating tag), `@auth/prisma-adapter@^2.11.2`, `bcryptjs@^2.4.3`, `@types/bcryptjs@^2.4.6` (dev). `npm audit` confirmed none of the four introduce new vulnerabilities.

### `AUTH_SECRET`

Added to `apps/web/lib/env.ts`'s Zod schema (`z.string().min(1)`), `.env` (generated via `openssl rand -base64 32`), and `.env.example` (blank, with generation instructions in a comment).

### `apps/web/lib/auth.ts`

Auth.js config: `PrismaAdapter(prisma)`, `session: { strategy: 'jwt', maxAge: 30 days }`, one `Credentials` provider. The `authorize()` logic is extracted into an exported `authorizeCredentials()` function (not inlined in the provider config) specifically so it has a direct unit test, per the Testing Expectations in `CLAUDE.md` — it has non-trivial logic (email normalization, DB lookup, bcrypt compare) that would otherwise be untestable without spinning up the whole Auth.js request pipeline.

### `apps/web/app/api/auth/[...nextauth]/route.ts`

Thin re-export of `handlers` from `lib/auth.ts` (`GET`/`POST`), the standard Auth.js App Router wiring.

### `apps/web/app/api/auth/signup/route.ts`

Plain JSON API route (no file upload, so no `formData()` parsing needed, unlike Merge/Split/Compress). Zod schema validates email format and password length (8–72). Email is lowercased/trimmed before hashing and storage. Duplicate email is detected by catching Prisma's `P2002` unique-constraint error on `user.create()` (relies on the DB constraint rather than a separate existence check, avoiding a check-then-create race). Returns `{id, email}` on `201`, matching error codes/shape from `wiki/active-feature.md`'s API Contract (`INVALID_EMAIL`, `PASSWORD_TOO_SHORT`, `PASSWORD_TOO_LONG`, `EMAIL_ALREADY_REGISTERED`, `INTERNAL_ERROR`), following the same `errorResponse()` helper pattern already used in `compress/jobs/route.ts`.

### Tests

13 new unit tests:
- `lib/auth.test.ts` (6 tests) — `authorizeCredentials()`: missing email/password, no matching user, email normalization (lowercase/trim) before lookup, wrong password, correct password. Mocks `next-auth`, `next-auth/providers/credentials`, and `@auth/prisma-adapter` so the test doesn't trigger the real `NextAuth()` bootstrap (see below).
- `app/api/auth/signup/route.test.ts` (7 tests) — valid signup (with email-casing normalization), password never stored in plaintext, `INVALID_EMAIL`, `PASSWORD_TOO_SHORT`, `PASSWORD_TOO_LONG`, `EMAIL_ALREADY_REGISTERED` (via a real `Prisma.PrismaClientKnownRequestError` with code `P2002`), malformed JSON body → `INTERNAL_ERROR`.

### Bug Found: `next-auth` (beta) + Vitest ESM resolution

Importing `lib/auth.ts` directly in a test (to reach `authorizeCredentials`) failed with `ERR_MODULE_NOT_FOUND: Cannot find module '.../node_modules/next/server'`, thrown from inside `next-auth/lib/env.js`. Root cause: Vitest's Node-native ESM resolution requires explicit file extensions for bare-specifier subpath imports when the target package has no `exports` map (`next@14.2.5` has none) — this only breaks under Vitest's loader, not in Next.js's own bundler-patched runtime, confirmed by later exercising the real routes against a running `next dev` server without issue (see Manual Verification). Fixed by mocking `next-auth`, `next-auth/providers/credentials`, and `@auth/prisma-adapter` in `lib/auth.test.ts`, matching the existing pattern of mocking adjacent infra (`@/lib/queue`, `@/lib/storage`) in the Compress route tests — `authorizeCredentials`'s own logic doesn't depend on any of those three modules, so the mocks don't reduce what's actually being tested.

### Manual Verification

Started native Postgres (already running) and `next dev` locally, exercised the real HTTP endpoints with `curl`:
- `POST /api/auth/signup` (new email) → `201 {id, email}`, row confirmed in `User` table
- `POST /api/auth/signup` (same email again) → `409 EMAIL_ALREADY_REGISTERED`
- `GET /api/auth/csrf` → token issued
- `POST /api/auth/callback/credentials` (correct password, with CSRF token + cookie) → `302` redirect, `Set-Cookie: authjs.session-token=...; HttpOnly; SameSite=Lax`, 30-day expiry
- `GET /api/auth/session` (with the session cookie) → `{"user":{"email":"..."},"expires":"..."}` — confirms Auth.js's default `session` callback already surfaces `email` without a custom callback
- `POST /api/auth/callback/credentials` (wrong password) → `302` redirect to `/api/auth/signin?error=CredentialsSignin` — generic error, no field-specific detail (no user enumeration)

Cleaned up the smoke-test `User` row afterward (`DELETE FROM "User" WHERE email = 'smoketest@example.com'`) so it doesn't linger in the local dev database.

### Quality Gates

`npm run typecheck`, `npm run lint`, `npm run test` (via `turbo run`, all three packages) all green:
- Typecheck: 0 errors across `@ilovepdf/shared`, `@ilovepdf/web`, `@ilovepdf/worker`
- Lint: 0 warnings/errors
- Tests: 101/101 passing in `@ilovepdf/web` (13 new: 6 in `lib/auth.test.ts` + 7 in `signup/route.test.ts`), 16/16 in `@ilovepdf/worker`

---

## Acceptance Criteria Verified This Session

AC-03 through AC-07 (signup validation/persistence), AC-09 through AC-14 (login + JWT session cookie, as corrected by the ADR-007 Addendum), AC-23 (no existing Merge/Split/Compress route touched). Frontend-facing ACs (AC-01, AC-02, AC-08, AC-15–AC-22, AC-27, AC-28) remain for Sessions 025–026; AC-24–AC-26 (quality gates) hold for this session's own code and will be re-verified at each subsequent session.

---

## Risks / Notes Carried Forward

- Session revocation ("log out all devices") isn't possible with JWT sessions until a second (OAuth) provider is added — not required by any of the 28 ACs, but worth remembering if Job History or payments later want it.
- `next-auth@5.0.0-beta.31` is a pinned beta version, not a stable release — worth checking for a stable v5 release before this feature ships broadly.

---

## Next Steps

**Session 025: Frontend — `/signup`, `/login`, session-aware nav**

Builds the two form pages and the nav component against the API/config finished this session. Uses Auth.js's `signIn('credentials', { redirect: false })` client-side per the spec, not raw fetch to the callback route (the manual `curl` verification above used the raw form-encoded callback route only to prove the backend contract; the real frontend will go through Auth.js's client helpers).

---

*Session note written by: Claude Code (claude-sonnet-5)*
*Next session: Session 025 — Frontend: /signup, /login, session-aware nav*
