# Wiki: Development Workflow

> Describes how we move from "feature idea" to "merged and documented."
> Designed for a solo developer working with Claude Code. No CI, no automated review — see ADR-005.

---

## The One-Feature Cycle

Every feature follows this exact cycle. No shortcuts.

```
1. PLAN       → Read docs, understand the feature, propose implementation plan
2. APPROVE    → Human approves the plan
3. IMPLEMENT  → Build the feature as a complete vertical slice
4. TEST       → Write and run all tests
5. DOCUMENT   → Update TASKS.md, CHANGELOG.md, wiki/, session-notes/
6. REVIEW     → Open PR, run local quality gates, self-review against acceptance criteria
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
3. Self-review the diff against the feature's acceptance criteria before merging — there is no automated reviewer.

### Merge Requirements

- [ ] All local quality gates passing on the PR branch (`npm run typecheck`, `npm run lint`, `npm run test`) — no CI runs these automatically
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

## Local Quality Gates

There is no CI (see ADR-005). The same checks CI used to run are run by hand, before opening a PR and again before merging it:

```bash
npm run typecheck   # tsc --noEmit, all workspaces
npm run lint         # ESLint, all workspaces
npm run test         # Vitest, all workspaces
npx playwright test  # E2E, against a locally running stack (apps/web)
```

All four must be green before merge. No exceptions — this is the only thing standing between broken code and `develop` now that there's no automated gate.

---

## Local Development Setup

No Docker required — see ADR-004. PostgreSQL, Redis, and MinIO run as native local services; `apps/web` and `apps/worker` run directly on the host via `npm run dev`.

**One-time setup:**
```bash
# PostgreSQL and Redis (Debian/Ubuntu)
sudo apt-get install -y postgresql redis-server
sudo systemctl enable --now postgresql redis-server

# Create the app role/database (matches .env.example)
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
sudo -u postgres createdb ilovepdf

# MinIO standalone binary
curl -fsSL https://dl.min.io/server/minio/release/linux-amd64/minio -o ~/.local/bin/minio
chmod +x ~/.local/bin/minio
```

**Every session:**
```bash
cp .env.example .env          # fill in any required values (defaults work as-is)
MINIO_ROOT_USER=minioadmin MINIO_ROOT_PASSWORD=minioadmin \
  minio server ~/minio-data --console-address ":9001" &   # start object storage
npx prisma migrate dev        # apply schema (first run / after schema changes)
npm run dev                   # starts both web and worker via Turborepo
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

*Last updated: 2026-07-01 — Session 017 (CI/CD and CodeRabbit removed, native local dev only)*
