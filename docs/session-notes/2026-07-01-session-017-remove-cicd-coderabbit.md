# Session Note: Session 017 — Remove CI/CD and CodeRabbit

**Date:** 2026-07-01
**Session Goal:** Remove GitHub Actions CI and CodeRabbit entirely (config, workflows, docs, branch protection references), per explicit user request to further simplify the workflow for a solo, AI-assisted project. Builds on Session 016's Docker removal.
**Status:** COMPLETE ✅

---

## What Was Done

### Removed
- `.github/workflows/ci.yml`, `.github/workflows/process-coderabbit.yml`, `.github/` (now empty, removed)
- `.coderabbit.yaml`

### GitHub branch protection updated (develop and master)
Both branches previously required the `Typecheck, Lint & Test` status check and 1 approving PR review to merge. Updated via `gh api -X PUT .../branches/<branch>/protection`:
- `required_status_checks` → `null` (removed; the check will never post again once `ci.yml` is gone)
- `required_pull_request_reviews.required_approving_review_count` → `0` (a PR is still required to merge; nothing needs to approve it)
- Everything else unchanged: `enforce_admins: false`, `allow_force_pushes: false`, `allow_deletions: false`

This had to happen *before* opening the PR that deletes `ci.yml` — otherwise that PR's own required status check would never post (since the workflow producing it no longer exists on the PR branch) and merging would be permanently blocked.

### Documentation
- `docs/adr/005-remove-cicd-coderabbit.md` (new) — full options analysis; also documents a relevant finding surfaced from `wiki/lessons-learned.md`: CodeRabbit's review state was never actually `APPROVED` (only `COMMENTED`), so the required-review branch protection setting was already being satisfied by admin bypass, not CodeRabbit — removing it changes less in practice than it might appear
- `CLAUDE.md` — Definition of Done updated (local quality gates replace the CI/CodeRabbit line items); "CodeRabbit Workflow (Disabled)" section replaced with "CI/CD & Code Review (Removed)", pointing at ADR-005
- `PROJECT.md` — tech stack table, Quality Standards, Definition of Done, Development Workflow, and Contribution Guidelines sections all updated to drop CI/CodeRabbit and describe local-only quality gates
- `wiki/development-workflow.md` — dropped CodeRabbit from the One-Feature Cycle and PR workflow; removed the "Responding to CodeRabbit" subsection entirely; replaced the "CI Pipeline (GitHub Actions)" section with a "Local Quality Gates" section listing the exact commands to run by hand
- `wiki/testing-strategy.md` — "CI Test Execution" section replaced with "Local Test Execution", same checks, run manually
- `wiki/lessons-learned.md` — updated the "How to Add an Entry" instruction line (referenced "completing a CodeRabbit review", no longer applicable)
- `CHANGELOG.md` — `[0.2.2]` entry added

### What was deliberately left unchanged
- The CodeRabbit GitHub App installation itself — per user direction, only repo-level config/workflow removed; fully uninstalling the app is a separate account-level action left to the user via GitHub's UI
- Historical session notes, the existing 2026-07-01 CodeRabbit entry in `wiki/lessons-learned.md`, and past ADRs — journal entries describing what was true at the time, not rewritten
- `TASKS.md` — infra/chore change, not a tracked feature; nothing to move

---

## Design Decisions

### PR workflow kept, gates dropped (not "drop PRs entirely")
Asked the user directly: still use `feature/<name>` branches and PRs into `develop` for every change (audit trail, meaningful diffs), just without an automated status check or required review. Branch protection reflects this — `required_pull_request_reviews` is still present (PR required to merge), just with 0 required approvals.

### Branch protection changed before the PR was opened, not after
If the CI-removal PR itself were opened while `develop`'s branch protection still required the `Typecheck, Lint & Test` check, the PR would be permanently unmergeable: `ci.yml` doesn't exist on the PR's head branch (it's being deleted in this very PR), so the workflow never triggers and the required check never posts. Branch protection was updated first, as an explicit separate step, to avoid that trap.

---

## Issues Encountered

None.

---

## Next Steps

- Commit on `chore/remove-cicd-coderabbit`, push, open PR → `develop`, run local quality gates, merge directly (per the new workflow this session just established)
- No next feature has been started — `TASKS.md`'s Current Feature remains empty, awaiting explicit approval per the One-Feature-at-a-Time rule

---

*Session note written by: Claude Code (claude-sonnet-5)*
