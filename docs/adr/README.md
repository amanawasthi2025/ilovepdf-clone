# Architectural Decision Records (ADRs)

This directory contains Architectural Decision Records for this project.

An ADR documents a significant architectural decision: the context, the options considered, the decision made, and the consequences of that decision.

---

## When to Write an ADR

Write an ADR when:

- Choosing a major dependency or technology (database, queue, auth library)
- Making a structural decision that would be costly to reverse
- Choosing between two or more meaningfully different implementation approaches
- Deciding to NOT do something that might seem obvious (and why)

Do NOT write an ADR for:
- Routine implementation choices that are easily changed
- Decisions already documented in `wiki/architecture.md`
- Small code organization decisions (use `wiki/decisions.md` for those)

---

## Index

| # | Title | Status | Date |
|---|---|---|---|
| — | *(No ADRs yet)* | — | — |

---

## ADR Lifecycle

| Status | Meaning |
|---|---|
| `Proposed` | Under consideration; not yet decided |
| `Accepted` | Decision made and in effect |
| `Deprecated` | Was accepted, but superseded |
| `Superseded by ADR-NNN` | A later ADR replaced this decision |

---

## Filename Convention

`NNN-short-kebab-case-title.md`

Examples:
- `001-database-choice.md`
- `002-queue-technology.md`
- `003-file-storage-strategy.md`

---

## Template

See `template.md` in this directory.

---

*Last updated: 2026-06-30 — Session 001 (Project Initialization)*
