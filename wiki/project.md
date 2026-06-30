# Wiki: Project Overview

> A concise summary of what this project is, who it serves, and what success looks like.
> This is the "elevator pitch" for any new collaborator (human or AI) joining the project.

---

## What We Are Building

A document-processing SaaS platform. Users visit the site, upload one or more files, choose an operation (merge, split, compress, convert, etc.), and download the result. No installation required. No account required for basic usage.

The product is in the same category as iLovePDF and Smallpdf. This implementation is 100% original: original code, original UI, original architecture.

---

## Who Uses This

**Primary users:**
- Knowledge workers who occasionally need to process PDFs (merge expense receipts, compress scanned contracts, split a large report)
- Students who need to combine or convert documents
- Small business owners without access to enterprise document tools

**Secondary users (future):**
- Developers who need a document processing API
- Teams who want job history and shared workflows

---

## Core Value Proposition

- **Speed:** Common tasks complete in under 60 seconds
- **Simplicity:** No account required to use basic tools
- **Quality:** Output files are high-quality, not degraded by processing
- **Privacy:** Files are processed and then deleted — not stored permanently
- **Reliability:** The tool works every time, on every browser

---

## Business Model (Target)

- **Free tier:** Limited number of operations per day, smaller file size limits
- **Pro subscription:** Unlimited operations, larger files, job history, batch processing
- **API access:** Developer tier with usage-based pricing

The free tier is generous enough to be genuinely useful, which drives word-of-mouth growth and eventual conversion.

---

## Success Metrics (MVP)

- A user can complete a PDF merge end-to-end without creating an account
- Processing time for a 10-page PDF merge < 5 seconds
- The output file opens correctly in standard PDF viewers
- The application handles errors gracefully (user sees a helpful message, not a crash)
- The system runs reliably in a Docker Compose environment

---

## Current Status

Phase: **Repository initialization and documentation** (no application code yet)

The first application feature to be built is **PDF Merge** — see `TASKS.md` and `wiki/active-feature.md`.

---

## Team

Solo developer + Claude Code (AI engineering assistant).

All decisions are made by the human developer. Claude Code assists with implementation, documentation, and code review preparation.

---

*Last updated: 2026-06-30 — Session 001 (Project Initialization)*
