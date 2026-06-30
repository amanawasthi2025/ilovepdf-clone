# Wiki: Development Workflow

> Describes how we move from "feature idea" to "merged and documented."
> Designed for a solo developer working with Claude Code and CodeRabbit.

---

## The One-Feature Cycle

Every feature follows this exact cycle. No shortcuts.

```
1. PLAN       → Read docs, understand the feature, propose implementation plan
2. APPROVE    → Human approves the plan
3. IMPLEMENT  → Build the feature as a complete vertical slice
4. TEST       → Write and run all tests
5. DOCUMENT   → Update TASKS.md, CHANGELOG.md, wiki/, session-notes/
6. REVIEW     → Open PR, CodeRabbit reviews, address findings
7. MERGE      → Merge to develop
8. APPROVE    → Human approves; next feature is assigned
```

There is no overlap between steps. "Implement" does not begin until "Approve" is complete. "Review" does not begin until "Document" is complete.

---

## Branch Strategy

```
main        ← production-ready, tagged at releases
  └── develop     ← integration; always passing tests
        └── feature/<name>  ← one branch per feature
        └── fix/<name>      ← hotfix branches
```

- **`main`** is protected. Only merged from `develop` via PR.
- **`develop`** is the integration branch. All features merge here first.
- **`feature/<name>`** branches are created from `develop` and merged back to `develop`.
- **`fix/<name>`** branches are for bug fixes discovered after feature completion.

Branch names use `kebab-case`. Examples:
- `feature/pdf-merge`
- `feature/user-auth`
- `fix/merge-output-corruption`

---

## Commit Strategy

Every commit on a feature branch represents a logical, working unit.

**Format:**
```
<type>(<scope>): <short description (imperative, < 72 chars)>

<body: why this change was made, context that isn't obvious from the diff>
```

**Types:**
| Type | When to use |
|---|---|
| `feat` | New user-visible functionality |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `test` | Adding or fixing tests |
| `refactor` | Code restructuring without behavior change |
| `chore` | Build system, dependency updates, config |
| `style` | Formatting, whitespace (no logic change) |

**Examples:**
```
feat(merge): add PDF merge API endpoint

Accepts multipart/form-data with multiple PDF files, enqueues a BullMQ
job, and returns a job ID for status polling. File size limit: 50MB per
file, 500MB total.
```

```
fix(worker): handle corrupted PDF input gracefully

pdf-lib throws on malformed input. Catch the error, mark the job as
failed with reason 'invalid_input', and log the error with job context.
```

- **Commits should be small and focused.** One logical change per commit.
- **Never commit broken code** (failing tests, lint errors, TypeScript errors).
- **Never commit commented-out code.**
- **Never commit `.env` files or secrets.**

---

## Pull Request Workflow

Every feature becomes a PR from `feature/<name>` → `develop`.

### Opening a PR

1. Push the feature branch to GitHub.
2. Open PR with a meaningful title and description:
   - What the feature does
   - How to test it manually
   - Any known limitations or follow-up work
3. CodeRabbit will automatically review the PR.

### Responding to CodeRabbit

For each finding CodeRabbit raises:

- **Accept and fix:** Make the change in a follow-up commit, reply to the comment.
- **Reject:** Reply with a clear explanation of why the finding doesn't apply or was intentionally chosen differently. Document significant rejections in `wiki/lessons-learned.md`.

### Merge Requirements

- [ ] All CI checks passing (lint, typecheck, tests, build)
- [ ] CodeRabbit review addressed (all accepted findings fixed)
- [ ] Documentation updated in the same PR
- [ ] At least one manual test run documented in the PR description

### After Merge

- Delete the feature branch.
- Update `TASKS.md` — move feature to Completed.
- Update `CHANGELOG.md`.
- Tag a release if shipping to production.

---

## Release Tagging

We use Semantic Versioning: `MAJOR.MINOR.PATCH`

- **PATCH** (`0.0.x`) — bug fixes, documentation, minor UI polish
- **MINOR** (`0.x.0`) — new user-visible feature added
- **MAJOR** (`x.0.0`) — breaking change to API or major architectural shift (rare at this stage)

While the product is pre-1.0, we use `0.x.y` and all releases are considered unstable.

Tag format: `v0.1.0`

```bash
git tag -a v0.1.0 -m "feat: PDF merge tool"
git push origin v0.1.0
```

---

## CI Pipeline (GitHub Actions)

Every push to any branch triggers:

```
1. Install dependencies
2. TypeScript typecheck (tsc --noEmit)
3. Lint (ESLint)
4. Unit + integration tests (Vitest)
5. Build (next build)
```

Every PR to `develop` or `main` additionally runs:

```
6. E2E tests (Playwright, against a Docker Compose environment)
```

The pipeline must be green before merge. No exceptions.

---

## Local Development Setup

See `README.md` in the root of the repository for the quick-start guide.

The minimum requirement to run the application locally is Docker and Docker Compose. Everything — database, Redis, storage — runs in containers.

```bash
cp .env.example .env.local   # fill in any required values
docker compose up -d          # start infrastructure
npm run dev                   # start Next.js dev server
npm run worker:dev            # start worker in dev mode (separate terminal)
```

---

## Definition of "Releasable"

The repository must be in a releasable state after every feature merge. This means:

- `main` is always deployable
- No broken tests on `main`
- No outstanding security issues
- Documentation reflects the current state of the software

If `main` is ever broken, fixing it is the highest priority — above any new feature work.

---

## Claude Code Session Workflow

At the start of every Claude Code session:

1. Read `CLAUDE.md` first.
2. Read the required document sequence (listed in `CLAUDE.md`).
3. State your understanding of the current feature.
4. Identify risks, ambiguities, and dependencies.
5. Propose an implementation plan.
6. Wait for approval.
7. Implement.
8. Stop after each milestone and report.

At the end of every Claude Code session:

1. Update documentation.
2. Summarize what was completed.
3. List any open questions or blocked items.
4. Append a session note to `docs/session-notes/`.
5. Stop.

---

*Last updated: 2026-06-30 — Session 001 (Project Initialization)*
