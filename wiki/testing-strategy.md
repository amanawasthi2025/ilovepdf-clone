# Wiki: Testing Strategy

> Testing is not an afterthought. Tests are written as part of feature development, not after.
> This document defines expectations, tooling, and conventions for all tests in this project.

---

## Testing Philosophy

- **Test behavior, not implementation.** Tests should verify what the code does, not how it does it.
- **Tests are documentation.** A test suite describes the expected behavior of the system.
- **Tests enable refactoring.** A well-tested codebase can be safely restructured.
- **Coverage is a floor, not a target.** 100% coverage with poor tests is worse than 70% with meaningful tests. Test what matters.
- **No mocking of code you own.** Test the real behavior of your own modules. Only mock at external system boundaries.

---

## Test Types

### Unit Tests

**Purpose:** Verify individual functions and modules in isolation.

**Tool:** Vitest

**What to test:**
- All pure business logic functions
- Data transformation utilities
- Validation logic (Zod schemas)
- Error handling paths
- Edge cases (empty inputs, boundary values, malformed data)

**What NOT to test:**
- Framework internals (Next.js routing, Prisma internals)
- Trivial getters/setters with no logic
- Code that is entirely covered by integration tests

**Location:** Co-located with source files: `foo.ts` → `foo.test.ts`

**Example:**
```typescript
// merge-service.test.ts
import { describe, it, expect } from 'vitest';
import { validateMergeInput } from './merge-service';

describe('validateMergeInput', () => {
  it('returns error when fewer than 2 files provided', () => {
    const result = validateMergeInput({ files: [mockFile()] });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('INSUFFICIENT_FILES');
  });

  it('returns error when total size exceeds limit', () => {
    const result = validateMergeInput({ files: [largeFile(), largeFile()] });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('TOTAL_SIZE_EXCEEDED');
  });

  it('succeeds with 2 valid files within size limits', () => {
    const result = validateMergeInput({ files: [mockFile(), mockFile()] });
    expect(result.success).toBe(true);
  });
});
```

---

### Integration Tests

**Purpose:** Verify that components work correctly together — particularly API endpoints interacting with a real database, real Redis, and real S3-compatible storage.

**Tool:** Vitest (with real infrastructure running natively — see ADR-004)

**What to test:**
- Every API route handler (happy path + error paths)
- Database queries (with real PostgreSQL)
- Queue operations (enqueue → worker processes → status updated)
- File upload and storage round-trips

**Infrastructure:** Integration tests run against a dedicated local test instance of all services (native PostgreSQL, Redis, and MinIO, selected via environment variables pointing at test-specific databases/buckets). Never run integration tests against production data.

**Location:** `<route-or-service>.integration.test.ts` co-located with the source.

**Example:**
```typescript
// route.integration.test.ts
describe('POST /api/v1/jobs/merge', () => {
  it('creates a job and returns a job ID', async () => {
    const response = await request(app)
      .post('/api/v1/jobs/merge')
      .attach('files', mockPdfBuffer(), 'file1.pdf')
      .attach('files', mockPdfBuffer(), 'file2.pdf');

    expect(response.status).toBe(201);
    expect(response.body.jobId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns 413 when file exceeds size limit', async () => {
    const response = await request(app)
      .post('/api/v1/jobs/merge')
      .attach('files', oversizedBuffer(), 'big.pdf');

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('FILE_TOO_LARGE');
  });
});
```

---

### End-to-End Tests

**Purpose:** Verify complete user flows from browser interaction to downloadable output.

**Tool:** Playwright

**What to test:**
- Every primary user flow (the "happy path")
- Critical error states visible to the user (file too large, invalid file type)
- Download flow (file is actually downloadable and correct)

**What NOT to test:**
- Every possible input combination (that's for unit tests)
- Internal state that users can't observe

**Location:** `tests/e2e/<feature-name>.spec.ts`

**Example:**
```typescript
// tests/e2e/merge.spec.ts
test('user can merge two PDFs and download the result', async ({ page }) => {
  await page.goto('/merge');

  await page.setInputFiles('[data-testid="file-input"]', [
    'tests/fixtures/sample1.pdf',
    'tests/fixtures/sample2.pdf',
  ]);

  await page.click('[data-testid="merge-button"]');

  await expect(page.locator('[data-testid="status"]')).toHaveText('Processing...');
  await expect(page.locator('[data-testid="status"]')).toHaveText('Done!', { timeout: 15000 });

  const download = await page.waitForEvent('download');
  await download.saveAs('/tmp/merged.pdf');
  expect(fs.existsSync('/tmp/merged.pdf')).toBe(true);
});
```

---

### Manual Testing

**Purpose:** Human judgment on UX, visual correctness, and acceptance criteria that are hard to automate.

**When:** Before marking any feature Done.

**Checklist (for every feature):**
- [ ] Happy path works end-to-end in a real browser
- [ ] Error states display correctly (try invalid file, oversized file, wrong type)
- [ ] The UI is responsive (mobile and desktop)
- [ ] Loading states are shown during async operations
- [ ] Downloaded file opens correctly in a PDF viewer / target application
- [ ] No browser console errors

**Document manual test results** in the PR description or session note.

---

### Regression Testing

**Purpose:** Ensure that new features don't break existing ones.

**Strategy:**
- The full E2E suite runs on every PR to `develop` and `main`.
- Any bug found in production must get a regression test added before the fix is merged.
- Regression tests are tagged: `// regression: <description of original bug>`

---

## Test Data and Fixtures

- Test PDF files live in `tests/fixtures/`.
- Use the smallest valid PDF for most tests. Include a larger fixture for size-limit tests.
- Never use real user data in tests.
- Fixtures are committed to the repository (they're small binary files).

---

## Running Tests

```bash
# Unit tests (fast — no infrastructure required)
npm run test:unit

# Integration tests (requires local Postgres/Redis/MinIO running)
npm run test:integration

# E2E tests (requires full app running)
npm run test:e2e

# All tests
npm test

# Watch mode (unit tests only)
npm run test:unit -- --watch
```

---

## Local Test Execution

There is no CI (see ADR-005) — all of the below are run manually, by hand, before opening a PR and again before merging it:

- **Before every PR:** Unit + integration tests, TypeScript typecheck, lint
- **Before every PR to `master`:** All of the above + E2E tests

---

## Test Quality Standards

A test is good if:
1. It fails when the behavior it tests is broken.
2. It passes when the behavior is correct.
3. It describes the expected behavior clearly in its name.
4. It doesn't test implementation details that could change without breaking user behavior.
5. It is deterministic — it never flakes.

A test is bad if:
- It mocks everything and tests nothing real.
- It tests that a function calls another function (coupling to implementation).
- It is so brittle that refactoring breaks it without any real regression.
- It passes when the feature is broken.

---

*Last updated: 2026-07-01 — Session 017 (CI/CD and CodeRabbit removed, native local dev only)*
