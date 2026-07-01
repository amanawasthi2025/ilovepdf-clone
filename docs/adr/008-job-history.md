# ADR-008: Job History — User-Scoped Job Association & Ownership Enforcement

**Status:** Accepted
**Date:** 2026-07-01
**Author:** Claude Code Session 027

---

## Context

User Authentication (ADR-007) landed as purely additive infrastructure — Merge, Split, and Compress remained fully anonymous, and no `Job` row could be associated with a `User`. `PROJECT.md`'s Medium-Term goals name "user accounts and job history" together as the natural next step, and `TASKS.md`'s Future Backlog names Job History as the item auth was explicitly meant to unblock.

Two facts about the existing system shape this decision:

1. **Retention today is already indefinite in practice.** Every prior feature's Known Limitations note the same gap: `Job.expiresAt` is stored but no cleanup worker has ever existed, so job outputs persist in MinIO until storage pressure forces the issue. There is no TTL enforcement to preserve or change.
2. **Access today is obscurity-based.** `GET /api/{merge,split,compress}/jobs/:jobId/status` and their `.../download` siblings look up a `Job` by its `id` (a `cuid`) alone — no session check exists anywhere in these six route handlers. Anyone holding a `jobId` can poll its status or download its output, logged in or not.

Job History introduces the first case where a `Job` row has an owner. That immediately raises a question the anonymous-only system never had to answer: once a job belongs to someone, should it stop being obscurity-only?

The user was presented with these trade-offs directly (not assumed) ahead of this ADR:
- **Retention:** confirmed no change — Job History is a visibility feature on top of today's existing (indefinite) storage behavior. Building a real TTL/cleanup worker is out of scope here and remains the same pre-existing, separately-tracked gap.
- **Authorization:** confirmed that ownership should become an enforced boundary — once a `Job.userId` is set, its status/download routes require the requesting session to match. Anonymous jobs (`userId` null) are untouched.
- **Association:** confirmed automatic — if a session exists at submit time, the job is silently tagged with that `userId`. No opt-in UI.
- **History page scope:** confirmed a simple capped list (most recent 50, no pagination/filtering) for v1.

---

## Problem

How should a `Job` be associated with the `User` who created it, and what — if anything — should that association change about who can read that job's status or download its output?

---

## Options Considered

### Option 1: Nullable `Job.userId`, auto-set from session, ownership enforced only when set

**Description:** Add an optional `userId String?` foreign key to `Job` (relation to `User`, `onDelete: Cascade`, matching the existing `Account`/`Session` pattern). Each of the three upload routes reads the session server-side via `auth()` at job-creation time and sets `userId` if one exists; anonymous submissions leave it `null`, exactly as today. The six existing status/download route handlers add one check: if `job.userId` is not null, the request's session must match it (`403 JOB_ACCESS_DENIED` otherwise, whether unauthenticated or authenticated as someone else) — if `job.userId` is null, behavior is completely unchanged.

**Pros:**
- Minimal schema change — one nullable column, one relation, no new tables
- Reuses every existing piece of infrastructure (Job table, upload/status/download routes, polling frontend) — no new job types, no new queue logic, no new worker code
- Anonymous flows provably unaffected: the ownership check is an early-return no-op when `userId` is null, so Merge/Split/Compress's existing behavior and their entire existing test suites keep passing unmodified
- Closes a real, if minor, information-disclosure gap for authenticated users going forward, without having to retrofit it onto anonymous jobs where it doesn't apply

**Cons:**
- Touches six existing, already-shipped route handlers (status + download × 3 tool types) — the widest blast radius of any session in this feature, even though each change is a small, identical guard clause
- Adds a query for the session (`auth()`) to routes that previously had none, a small latency/complexity cost on every status poll for owned jobs

**Estimated effort:** Medium

---

### Option 2: Separate `JobHistory` join/record table

**Description:** Instead of adding a column to `Job`, create a new `JobHistory` table (`userId`, `jobId`, `createdAt`) that references `Job` without modifying it. The history page reads from this join table; the underlying `Job` row and its existing routes are untouched.

**Pros:**
- Zero changes to any existing route handler — genuinely the smallest diff to already-shipped code
- Keeps "ownership" as an additive annotation rather than a property of the job itself

**Cons:**
- Two records describing one event (the `Job` row and its `JobHistory` row) with no single source of truth — directly contradicts this project's existing pattern of `Job` being the one authoritative record for a processing operation (established since PDF Merge)
- Solves nothing for the authorization question the user already confirmed they want addressed — a job's own status/download endpoints would remain exactly as obscurity-based as before, so the "gap" identified in Context stays open regardless
- Duplication for duplication's sake: no second consumer of `Job` data exists yet that would justify a join table over a column (YAGNI)

**Estimated effort:** Medium (similar size to Option 1, for a worse outcome)

---

### Option 3: Required `Job.userId` (login required for all tool usage)

**Description:** Make `userId` mandatory on every `Job`, effectively requiring login to use Merge/Split/Compress at all.

**Pros:**
- Simplest possible ownership model — every job has exactly one owner, no nullable-column branching anywhere

**Cons:**
- Directly contradicts ADR-007's explicit, user-confirmed decision that authentication is purely additive and Merge/Split/Compress stay anonymous — this option silently reopens and reverses that decision without new instruction to do so
- Would break every existing anonymous-flow acceptance criterion and E2E test across all three tool features

**Estimated effort:** N/A — rejected on scope grounds, not effort

---

## Decision

We chose **Option 1: Nullable `Job.userId`, auto-set from session, ownership enforced only when set.**

This is the smallest change that satisfies all four user-confirmed decisions (no retention change, enforced ownership once set, automatic association, simple list page) while keeping `Job` as the single source of truth for a processing operation — consistent with every prior feature in this project.

---

## Consequences

### Positive
- One new nullable column + one new relation; no new tables, no new job types, no new worker/queue logic
- Anonymous Merge/Split/Compress usage is provably unaffected — the ownership check is a no-op when `userId` is null
- Closes an information-disclosure gap for authenticated users' jobs going forward

### Negative
- Six existing route handlers each need a small, repeated guard-clause addition and a re-run of their existing test suites to confirm no regression — the widest surface-area touch of any feature session so far
- `Job.userId` and the ownership check add one more thing every future job-type addition must remember to wire up correctly (mitigated by keeping the guard clause identical and centrally documented here, not by any code-level abstraction — three near-identical call sites do not yet justify a shared helper, YAGNI)

### Neutral / Trade-offs
- Retention/TTL enforcement remains exactly as unsolved as it was before this feature — Job History makes existing (indefinite) retention visible, it does not change it. This is a deliberate, user-confirmed scope boundary, not an oversight.
- `onDelete: Cascade` on `Job.userId → User.id` means a deleted `User` row deletes their job history along with it. No delete-account feature exists yet, so this is currently unreachable in practice; it matches the existing `Account`/`Session` cascade pattern rather than introducing a new one.

---

## Alternatives Rejected

- **Option 2 (separate `JobHistory` table)** — Rejected: introduces a second record for the same event with no second consumer to justify it, and leaves the authorization gap the user asked to close entirely unaddressed.
- **Option 3 (required `Job.userId`)** — Rejected: reverses ADR-007's explicit "auth is purely additive" decision without new instruction to do so; would break every anonymous-flow acceptance criterion already shipped.

---

## Implementation Notes

- Add `userId String?` + `user User? @relation(fields: [userId], references: [id], onDelete: Cascade)` to `Job`; add the reverse `jobs Job[]` field to `User`, matching the `Account`/`Session` pattern already in the schema.
- Each of the three upload routes (`POST /api/{merge,split,compress}/jobs`) calls `auth()` and passes `session?.user?.id` into `prisma.job.create`'s `data.userId` (undefined/omitted when no session, which Prisma treats as `null`).
- Each of the six status/download route handlers adds the same guard immediately after the `job` lookup and the existing `JOB_NOT_FOUND` check: if `job.userId` is not null, call `auth()` and compare `session?.user?.id === job.userId`; on mismatch (including no session), return `403 JOB_ACCESS_DENIED`. When `job.userId` is null, skip the check entirely — no behavior change for anonymous jobs.
- New `GET /history` page is a Server Component that calls `auth()` directly and queries `prisma.job.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 })` — no new `/api/jobs` REST endpoint, consistent with `components/nav.tsx`'s existing pattern of a server component reading session/DB state directly rather than round-tripping through a same-origin API. If unauthenticated, the page calls Next.js's `redirect('/login')`.

---

## References

- ADR-007 (`007-user-authentication.md`) — the auth infrastructure this feature builds on; its "purely additive" scope boundary is what Option 3 would have violated
- `wiki/completed-features.md` — Known Limitations sections for Merge/Split/Compress, documenting the pre-existing lack of TTL enforcement referenced in Context
