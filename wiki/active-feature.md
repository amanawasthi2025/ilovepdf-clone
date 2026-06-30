# Wiki: Active Feature

> This document describes the feature currently in development.
> Update it at the start of every feature and mark it complete when done.

---

## Current Feature: Project Initialization

**Status:** COMPLETE ✅
**Started:** 2026-06-30
**Branch:** `feature/project-initialization`

### What This Feature Is

This is not an application feature — it is the engineering foundation for the entire project. We are establishing:

- The complete documentation structure
- Technology stack decisions and their justifications
- Development process and workflow definition
- Repository organization

No application code is written in this phase.

### Acceptance Criteria

- [x] `CLAUDE.md` — Claude Code operating manual
- [x] `PROJECT.md` — Product and engineering handbook
- [x] `TASKS.md` — Feature tracker with backlog
- [x] `CHANGELOG.md` — Release history structure
- [x] `wiki/project.md` — Project overview
- [x] `wiki/architecture.md` — Architecture and technology stack decisions
- [x] `wiki/coding-standards.md` — Coding conventions
- [x] `wiki/development-workflow.md` — Git and PR workflow
- [x] `wiki/testing-strategy.md` — Testing approach and tooling
- [x] `wiki/active-feature.md` — This file
- [x] `wiki/completed-features.md` — Completed feature log
- [x] `wiki/roadmap.md` — Product roadmap
- [x] `wiki/lessons-learned.md` — Engineering lessons
- [x] `wiki/decisions.md` — Decision log
- [x] `docs/adr/template.md` — ADR template
- [x] `docs/adr/README.md` — ADR index
- [x] `docs/session-notes/2026-06-30-project-initialization.md` — First session note
- [x] Human approval received

### Notes

This phase was completed in Session 001. The first application feature (PDF Merge) is recommended as the next step.

---

## Next Planned Feature

**PDF Merge** — Allow users to upload multiple PDF files and download them combined into one.

Rationale:
- Highest-demand PDF tool
- Exercises the full processing pipeline (upload → queue → worker → storage → download)
- No authentication required (anonymous users can use it)
- Validates the entire architecture before building on it
- Delivers immediate, concrete user value

---

*Last updated: 2026-06-30 — Session 001 (Project Initialization)*
