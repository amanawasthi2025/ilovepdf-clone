# Session Note: Session 023 — User Authentication: Planning, ADR-007 & Acceptance Criteria

**Date:** 2026-07-01
**Session Goal:** Plan the User Authentication feature — the next feature after PDF Compress (Sessions 018–022, complete) — per the Required Workflow Before Coding in `CLAUDE.md`: read context, surface ambiguities, propose a plan, get explicit approval, and only then write the planning docs.
**Status:** COMPLETE ✅ (planning only — no application code written this session)

---

## What Was Done

### Scope decisions (user-confirmed before any docs were written)

`wiki/architecture.md` already named Auth.js (NextAuth v5) as the planned auth library, so the library choice itself wasn't in question. What was ambiguous — and explicitly surfaced rather than assumed, per the Ask-Before-Assuming Rule — was scope:

1. **Should Merge/Split/Compress require login?** → No. Auth is purely additive; existing tools stay anonymous.
2. **Auth method for MVP?** → Email/password only (Credentials provider). OAuth deferred — it would require the user to register external apps with Google/GitHub before any of this could be built or tested.
3. **Session strategy?** → Database sessions via `@auth/prisma-adapter`, not JWT — consistent with the existing pattern of Postgres as the single source of truth for all state (jobs, and now sessions).
4. **Email verification?** → Skipped for v1 — avoids pulling in a transactional email provider as a new dependency (YAGNI).
5. **Any new UI beyond the auth forms?** → No — no account/profile page. Auth is infrastructure only; Job History (a separate future backlog item) will own that surface later.

### `docs/adr/007-user-authentication.md`

Documents the decision: Auth.js v5 + `@auth/prisma-adapter`, Credentials provider, database sessions, `bcryptjs` for password hashing. Considered and rejected JWT sessions (breaks the Postgres-as-source-of-truth pattern for no offsetting benefit at this scale) and Clerk (already rejected once in `wiki/architecture.md` when Auth.js was originally chosen — vendor lock-in, cost, auth data leaving our own database). `bcryptjs` was chosen over native `bcrypt`/`argon2` specifically to avoid adding a second native-binding dependency to the stack (the worker already has one: `sharp`, per ADR-006) — password hashing has no performance constraint that would justify it.

### `wiki/active-feature.md`

Full spec: password/email requirements (8–72 char length only, no composition rules — NIST SP 800-63B reasoning), the `User`/`Account`/`Session`/`VerificationToken` Prisma schema (the latter two provisioned but unused until OAuth/verification are added, avoiding a future migration rewrite), `POST /api/auth/signup` contract (signup does not auto-login — a deliberate scope-minimizing choice), the Auth.js `[...nextauth]` catch-all configuration, and the `/signup`/`/login`/session-aware-nav frontend spec. 28 acceptance criteria across Signup, Login, Session & Nav, Anonymous Tools Unaffected, and Quality.

### `TASKS.md`, `CHANGELOG.md`

Updated to make User Authentication the Current Feature (Status: PLANNING), with the Session 023–026 breakdown. Future Backlog renumbered now that auth is in progress rather than pending. `CHANGELOG.md` gained a new `[0.4.0]` section.

---

## Acceptance Criteria Verified This Session

None — this was a planning-only session. All 28 ACs in `wiki/active-feature.md` remain unchecked, to be verified across Sessions 024–026.

---

## Risks / Notes Carried Forward

- **AC-23** ("no existing Merge/Split/Compress API route requires a session") should be trivially true by construction, since this feature adds no middleware or route changes to those paths — but it's an explicit AC precisely so Session 026's E2E pass verifies it wasn't accidentally broken, rather than assuming it.
- The `Account`/`VerificationToken` Prisma models are dead schema in v1 (no OAuth, no verification) — intentional per ADR-007, not an oversight, but worth remembering if a future session is tempted to "clean up unused tables."
- No implementation risk flagged for Session 024 (unlike Session 020's pdf-lib API spike) — Auth.js's Credentials provider + Prisma adapter is a well-documented, common integration pattern with no unresolved API questions.

---

## Next Steps

**Session 024: Schema (User/Account/Session/VerificationToken) + Signup/Login API**

Add the four new Prisma models and migration, implement `POST /api/auth/signup`, and configure the Auth.js `[...nextauth]` route handler with the Credentials provider and Prisma adapter.

---

*Session note written by: Claude Code (claude-sonnet-5)*
*Next session: Session 024 — Schema + Signup/Login API*
