# CLAUDE.md — Operating Manual for Claude Code

This file is the permanent operating manual for every Claude Code session on this project.
**Read this file first. Read it completely. Do not skip sections.**

---

## Project Summary

We are building a production-grade document-processing SaaS (inspired by tools like iLovePDF) using an original architecture, original UI, and original code. The product allows users to upload, process, and download documents — initially PDFs — through a browser-based interface.

This is not a prototype. Every feature must be production-quality, maintainable, and deployable.

---

## Required Reading Order (Start of Every Session)

Before writing a single line of code, read these files in order:

1. `CLAUDE.md` ← you are here
2. `PROJECT.md` — product vision, goals, engineering philosophy
3. `TASKS.md` — current feature, acceptance criteria, backlog
4. `wiki/active-feature.md` — detailed spec for the current feature
5. `wiki/architecture.md` — current architecture decisions
6. `wiki/coding-standards.md` — coding conventions
7. `docs/adr/` — architectural decision records
8. `CHANGELOG.md` — what has been completed
9. `docs/session-notes/` — engineering journal (read the most recent note)

After reading, **summarize your understanding** of the current state before doing anything.

---

## One-Feature-at-a-Time Rule

**This is the most important rule in this project.**

- There is exactly ONE current feature at any time (defined in `TASKS.md`).
- Never begin a second feature while one is in progress.
- Never scaffold future features.
- Never add infrastructure that isn't required by the current feature.
- Never generate placeholder or stub implementations.
- When a feature is complete: stop, update docs, and wait for explicit approval.

Violating this rule destroys the engineering discipline this project depends on.

---

## Definition of Done

A feature is **Done** only when ALL of the following are true:

- [ ] All acceptance criteria in `TASKS.md` are met
- [ ] Unit tests written and passing
- [ ] Integration tests written and passing (where applicable)
- [ ] Manual testing completed against acceptance criteria
- [ ] No TypeScript errors (`tsc --noEmit`)
- [ ] No lint errors (`eslint` / `ruff` as applicable)
- [ ] All tests pass (`npm test` / `pytest`)
- [ ] `TASKS.md` updated (feature moved to Completed)
- [ ] `CHANGELOG.md` updated
- [ ] `wiki/active-feature.md` updated to reflect completion
- [ ] `wiki/completed-features.md` updated
- [ ] Session note appended to `docs/session-notes/`
- [ ] Any new ADRs created in `docs/adr/`
- [ ] Git commit with a meaningful message on a feature branch
- [ ] PR opened from `feature/<name>` → `develop` (mandatory — not optional)
- [ ] Local quality gates re-run and green on the PR branch (`npm run typecheck`, `npm run lint`, `npm run test`) — there is no CI to run them automatically, see `## CI/CD & Code Review (Removed)` below
- [ ] PR merged into `develop` directly once the above passes — no automated review tool gate

---

## Required Workflow Before Coding

1. Read all required files (see above).
2. State your understanding of the current feature.
3. Identify risks or ambiguities.
4. Propose an implementation plan.
5. Wait for explicit approval before writing code.
6. If anything is unclear: **ask, don't assume.**

---

## Stop-After-Each-Milestone Rule

After completing any agreed milestone:

- STOP.
- Update documentation.
- Report what was completed.
- Wait for explicit approval before continuing.

Do not chain milestones without approval. Do not "finish just one more thing."

---

## YAGNI Reminder

> "You Aren't Gonna Need It."

- Do not add features that aren't requested.
- Do not design for hypothetical future requirements.
- Do not add abstraction layers unless two or more concrete uses exist.
- Three similar lines is better than a premature abstraction.
- Build exactly what the current feature requires. Nothing more.

---

## Explain Trade-offs Rule

Before recommending an approach:

- Name at least two alternatives.
- Explain the trade-offs of each.
- Make a recommendation with reasoning.
- Wait for a decision if the trade-offs are significant.

---

## Ask-Before-Assuming Rule

If a requirement is ambiguous:

- State the ambiguity explicitly.
- Offer two or three interpretations.
- Ask which is correct.
- Do not assume and implement.

---

## Documentation Update Requirements

Every completed feature must update:

- `TASKS.md` — move feature to Completed, set next Current Feature
- `CHANGELOG.md` — add entry under correct version
- `wiki/active-feature.md` — mark complete, describe what was built
- `wiki/completed-features.md` — append feature summary
- `docs/session-notes/` — add session note
- Any new ADR in `docs/adr/` if architectural decisions were made

---

## Testing Expectations

- Every function with non-trivial logic must have a unit test.
- Every API endpoint must have an integration test.
- Every user-facing flow must have an E2E test.
- Tests live alongside the code they test (co-located).
- See `wiki/testing-strategy.md` for full strategy.

---

## Git Workflow

- `main` — production-ready, protected
- `develop` — integration branch
- `feature/<name>` — one branch per feature
- `fix/<name>` — hotfix branches

Commit message format:
```
<type>(<scope>): <short description>

<body — why, not what>
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`

Never force-push to `main` or `develop`.
Never skip pre-commit hooks.

---

## CI/CD & Code Review (Removed)

**Status: removed as of 2026-07-01, by explicit user instruction — see ADR-005.** GitHub Actions CI and CodeRabbit are no longer part of this project. There is no workflow file, no automated status check, and no automated review tool. Concretely:

- Do not reference, invoke, or wait for CI or CodeRabbit — the config/workflow files that ran them have been deleted, and GitHub branch protection no longer requires either.
- Quality gates (`npm run typecheck`, `npm run lint`, `npm run test`) are run **locally**, by you, before opening a PR and again before merging it. This is now a manual discipline, not an automated gate — treat it as non-negotiable precisely because nothing else enforces it.
- The PR-opening requirement still stands (see Definition of Done): open the PR from `feature/<name>` → `develop` right after the final feature commit. Branch protection still requires a PR to merge (no direct pushes), it just no longer requires a status check or an approving review.
- Merge `feature/<name>` into `develop` directly once local quality gates are green — no review-tool gate, no status check to wait for.
- Still document any new lessons learned in `wiki/lessons-learned.md` after merging.

---

## Architecture Decision Workflow

When making a significant architectural decision:

1. Create a new ADR in `docs/adr/` using the template.
2. Document: Context, Problem, Options Considered, Decision, Consequences, Alternatives Rejected.
3. Reference the ADR number in the code where the decision manifests.

ADR filenames: `docs/adr/NNN-short-title.md` (e.g., `001-database-choice.md`)

---

## Coding Standards Summary

See `wiki/coding-standards.md` for the full guide. Key rules:

- TypeScript strict mode everywhere.
- No `any` types without an explicit comment explaining why.
- Prefer explicit over implicit.
- Functions should do one thing.
- Name things clearly; avoid abbreviations.
- No commented-out code in commits.
- No `console.log` in production code (use the logger).
- Errors must be handled explicitly.
- All environment configuration via environment variables (12-Factor).

---

## Feature Gating

All new user-facing features must be behind a feature flag if they are experimental or incomplete. Currently: **no feature flag system is in place** — this note will be updated when one is introduced.

---

## Security Defaults

- Validate all user input at system boundaries.
- Never trust client-supplied data.
- Sanitize filenames before storage.
- Use parameterized queries — never string-interpolated SQL.
- Content-Type validation on all file uploads.
- File size limits enforced at the API layer.
- CORS configured explicitly — never use wildcard in production.
- Environment secrets never committed to the repository.

---

## Asking for Help

If you are uncertain about any decision:
- State the uncertainty clearly.
- Offer options.
- Ask the user.
- Do not guess and implement.

---

*Last updated: 2026-07-01 — Session 017 (CI/CD and CodeRabbit removed, native local dev only)*
