# Wiki: Active Feature

> This document describes the feature currently in development.
> Update it at the start of every feature and mark it complete when done.

---

## Current Feature: Job History

**Status:** PLANNING
**Started:** 2026-07-01
**Branch:** `feature/job-history`
**Sessions:** 027 (planning) → 028–030 (implementation)

---

## Feature Summary

Allow a logged-in user to see a list of the document-processing jobs they've submitted (Merge, Split, Compress) and re-download completed outputs, through a new `/history` page. Association is automatic: any job submitted while a session exists gets silently tagged with that user's id at creation time; anonymous submissions are completely unaffected. Once a job belongs to a user, its status/download endpoints require the requesting session to match that owner — anonymous (unowned) jobs keep working exactly as they do today, by `jobId` alone. This feature reuses the entire existing Merge/Split/Compress pipeline (upload → queue → worker → storage → status/download) with no new job types, no new worker code, and no change to file retention.

**Why this feature next:**
- `PROJECT.md`'s Medium-Term goals name "user accounts and job history" together — accounts (ADR-007) landed in the previous feature specifically to unblock this one
- `TASKS.md`'s Future Backlog names Job History as the item that becomes unblocked once auth lands, which it now has

**Explicitly out of scope for this pass (user-confirmed 2026-07-01):**
- Any change to file/job retention — no TTL cleanup worker is introduced; outputs remain retained exactly as indefinitely as they already are today (a pre-existing, separately-tracked gap — see Known Limitations in `wiki/completed-features.md` for Merge/Split/Compress)
- Explicit "save to history" opt-in UI — association is fully automatic based on session presence at submit time
- Pagination, filtering, or search on the history list — a simple capped list (most recent 50) only
- Retroactively claiming jobs created before this feature shipped, or jobs created while logged out
- Deleting a job from history (and its underlying file) — not requested; a future account-management feature could own this
- Live polling of in-progress jobs within the history list — the list reflects the state at page load; a page refresh shows updates (each tool's own page already provides live polling during an active session)

These are known limitations, not gaps — see ADR-008 for the reasoning behind the retention and authorization decisions specifically.

---

## Scope Decisions (locked 2026-07-01)

| Decision | Choice | Rationale |
|---|---|---|
| Retention/TTL | No change | Outputs already persist indefinitely in practice (no cleanup worker has ever existed); building one is a separate, larger effort not requested here — see ADR-008 |
| Authorization boundary | Enforced once a job has an owner | If `Job.userId` is set, status/download require the matching session (`403` otherwise); jobs with `userId` null (anonymous) are completely unaffected — see ADR-008 |
| Association | Automatic, based on session at submit time | No new UI on the existing tool pages; anonymous submission stays anonymous exactly as today |
| History page scope | Simple capped list (most recent 50) | No pagination/filtering/search in v1 — no evidence yet that users will accumulate enough jobs to need it (YAGNI) |
| List page implementation | Server Component querying Prisma directly | Mirrors `components/nav.tsx`'s existing pattern (reads `auth()` and DB state directly); no new `/api/jobs` REST endpoint needed since nothing else consumes this data yet |

---

## Database Schema

```prisma
model Job {
  id               String            @id @default(cuid())
  jobType          JobType
  status           JobStatus         @default(PENDING)
  inputKeys        String[]
  outputKey        String?
  splitRanges      String?
  compressionLevel CompressionLevel?
  errorMessage     String?
  correlationId    String            @unique
  expiresAt        DateTime
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
  userId           String?
  user             User?             @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model User {
  id           String    @id @default(cuid())
  email        String    @unique
  passwordHash String
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  accounts     Account[]
  sessions     Session[]
  jobs         Job[]
}
```

**Schema changes from User Authentication:**
- `Job` gains a nullable `userId` + `user` relation (`onDelete: Cascade`, matching the existing `Account`/`Session` pattern) — anonymous jobs (the vast majority today) keep `userId` null and are entirely unaffected
- `User` gains the reverse `jobs Job[]` field
- No new models, no new enums, no changes to `expiresAt`'s meaning or enforcement (still unenforced, unchanged from every prior feature)

---

## API Contract

### `POST /api/{merge,split,compress}/jobs` (existing routes — behavior change)

Each of the three upload routes now calls `auth()` before creating the `Job` row and passes the session's user id into `prisma.job.create`'s `userId` field (omitted/`null` when no session exists). No change to request/response shape, status codes, or error codes — this is invisible to the caller.

### `GET /api/{merge,split,compress}/jobs/:jobId/status` and `.../download` (existing routes — behavior change)

Immediately after the existing `JOB_NOT_FOUND` check, each handler adds one guard:

- If `job.userId` is `null` — proceed exactly as today, no session check, no behavior change.
- If `job.userId` is set — call `auth()`; if no session exists, or the session's user id doesn't match `job.userId`, return:

```json
{ "error": "JOB_ACCESS_DENIED", "message": "You do not have access to this job." }
```
with status `403`.

Owner requests proceed exactly as today (same response shapes as already documented for each tool).

### `/history` page (new — not a REST endpoint)

A Server Component, not an API route. Calls `auth()` directly; if no session exists, redirects to `/login` via Next.js's `redirect()`. If a session exists, queries:

```ts
prisma.job.findMany({
  where: { userId: session.user.id },
  orderBy: { createdAt: 'desc' },
  take: 50,
  select: { id: true, jobType: true, status: true, createdAt: true, errorMessage: true },
})
```

No new REST endpoint is introduced — nothing else needs this data yet (YAGNI), consistent with `components/nav.tsx`'s existing direct-DB-read pattern.

---

## Frontend Specification

### `/history`

- Server Component; redirects to `/login` if no session (mirrors the existing unauthenticated-access pattern — no new middleware)
- Reverse-chronological list of the current user's own jobs (job type, status, created date)
- `COMPLETED` rows render a small client "Download" control that, on click, fetches `GET /api/{type}/jobs/:id/download` (the same per-type endpoint each tool page already calls) and navigates the browser to the returned pre-signed URL — reused across rows, parameterized by `jobType`, not a new download mechanism
- `FAILED` rows show the job's `errorMessage`
- `PENDING`/`PROCESSING` rows show their status as plain text — no polling; a page refresh reflects any status change (see Explicitly out of scope)
- Capped to the 50 most recent jobs, no pagination controls

### Nav

- `components/nav.tsx` gains a "History" link, shown only when a session exists, alongside the existing email + "Log out" control
- No change to the logged-out state (still "Log in"/"Sign up" only)

### `/merge`, `/split`, `/compress`

- No visible changes. Their upload routes now tag the created job with a `userId` when logged in, but this is invisible to the submitting user — the existing IDLE → UPLOADING → PROCESSING → DONE/ERROR flow, polling, and download behavior are unchanged.

---

## Acceptance Criteria

### Association

- [ ] AC-01: A job submitted while logged in has its `Job.userId` set to that user's id
- [ ] AC-02: A job submitted while logged out has `Job.userId` null — unchanged from today
- [ ] AC-03: A user's history never includes jobs created before this feature shipped, or jobs created while logged out (no retroactive claiming)

### Authorization

- [ ] AC-04: Status/download for an owned job, requested by the owning user's session, succeeds exactly as before
- [ ] AC-05: Status/download for an owned job, requested with no session, returns `403 JOB_ACCESS_DENIED`
- [ ] AC-06: Status/download for an owned job, requested by a different logged-in user's session, returns `403 JOB_ACCESS_DENIED`
- [ ] AC-07: Status/download for an anonymous job (`userId` null) behaves identically regardless of the requester's session state — verified for all three tool types (Merge, Split, Compress), no regression

### History Page

- [ ] AC-08: Visiting `/history` while logged in shows the user's own jobs, most recent first
- [ ] AC-09: Each row shows job type, status, and created date
- [ ] AC-10: A `COMPLETED` row's download control successfully downloads the correct output file
- [ ] AC-11: A `FAILED` row shows its error message
- [ ] AC-12: The list is capped to the 50 most recent jobs
- [ ] AC-13: Visiting `/history` while logged out redirects to `/login`
- [ ] AC-14: A user's history never shows another user's jobs or anonymous jobs
- [ ] AC-15: Nav shows a "History" link only when logged in

### Anonymous Tools Unaffected

- [ ] AC-16: `/merge` functions identically whether the visitor is logged in or logged out
- [ ] AC-17: `/split` functions identically whether the visitor is logged in or logged out
- [ ] AC-18: `/compress` functions identically whether the visitor is logged in or logged out
- [ ] AC-19: All pre-existing Merge/Split/Compress unit, integration, and E2E tests continue to pass unmodified

### Quality

- [ ] AC-20: `npm run typecheck` exits with 0 errors
- [ ] AC-21: `npm run lint` exits with 0 errors/warnings
- [ ] AC-22: `npm run test` passes all unit and integration tests
- [ ] AC-23: Playwright E2E test passes: submit a job while logged in → job appears in `/history` with correct type/status → download succeeds
- [ ] AC-24: Playwright E2E test passes: `/history` redirects to `/login` when logged out; a job owned by one user returns `403` when its status/download endpoint is requested using a different user's session

---

## Open Questions — Resolved

| Question | Decision | Rationale |
|---|---|---|
| Should file/job retention change? | No | Already indefinite in practice; a real TTL worker is a separate, larger effort — see ADR-008 |
| Should ownership become an enforced access boundary? | Yes, once a job has an owner | Closes a real (if minor) information-disclosure gap for authenticated users without touching anonymous jobs — see ADR-008 |
| How does a job get associated with a user? | Automatically, based on session at submit time | No new UI on existing tool pages; avoids scope creep beyond the backlog item |
| Should the history page have pagination/filtering in v1? | No — simple capped list | No evidence yet of need; YAGNI |

No open questions remain that block implementation.

---

## Session Breakdown

| Session | Title | Status |
|---|---|---|
| 027 | Planning, ADR-008 & Acceptance Criteria | COMPLETE ✅ |
| 028 | Schema (`Job.userId`) + Association (upload routes) + Ownership Enforcement (status/download routes) | Not started |
| 029 | Frontend: `/history` page, nav "History" link | Not started |
| 030 | E2E Tests, Polish & Definition of Done | Not started |

---

*This document will be updated as each session completes.*
