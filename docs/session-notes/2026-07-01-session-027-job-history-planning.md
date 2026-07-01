# Session Note: Session 027 — Job History: Planning, ADR-008 & Acceptance Criteria

**Date:** 2026-07-01
**Session Goal:** Plan the Job History feature — the next feature after User Authentication (Sessions 023–026, complete) — per the Required Workflow Before Coding in `CLAUDE.md`: read context, surface ambiguities, propose a plan, get explicit approval, and only then write the planning docs.
**Status:** COMPLETE ✅ (planning only — no application code written this session)

---

## What Was Done

### Scope decisions (user-confirmed before any docs were written)

`PROJECT.md`'s Medium-Term goals name "user accounts and job history" together, and `TASKS.md`'s Future Backlog already named Job History as the item User Authentication was meant to unblock. What wasn't obvious from the backlog note — and was explicitly surfaced rather than assumed, per the Ask-Before-Assuming Rule — was scope, because two facts about the existing system made the "obvious" reading ambiguous:

1. Every prior feature's Known Limitations note that no TTL/cleanup worker has ever existed — job outputs already persist indefinitely in practice. So "allows users to re-download outputs" (the backlog note) doesn't necessarily require new retention infrastructure — it might already be true today.
2. All six existing status/download route handlers (Merge/Split/Compress × 2) are obscurity-based today — reachable by anyone holding a `jobId`, logged in or not, with no session check anywhere. Introducing job ownership raises the question of whether that should change.

Four questions were put to the user directly:

1. **Should Job History change file retention behavior?** → No — outputs already persist indefinitely; building a real TTL/cleanup worker is a separately-tracked, larger effort, not part of this feature.
2. **Should ownership become an enforced access boundary on the existing status/download routes?** → Yes — once a job has an owner, its status/download requires the matching session (`403` otherwise); anonymous (unowned) jobs are completely unaffected.
3. **How should a job get associated with a user?** → Automatically, based on session presence at submit time — no new opt-in UI on the existing tool pages.
4. **What should `/history` cover in v1?** → A simple capped list (most recent 50), no pagination/filtering/search.

### `docs/adr/008-job-history.md`

Documents the decision: nullable `Job.userId` + relation (`onDelete: Cascade`, matching the existing `Account`/`Session` pattern), set automatically from the session at job-creation time, with the same ownership guard added to all six existing status/download handlers. Considered and rejected a separate `JobHistory` join table (would duplicate `Job` as the source of truth with no second consumer to justify it, and would leave the authorization gap unaddressed) and a required (non-nullable) `Job.userId` (would silently reverse ADR-007's explicit "auth is purely additive" decision).

### `wiki/active-feature.md`

Full spec: schema (`Job.userId`, `User.jobs`), the behavior change to the three upload routes (tag `userId` from session) and six status/download routes (ownership guard), the new `/history` page (a Server Component querying Prisma directly — no new REST endpoint, mirroring `components/nav.tsx`'s existing direct-DB-read pattern), and the nav's new "History" link. 24 acceptance criteria across Association, Authorization, History Page, Anonymous Tools Unaffected, and Quality.

### `TASKS.md`, `CHANGELOG.md`

Updated to make Job History the Current Feature (Status: PLANNING) with the Session 027–030 breakdown. Job History removed from the Future Backlog table (items renumbered). `CHANGELOG.md` gained a new `[0.5.0]` section. Branch `feature/job-history` created off `origin/develop`.

---

## Acceptance Criteria Verified This Session

None — this was a planning-only session. All 24 ACs in `wiki/active-feature.md` remain unchecked, to be verified across Sessions 028–030.

---

## Risks / Notes Carried Forward

- **Widest existing-code blast radius of any feature session so far:** Session 028 touches six already-shipped route handlers (status + download × 3 tool types) to add the ownership guard. Each change is a small, identical guard clause, but the existing Merge/Split/Compress test suites (unit + integration + E2E) must all be re-run and confirmed green with zero regressions — this is the main technical risk, not the new code itself.
- `Job.userId` and its guard clause are deliberately *not* factored into a shared helper function across the three route handlers in Session 028 — three near-identical call sites don't yet justify an abstraction (YAGNI), per ADR-008's Implementation Notes.
- No implementation risk flagged requiring a spike (unlike Session 020's pdf-lib API exploration) — this feature adds one nullable FK and one guard clause pattern, both well-understood.

---

## Next Steps

**Session 028: Schema (`Job.userId`) + Association + Ownership Enforcement**

Add the `Job.userId`/`User.jobs` relation and migration, update the three upload routes to tag `userId` from the session, and add the ownership guard to all six status/download route handlers.

---

*Session note written by: Claude Code (claude-sonnet-5)*
*Next session: Session 028 — Schema + Association + Ownership Enforcement*
