# Session Note: Session 016 — Remove Docker, Native Local Dev

**Date:** 2026-07-01
**Session Goal:** Remove Docker entirely from the project (config, docs, scripts, workflow references) and migrate local development infrastructure — PostgreSQL, Redis, MinIO — to native local services, per explicit user request to reduce solo-dev complexity.
**Status:** COMPLETE ✅

---

## What Was Done

### Removed
- `docker-compose.yml`
- `docker/Dockerfile.web`, `docker/Dockerfile.worker`, `docker/`
- `.dockerignore`
- Stale Docker-related entries in `.claude/settings.local.json` (`docker --version`, `docker compose *`, `sg docker *`, `sudo docker version`, `sudo -n docker compose ps`, `newgrp docker *`)

### Native local services installed
- PostgreSQL and Redis via `apt` (`postgresql`, `redis-server`), started via `systemctl`
- `ilovepdf` database and `postgres` role/password created to match the existing `DATABASE_URL` in `.env.example` — no `.env` value changes needed, since it already used `localhost`
- MinIO standalone server binary downloaded to `~/.local/bin/minio` (no sudo required), run against `~/minio-data` with the existing `minioadmin`/`minioadmin` credentials from `.env.example`

No application code changed. `apps/web/lib/storage.ts`, `apps/web/lib/env.ts`, `apps/worker/src/lib/storage.ts`, `apps/worker/src/lib/env.ts` are untouched — the S3-compatible client still talks to MinIO over the same env vars, just a native process instead of a container.

### Documentation
- `docs/adr/004-remove-docker-native-local-dev.md` (new) — full options analysis and decision record
- `PROJECT.md` — tech stack table: "Docker + Docker Compose" row replaced with native local services
- `wiki/architecture.md` — Local Development diagram updated to native services; Production (Target) section changed from an assumed containerized deployment to explicitly TBD (no production deployment exists yet, so nothing was invented to replace it); Repository Structure diagram no longer lists `docker/`/`docker-compose*`; Infrastructure/Tooling section's Docker subsection replaced
- `wiki/development-workflow.md` — Local Development Setup rewritten with native install/run steps; the CI Pipeline section's aspirational "E2E via Docker Compose" line corrected (E2E tests are run manually, not in CI — matches what `.github/workflows/ci.yml` actually does)
- `wiki/testing-strategy.md` — Docker Compose references in the Integration Tests section and `Running Tests` command block replaced with native-service wording
- `CHANGELOG.md` — `[0.2.1]` entry added
- This session note

### What was deliberately left unchanged
- `docs/session-notes/2026-06-30-session-*` and the Docker-related entry in `wiki/lessons-learned.md` (the `.dockerignore`/Prisma-musl lesson) — these are historical journal entries describing what happened at the time; rewriting them would falsify the record. ADR-004 cross-references the lesson instead.
- `TASKS.md` — this is an infra/chore change, not a `TASKS.md`-tracked feature; there is no feature entry to move.
- CI (`.github/workflows/ci.yml`) — never depended on Docker; no change needed.

---

## Design Decisions

### MinIO stays, just not containerized
The user's request named PostgreSQL and Redis explicitly but not object storage. Asked directly: chose to keep MinIO as a native standalone binary rather than switching to a filesystem adapter or real AWS S3 for dev. This keeps the S3-compatible storage abstraction and dev/prod parity that `wiki/architecture.md` already committed to, with zero application code changes. Full reasoning in ADR-004.

### Production deployment architecture marked TBD, not replaced
`wiki/architecture.md`'s "Production (Target)" section previously assumed containerized deployment. Since no production deployment exists yet, inventing a new target architecture here would be speculative infrastructure work outside the scope of "remove Docker from local dev." The section now says the deployment mechanism is undecided, to be revisited when production deployment is actually undertaken.

---

## Issues Encountered

None. Sudo required an interactive password that couldn't be supplied non-interactively from the Bash tool, so the `apt-get install postgresql redis-server` step was run by the user directly (via the `!` interactive-command prefix) rather than by Claude Code.

---

## Next Steps

- Commit on `chore/remove-docker`, open PR → `develop` (CodeRabbit gate disabled per standing instruction)
- Merge once quality gates pass
- No next feature has been started — `TASKS.md`'s Current Feature remains empty, awaiting explicit approval per the One-Feature-at-a-Time rule

---

*Session note written by: Claude Code (claude-sonnet-5)*
