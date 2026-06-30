# Wiki: Product Roadmap

> This is a living document. It reflects current thinking, not firm commitments.
> Priorities shift as we learn from users and development experience.
> Update this document when priorities change or new items are added.

---

## Phase 0 — Foundation (Current)

**Goal:** Establish engineering infrastructure, documentation, and development process.

| Item | Status |
|---|---|
| Project documentation | ✅ Complete |
| Technology stack decisions | ✅ Complete |
| Repository structure | ✅ Complete |
| Development workflow | ✅ Complete |

---

## Phase 1 — Core PDF Tools (Anonymous Use)

**Goal:** Deliver the three highest-demand PDF tools without requiring user accounts.

Each tool exercises the full pipeline and validates the architecture.

| # | Feature | Status | Notes |
|---|---|---|---|
| 1 | **PDF Merge** | Planned | First application feature; highest demand |
| 2 | **PDF Split** | Planned | Complements merge |
| 3 | **PDF Compress** | Planned | Very high demand; requires quality tradeoff decisions |

**Exit criteria for Phase 1:** All three tools are working, tested, and deployable. Users can complete these tasks without creating an account.

---

## Phase 2 — User Accounts

**Goal:** Allow users to create accounts, enabling personalization and history.

| # | Feature | Status | Notes |
|---|---|---|---|
| 4 | **User Authentication** | Planned | Email + OAuth (Google). Requires Auth.js setup |
| 5 | **Job History** | Planned | Users can re-download recent outputs |
| 6 | **Account Settings** | Planned | Manage profile, notification preferences |

**Exit criteria for Phase 2:** Users can register, log in, and view their past jobs.

---

## Phase 3 — Extended PDF Tools

**Goal:** Cover the full range of common PDF operations.

| # | Feature | Status | Notes |
|---|---|---|---|
| 7 | **PDF to Image** | Planned | Export pages as PNG/JPG using Sharp |
| 8 | **Image to PDF** | Planned | Combine images into a PDF |
| 9 | **PDF Rotate** | Planned | Rotate individual or all pages |
| 10 | **PDF Watermark** | Planned | Add text or image watermark |
| 11 | **PDF Page Numbers** | Planned | Add page numbers to existing PDF |
| 12 | **PDF Unlock** | Planned | Remove password protection |
| 13 | **PDF Protect** | Planned | Add password protection |

---

## Phase 4 — Office Document Conversion

**Goal:** Support conversion between PDF and Microsoft Office formats.

| # | Feature | Status | Notes |
|---|---|---|---|
| 14 | **Word to PDF** | Planned | Requires LibreOffice headless in worker |
| 15 | **PDF to Word** | Planned | Complex; quality varies with PDF structure |
| 16 | **Excel to PDF** | Planned | Requires LibreOffice |
| 17 | **PowerPoint to PDF** | Planned | Requires LibreOffice |

**Note:** Phase 4 introduces LibreOffice as a worker dependency, which significantly increases container size and operational complexity. A dedicated ADR should be written before starting this phase.

---

## Phase 5 — Monetization

**Goal:** Introduce a sustainable business model.

| # | Feature | Status | Notes |
|---|---|---|---|
| 18 | **Free Tier Limits** | Planned | Rate limiting per anonymous session and per account |
| 19 | **Pro Subscription** | Planned | Stripe integration; removes limits, adds features |
| 20 | **Usage Dashboard** | Planned | Users see their usage against limits |

---

## Phase 6 — Developer Platform

**Goal:** Allow developers to integrate document processing into their own applications.

| # | Feature | Status | Notes |
|---|---|---|---|
| 21 | **REST API** | Planned | Authenticated API for all tools |
| 22 | **API Keys** | Planned | Management UI for API credentials |
| 23 | **Webhooks** | Planned | Notify external systems when jobs complete |
| 24 | **SDKs** | Planned | TypeScript/Python client libraries |

---

## Deferred / Unlikely

These items have been considered but are not currently planned:

| Item | Reason Deferred |
|---|---|
| Mobile native app | Significant additional scope; web is sufficient initially |
| Real-time collaboration | Not core to the product category |
| OCR (text recognition) | Complex; requires Tesseract or cloud OCR service |
| Legal e-signature | Significant compliance/legal complexity |
| Enterprise SSO | Out of scope until there are enterprise customers |
| Self-hosted / on-premise | Not a current target market |

---

*Last updated: 2026-06-30 — Session 001 (Project Initialization)*
