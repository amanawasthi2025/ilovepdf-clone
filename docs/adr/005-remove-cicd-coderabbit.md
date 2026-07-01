# ADR-005: Remove CI/CD (GitHub Actions) and CodeRabbit

**Status:** Accepted
**Date:** 2026-07-01
**Author:** Claude Code Session 017

---

## Context

The project has run a GitHub Actions CI pipeline (`.github/workflows/ci.yml`: typecheck, lint, test on every push/PR to `develop`/`master`) since Session 001, and CodeRabbit as an automated PR reviewer since Session 001 as well. `develop` and `master` branch protection required the CI status check and one approving PR review to merge.

CodeRabbit's review was already effectively not gating anything: `wiki/lessons-learned.md` (2026-07-01) documents that CodeRabbit's review state was `COMMENTED`, never `APPROVED`, so the required-review branch protection setting was actually being satisfied by admin bypass (`enforce_admins: false`), not by CodeRabbit. Session 015 already disabled CodeRabbit as a workflow gate for this reason, while leaving the GitHub App and its config installed in case it was reinstated later.

This is a solo, AI-assisted project (see `PROJECT.md` — "Contribution Guidelines"). CI provided a clean-environment check (`npm ci` from scratch) and a required status check that did block at least one merge (Session 016, ADR-004's PR) until it finished. CodeRabbit provided occasional review comments but no enforceable gate. Docker was already removed in ADR-004 for the same underlying reason: infrastructure whose cost (maintenance, waiting, config drift) exceeds its value for a one-person, AI-assisted workflow.

---

## Problem

Should GitHub Actions CI and CodeRabbit remain part of the workflow, and if removed, what replaces the quality-gate and code-review function they served?

---

## Options Considered

### Option 1: Remove both CI and CodeRabbit; rely on local quality gates and self-review

**Description:** Delete `.github/workflows/ci.yml`, `.github/workflows/process-coderabbit.yml`, `.coderabbit.yaml`. Update branch protection on `develop`/`master` to drop the required status check and set required approving reviews to 0 (PR still required to merge; no automated check blocks it). `npm run typecheck`/`lint`/`test`/`npx playwright test` are run manually before opening and before merging every PR.

**Pros:**
- Removes the only components with real external dependencies (GitHub Actions minutes, the CodeRabbit GitHub App, an `ANTHROPIC_API_KEY` secret used by `process-coderabbit.yml`)
- No more waiting on CI runs to merge (Session 016 lost a few minutes to exactly this)
- Matches the project's actual review reality — CodeRabbit was never an enforced gate, only a comment source

**Cons:**
- No automated check blocks broken code from reaching `develop`/`master` — depends entirely on remembering to run quality gates locally
- Loses the clean-environment (`npm ci`) verification; only ever tests against local `node_modules` state
- Loses even the non-blocking CodeRabbit comments as a second set of eyes

**Estimated effort:** Low

---

### Option 2: Keep CI, remove only CodeRabbit

**Description:** Delete `.coderabbit.yaml` and `process-coderabbit.yml`; keep `ci.yml` and the required status check.

**Pros:**
- Retains the one component that was an actual enforced gate and a clean-environment check
- Removes CodeRabbit, which per `wiki/lessons-learned.md` wasn't providing its intended function anyway

**Cons:**
- Doesn't address the stated goal — the user explicitly asked to remove CI/CD as well, citing it as unnecessary complexity for this stage
- Still requires waiting on GitHub Actions runs to merge

**Estimated effort:** Low

---

### Option 3: Keep both, unchanged

**Description:** No change.

**Pros:**
- Maximum safety net; no regression in automated checks

**Cons:**
- Directly contradicts the explicit user request to simplify for a solo, AI-assisted workflow
- Keeps paying the cost (CI wait time, an unused review gate, a secret to maintain) documented above for benefit that, per `wiki/lessons-learned.md`, was already partially illusory (CodeRabbit) or occasionally just friction (CI wait)

**Estimated effort:** None

---

## Decision

We chose **Option 1: remove both CI and CodeRabbit**.

Reasoning:
- Directly serves the explicit, stated goal: reduce workflow complexity for a solo, AI-assisted project
- Consistent with ADR-004's reasoning for removing Docker — infrastructure whose maintenance/waiting cost exceeds its value at this project's current scale and team size (one person)
- CodeRabbit was already not functioning as an enforced gate (per `wiki/lessons-learned.md`), so removing it changes little in practice beyond removing the config and the GitHub App's ability to act on PRs
- The remaining safety net (local `typecheck`/`lint`/`test`/E2E, run manually) is the same set of checks CI ran — just no longer automated. `CLAUDE.md`'s Definition of Done and `wiki/development-workflow.md`'s Merge Requirements make running them explicitly mandatory, converting an automated gate into a documented manual discipline rather than dropping the check altogether

---

## Consequences

### Positive
- No GitHub Actions minutes, no CI wait time before merging
- No GitHub App (CodeRabbit) with review/comment permissions on the repo's PRs
- One less secret to maintain (`ANTHROPIC_API_KEY` was only consumed by `process-coderabbit.yml`)
- Branch protection is simpler: PR-required, no force-push, no deletion — no status check or review count to keep in sync with reality

### Negative
- No automated enforcement that quality gates were actually run before a merge — a skipped `npm run test` is no longer caught by anything but discipline
- No clean-environment (`npm ci`) verification — a dependency or environment-specific bug could pass locally and still be broken for a fresh clone
- No second set of eyes (human or AI) on a PR before merge, beyond the person who wrote it

### Neutral / Trade-offs
- If this project later grows beyond solo/AI-assisted (a collaborator joins, or it approaches a real production launch), CI and/or an automated reviewer should be reintroduced — same "revisit if scope changes" framing ADR-004 used for Docker

---

## Alternatives Rejected

- **Keep CI, remove only CodeRabbit** — Rejected: doesn't satisfy the explicit request to remove CI/CD, and the CI-wait-time friction it was meant to address (alongside CodeRabbit) would remain.
- **Keep both, unchanged** — Rejected: contradicts the explicit simplification request; keeps paying for a review gate that `wiki/lessons-learned.md` shows wasn't functioning as intended.

---

## Implementation Notes

- Deleted: `.github/workflows/ci.yml`, `.github/workflows/process-coderabbit.yml`, `.coderabbit.yaml`, and the now-empty `.github/` directory
- GitHub branch protection on `develop` and `master` updated via the GitHub API: `required_status_checks` set to `null`, `required_pull_request_reviews.required_approving_review_count` set to `0` (PR still required to merge — `required_pull_request_reviews` object retained), all other settings (`allow_force_pushes: false`, `allow_deletions: false`, `enforce_admins: false`) unchanged
- The CodeRabbit GitHub App installation was initially left in place, since uninstalling an app is an account-level action not reachable via the API with a personal access token (`gh api repos/.../installation` and `gh api user/installations` both require GitHub-App-issued OAuth tokens, confirmed by testing). The user subsequently uninstalled it manually via GitHub's UI (Settings → Installations) on 2026-07-01 — CodeRabbit is now fully removed from this project: no config, no workflow, no app installation
- `CLAUDE.md`, `PROJECT.md`, and `wiki/development-workflow.md` updated to describe the manual quality-gate discipline that replaces the automated gate

---

## References

- Related: ADR-004 (Remove Docker, Native Local Dev) — same underlying rationale
- `wiki/lessons-learned.md` (2026-07-01 entry) — documents that CodeRabbit's review was never actually `APPROVED`, so it wasn't satisfying the required-review branch protection setting even before this change
- `CLAUDE.md`'s former "CodeRabbit Workflow (Disabled)" section (Session 015) — the interim state this ADR supersedes

---

*This template follows the format recommended by Michael Nygard (https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)*
