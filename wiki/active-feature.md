# Wiki: Active Feature

> This document describes the feature currently in development.
> Update it at the start of every feature and mark it complete when done.

---

## Current Feature: User Authentication

**Status:** IN PROGRESS
**Started:** 2026-07-01
**Branch:** `feature/user-auth`
**Sessions:** 023 (planning) → 024–026 (implementation)

---

## Feature Summary

Allow a user to create an account with an email and password, log in, and log out, through a browser interface. Session state is tracked via a signed JWT cookie (see ADR-007 Addendum — Auth.js forces JWT strategy for Credentials-only setups). This feature is purely additive infrastructure: Merge, Split, and Compress remain fully anonymous and unchanged — no tool route requires a session. The only new user-facing surface is the signup/login forms and a session-aware nav (shows the logged-in user's email and a logout control when a session exists; shows "Log in" / "Sign up" links otherwise).

**Why this feature next:**
- Backlog priority #1 (`TASKS.md`) — the anonymous no-auth tool set (Merge/Split/Compress) is proven; PROJECT.md's Medium-Term goals name "user accounts" as the next step
- Unlocks the future Job History feature (backlog #5), which requires a `User` to associate jobs with
- `wiki/architecture.md` already named Auth.js (NextAuth v5) as the planned library — this feature acts on a decision already made, not a new one

**Explicitly out of scope for this pass (user-confirmed 2026-07-01):**
- Gating Merge/Split/Compress behind login — they stay anonymous
- OAuth providers (Google/GitHub) — email/password only
- Email verification
- Password reset flow
- Any account/profile page — no new UI beyond the auth forms and session-aware nav

These are known limitations, not gaps — see ADR-007 for the reasoning.

---

## Scope Decisions (locked 2026-07-01)

| Decision | Choice | Rationale |
|---|---|---|
| Auth library | Auth.js v5 (`next-auth`) + `@auth/prisma-adapter` | Already the planned choice in `wiki/architecture.md`; see ADR-007 |
| Auth method | Email/password only (Credentials provider) | No external OAuth app registration needed; user-confirmed scope |
| Session strategy | JWT (forced by Auth.js — Credentials provider only supports JWT when no other provider is configured) | See ADR-007 Addendum (Session 024); `@auth/prisma-adapter` stays wired up for future OAuth, `Session` table remains provisioned but unused for now |
| Password hashing | `bcryptjs` (pure JS, no native compilation) | Avoids a second native-binding dependency (worker already has one: `sharp`, ADR-006); see ADR-007 |
| Email verification | Not implemented | YAGNI — no transactional email provider dependency needed yet; user-confirmed |
| Password reset | Not implemented | Same reasoning as email verification; deferred, not a blocker |
| Tool gating | None — Merge/Split/Compress stay anonymous | User-confirmed; this feature is additive only |
| New user-facing surface | Signup form, login form, session-aware nav only | User-confirmed; no account/profile page yet (belongs to future Job History feature) |

### Password Requirements

| Rule | Value |
|---|---|
| Minimum length | 8 characters |
| Maximum length | 72 characters (bcrypt's own input limit) |
| Complexity | None enforced beyond length — composition rules (must contain a symbol, etc.) are a well-documented anti-pattern (NIST SP 800-63B) that push users toward predictable patterns; length is the more effective signal |

### Email Requirements

- Must pass a standard email-format check (Zod's `.email()`)
- Stored lowercased and trimmed; uniqueness enforced case-insensitively at the DB level (`citext` is not currently used elsewhere in this schema, so uniqueness is enforced by always lowercasing before every read/write, backed by a unique index on the stored lowercase value)
- Duplicate signup attempt returns a generic `409 EMAIL_ALREADY_REGISTERED` — no user enumeration beyond confirming the email is taken, which is unavoidable with this error shape and accepted as a standard trade-off for a first version (mitigating it requires a verification-email flow, which is explicitly out of scope)

---

## Constraints

### Rate Limiting

Not implemented for this pass, consistent with Merge/Split/Compress. Noted as a known gap for login/signup specifically (brute-force protection) — acceptable for now since there is no sensitive data behind an account yet (no Job History, no payments), revisit when either lands.

### Session Duration

30 days, matching Auth.js's own default `session.maxAge` — now the JWT cookie's own expiry (see ADR-007 Addendum) rather than a `Session` table row's `expires` column. No "remember me" toggle in v1 — one session duration for all logins.

### CSRF / Cookie Security

Handled by Auth.js itself (built-in CSRF token handling for the credentials flow, HTTP-only session cookie, `SameSite=Lax`). No custom implementation needed.

---

## Database Schema

```prisma
model User {
  id           String    @id @default(cuid())
  email        String    @unique
  passwordHash String
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  accounts     Account[]
  sessions     Session[]
}

// Auth.js's required adapter shape (Account, Session, VerificationToken)
// provisioned now per ADR-007, all three unused in v1 (session strategy is JWT,
// not database — see ADR-007 Addendum) — avoids a schema-rewrite migration if
// OAuth/email-verification/database-sessions are added later.

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
```

**Schema changes from Compress:**
- Four new models: `User`, `Account`, `Session`, `VerificationToken` — the exact shape `@auth/prisma-adapter` requires, with `User.passwordHash` added as a project-specific field (Auth.js does not implement credential storage itself)
- `Job` is completely untouched — no foreign key to `User` in this pass; anonymous `jobId`-based access for Merge/Split/Compress is unaffected
- `Account`/`VerificationToken`/`Session` are provisioned but unused until OAuth/email-verification/database-sessions are added (see ADR-007 and its Addendum)

---

## API Contract

### POST /api/auth/signup

Custom route (Auth.js does not provide a signup flow — only session/login machinery).

**Request:** `multipart/form-data` is not needed here (no file upload) — plain JSON.
```json
{ "email": "user@example.com", "password": "at-least-8-chars" }
```

**Success — 201 Created:**
```json
{ "id": "clx...", "email": "user@example.com" }
```
No password or hash in the response. Signup does **not** automatically log the user in — a separate login step is required, matching the "no new surface beyond the forms" scope (an auto-login would require wiring the Auth.js session-creation path into a non-Auth.js route handler, extra complexity not justified for v1).

**Errors:**
| Status | Error Code | Condition |
|---|---|---|
| 400 | `INVALID_EMAIL` | Email fails format validation |
| 400 | `PASSWORD_TOO_SHORT` | Password under 8 characters |
| 400 | `PASSWORD_TOO_LONG` | Password over 72 characters |
| 409 | `EMAIL_ALREADY_REGISTERED` | Email already has an account |

### Auth.js route handlers — `/api/auth/[...nextauth]`

Standard Auth.js catch-all route handling `signIn`, `signOut`, `session`, and CSRF endpoints. Configured with:
- `CredentialsProvider` — `authorize()` looks up `User` by lowercased email, compares `bcryptjs.compare(password, user.passwordHash)`, returns the user object (minus `passwordHash`) on match or `null` on failure (Auth.js maps a `null` return to a generic auth failure — no distinction between "no such email" and "wrong password" is surfaced to the client, standard practice against user enumeration)
- `@auth/prisma-adapter` — wired up for future OAuth (unused by the Credentials + JWT path itself); see ADR-007 Addendum
- `session.strategy: 'jwt'`, `session.maxAge: 30 days` (corrected from `'database'` in Session 024 — see ADR-007 Addendum: Auth.js rejects database sessions when Credentials is the only provider)

### Session check (server components / route handlers)

Any server component or route handler that needs to know the current session calls Auth.js's `auth()` helper, which reads and verifies the JWT session cookie. No new API endpoint — this is a library-provided helper, not a route.

---

## Frontend Specification

### `/signup`

- Email + password fields, client-side validation mirrors the API's rules (length, email format) for immediate feedback, but the API is the source of truth
- Submit button disabled until both fields pass client-side checks
- On `201`: redirect to `/login` with a success message ("Account created — log in to continue")
- On `409 EMAIL_ALREADY_REGISTERED`: inline error under the email field ("An account with this email already exists")
- On other 4xx/5xx: generic error banner, same pattern as Merge/Split/Compress's upload-error banner

### `/login`

- Email + password fields, calls Auth.js's `signIn('credentials', { email, password, redirect: false })`
- On success: redirect to `/` (home)
- On failure: generic error banner ("Invalid email or password") — deliberately not specific about which field is wrong, per the API's no-enumeration behavior

### Session-aware nav

- Server component reads the session via `auth()`
- Logged in: shows the user's email and a "Log out" control (calls Auth.js's `signOut()`)
- Logged out: shows "Log in" and "Sign up" links
- No changes to `/merge`, `/split`, `/compress` — they render identically regardless of session state

---

## Acceptance Criteria

### Signup

- [ ] AC-01: User can navigate to `/signup` and see email + password fields
- [ ] AC-02: Submit button is disabled until email and password pass client-side validation
- [ ] AC-03: Submitting a valid new email/password creates a `User` row with a bcrypt password hash (never the plaintext password) and redirects to `/login` with a success message
- [ ] AC-04: Submitting an already-registered email shows an inline "email already exists" error and does not create a duplicate `User` row
- [ ] AC-05: Submitting a password under 8 characters is rejected by the API with `PASSWORD_TOO_SHORT`
- [ ] AC-06: Submitting a malformed email is rejected by the API with `INVALID_EMAIL`
- [ ] AC-07: Email is stored lowercased regardless of the casing typed by the user
- [ ] AC-08: A network failure during signup shows a generic error banner and does not lose the entered form values

### Login

- [ ] AC-09: User can navigate to `/login` and see email + password fields
- [ ] AC-10: Submitting correct credentials for an existing account logs the user in and redirects to `/`
- [ ] AC-11: Submitting an incorrect password shows a generic "Invalid email or password" error (no indication of which field is wrong)
- [ ] AC-12: Submitting an email with no matching account shows the same generic error as AC-11 (no user enumeration)
- [ ] AC-13: A successful login sets a signed JWT session cookie with a 30-day expiry (corrected from "creates a `Session` row" in Session 024 — see ADR-007 Addendum)
- [ ] AC-14: The session cookie is HTTP-only and not readable via `document.cookie` in the browser

### Session & Nav

- [ ] AC-15: When logged in, the nav shows the user's email and a "Log out" control on every page
- [ ] AC-16: When logged out, the nav shows "Log in" and "Sign up" links on every page
- [ ] AC-17: Clicking "Log out" clears the session cookie (Auth.js `signOut()`), redirects to `/`, and the nav reverts to the logged-out state (corrected from "deletes the `Session` row" in Session 024 — see ADR-007 Addendum)
- [ ] AC-18: A logged-in session persists across a full page reload (server-rendered nav reflects the session on first paint, no client-side flash of the logged-out state)
- [ ] AC-19: An expired or tampered session cookie is treated as logged-out without an error page (corrected from "expired or deleted session" in Session 024 — see ADR-007 Addendum)

### Anonymous Tools Unaffected

- [ ] AC-20: `/merge` functions identically whether the visitor is logged in or logged out
- [ ] AC-21: `/split` functions identically whether the visitor is logged in or logged out
- [ ] AC-22: `/compress` functions identically whether the visitor is logged in or logged out
- [ ] AC-23: No existing Merge/Split/Compress API route requires a session

### Quality

- [ ] AC-24: `npm run typecheck` exits with 0 errors
- [ ] AC-25: `npm run lint` exits with 0 errors/warnings
- [ ] AC-26: `npm run test` passes all unit and integration tests
- [ ] AC-27: Playwright E2E test passes: sign up → login → nav shows logged-in state → reload persists session → logout → nav shows logged-out state
- [ ] AC-28: Playwright E2E test passes: duplicate-email signup and wrong-password login both show their respective error states without crashing

---

## Open Questions — Resolved

| Question | Decision | Rationale |
|---|---|---|
| Auth library | Auth.js v5 + Prisma adapter | Already the planned choice in `wiki/architecture.md`; see ADR-007 |
| Auth method scope | Email/password only | User-confirmed; avoids external OAuth app setup dependency |
| Session strategy | JWT (corrected from database sessions in Session 024) | Auth.js forces JWT strategy for Credentials-only providers; see ADR-007 Addendum |
| Email verification | Deferred | YAGNI — no email-sending dependency needed yet |
| Should Merge/Split/Compress require login | No — stay anonymous | User-confirmed; this feature is additive infrastructure only |
| New UI beyond auth forms | None (no account page) | User-confirmed; strict YAGNI, Job History will own that surface later |
| Password hashing | `bcryptjs` (pure JS) | Avoids a second native-binding dependency; see ADR-007 |

No open questions remain that block implementation.

---

## Session Breakdown

| Session | Title | Status |
|---|---|---|
| 023 | Planning, ADR-007 & Acceptance Criteria | COMPLETE ✅ |
| 024 | Schema (User/Account/Session/VerificationToken) + Signup/Login API | COMPLETE ✅ |
| 025 | Frontend: `/signup`, `/login`, session-aware nav | Not started |
| 026 | E2E Tests, Polish & Definition of Done | Not started |

---

## Implementation Notes (Session 024)

- Session strategy corrected from database to JWT mid-session — see ADR-007 Addendum. All references to "Session row"/"database sessions" throughout this document have been updated to describe JWT cookie behavior instead.
- Auth.js's default `session` callback already surfaces `email` on `session.user` with no custom callback needed — confirmed via manual `GET /api/auth/session` verification against a real login.
- `authorizeCredentials()` is exported separately from the Auth.js config object in `lib/auth.ts` specifically so it has a direct unit test without needing to mock the whole Auth.js request pipeline.

---

*This document will be updated as each session completes.*
