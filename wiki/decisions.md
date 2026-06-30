# Wiki: Decision Log

> A lightweight log of significant decisions made during development.
> For architectural decisions that warrant deep documentation, create a full ADR in `docs/adr/`.
> This file captures smaller decisions that don't need a full ADR but are worth remembering.

---

## How to Add an Entry

```
### YYYY-MM-DD — <Decision Title>
**Decision:** What we decided.
**Alternatives considered:** What else we evaluated.
**Reason:** Why we chose this.
**Reversibility:** Easy / Medium / Hard — how hard is this to undo later?
```

---

## Decisions

### 2026-06-30 — PDF Merge as First Application Feature

**Decision:** The first application feature to build is PDF Merge (anonymous, no auth required).

**Alternatives considered:**
- Start with user authentication first (common pattern in SaaS)
- Start with a simpler "PDF viewer" or "PDF info" tool
- Build a homepage/marketing page first

**Reason:** PDF Merge exercises the entire application stack end-to-end: file upload, job queuing, background processing, object storage, and download. It delivers real user value immediately and validates the architecture before we build on it. Authentication can be layered in later without breaking anonymous flows. A homepage alone delivers no user value.

**Reversibility:** N/A — this is a sequencing decision, not a technical one.

---

### 2026-06-30 — Anonymous-First Architecture

**Decision:** The first several features will work without requiring user accounts.

**Alternatives considered:**
- Require auth from the start (protect all tools)
- Auth-optional from day one (build both simultaneously)

**Reason:** Anonymous usage lowers the barrier to entry dramatically — it's the fastest way to validate that the tool is useful. Authentication can be added incrementally without restructuring anonymous flows. Most users don't convert to accounts without first experiencing the product's value.

**Reversibility:** Medium — adding auth later requires adding session tracking, but the core processing pipeline doesn't change.

---

### 2026-06-30 — Monorepo Structure (Turborepo)

**Decision:** Use a Turborepo monorepo with `apps/web`, `apps/worker`, and `packages/shared`.

**Alternatives considered:**
- Single Next.js project with worker code inside (simplest)
- Separate repositories for web and worker

**Reason:** The web app and worker are separate deployment units but share types (job definitions, status enums, error codes). A monorepo keeps them in sync with zero extra effort. Turborepo adds fast caching with minimal config. A single repo is simpler than multiple repos for a solo developer.

**Reversibility:** Medium — moving to separate repos later is possible but requires CI/CD changes.

---

### 2026-06-30 — No Feature Flag System Initially

**Decision:** No feature flag system is introduced at project start.

**Alternatives considered:**
- GrowthBook (open source feature flags)
- LaunchDarkly
- Simple environment variable flags

**Reason:** We are building one feature at a time with explicit approval gates. Feature flags solve a different problem (gradual rollout, A/B testing, kill switches in production). We don't yet have users to roll out to or experiments to run. This decision should be revisited when the product has real users.

**Reversibility:** Easy — feature flags can be introduced at any time without restructuring existing code.

---

*Last updated: 2026-06-30 — Session 001 (Project Initialization)*
