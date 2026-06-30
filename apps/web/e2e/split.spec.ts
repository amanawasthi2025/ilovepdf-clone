import { test, expect } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import JSZip from 'jszip'
import { PrismaClient, JobType, JobStatus } from '@prisma/client'
import { randomUUID } from 'crypto'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

const prisma = new PrismaClient()

let tmpDir: string
let pdfPath: string

test.beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'split-e2e-'))

  const doc = await PDFDocument.create()
  for (let i = 0; i < 10; i++) {
    doc.addPage([300, 300])
  }
  pdfPath = path.join(tmpDir, 'sample.pdf')
  await fs.writeFile(pdfPath, Buffer.from(await doc.save()))
})

test.afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
  await prisma.$disconnect()
})

test('full split flow: upload → process → download ZIP with correct PDFs', async ({ page }) => {
  await page.goto('/split')

  // Upload the 10-page PDF via react-dropzone's hidden file input
  await page.locator('input[type="file"]').setInputFiles(pdfPath)
  await expect(page.getByText('sample.pdf')).toBeVisible()

  // Split button must be disabled until ranges are entered
  const splitButton = page.getByRole('button', { name: 'Split PDF' })
  await expect(splitButton).toBeDisabled()

  // Enter page ranges
  await page.locator('#ranges').fill('1-3,4-6,7-10')
  await expect(splitButton).toBeEnabled()

  // Start split
  await splitButton.click()

  // PROCESSING state
  await expect(page.getByText('Splitting your file…')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Creating 3 PDFs')).toBeVisible()

  // DONE state — allow time for the worker to process and polling to catch it
  await expect(page.getByText('Your PDF has been split successfully')).toBeVisible({
    timeout: 60_000,
  })

  // Capture the download before clicking so the event is not missed
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download ZIP' }).click()
  const download = await downloadPromise

  // Verify the ZIP contains one valid PDF per range, with the correct page counts
  const downloadedPath = await download.path()
  expect(downloadedPath).not.toBeNull()
  const zipBuffer = await fs.readFile(downloadedPath!)
  const zip = await JSZip.loadAsync(zipBuffer)

  const expectedEntries: Record<string, number> = {
    'split-1-3.pdf': 3,
    'split-4-6.pdf': 3,
    'split-7-10.pdf': 4,
  }

  expect(Object.keys(zip.files).sort()).toEqual(Object.keys(expectedEntries).sort())

  for (const [name, expectedPageCount] of Object.entries(expectedEntries)) {
    const entryBytes = await zip.file(name)!.async('nodebuffer')
    expect(entryBytes.subarray(0, 4).toString('ascii')).toBe('%PDF')
    const entryDoc = await PDFDocument.load(entryBytes)
    expect(entryDoc.getPageCount()).toBe(expectedPageCount)
  }

  // "Split another PDF" must reset to IDLE without a page refresh
  await page.getByRole('button', { name: 'Split another PDF' }).click()
  await expect(page.getByText('Drag a PDF file here or click to browse')).toBeVisible()
})

test('out-of-bounds range is rejected by the API and shows an error banner', async ({ page }) => {
  await page.goto('/split')

  await page.locator('input[type="file"]').setInputFiles(pdfPath)
  await expect(page.getByText('sample.pdf')).toBeVisible()

  await page.locator('#ranges').fill('1-99')
  const splitButton = page.getByRole('button', { name: 'Split PDF' })
  await expect(splitButton).toBeEnabled()
  await splitButton.click()

  // Returns to IDLE with an error banner; selected file remains intact
  await expect(page.getByRole('alert').filter({ hasText: 'out of bounds' })).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.getByText('sample.pdf')).toBeVisible()
  await expect(splitButton).toBeEnabled()
})

test('job that fails after being queued shows the ERROR state (AC-21)', async ({ page }) => {
  // POST /api/split/jobs runs the same magic-bytes + pdf-lib load check the worker
  // runs, so a corrupted PDF is rejected at upload time and never reaches the queue
  // (see split.test.ts for the worker-side FAILED unit tests covering that path).
  // The reachable post-queue failure surface in this app is the status endpoint +
  // UI reading a FAILED job from the database, so we seed one directly and let the
  // real GET /status route and the page's real polling/ERROR-state code drive this.
  const errorMessage = 'Input file "inputs/seeded.pdf" is not a valid PDF'
  const seededJob = await prisma.job.create({
    data: {
      jobType: JobType.SPLIT,
      status: JobStatus.FAILED,
      inputKeys: ['inputs/seeded.pdf'],
      splitRanges: '1-3',
      errorMessage,
      correlationId: randomUUID(),
      expiresAt: new Date(Date.now() + 3600_000),
    },
  })

  try {
    await page.goto('/split')
    await page.route('**/api/split/jobs', async (route) => {
      await route.fulfill({ status: 202, json: { jobId: seededJob.id } })
    })

    await page.locator('input[type="file"]').setInputFiles(pdfPath)
    await page.locator('#ranges').fill('1-3')
    await page.getByRole('button', { name: 'Split PDF' }).click()

    await expect(page.getByText('Split failed')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(errorMessage)).toBeVisible()

    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByText('Drag a PDF file here or click to browse')).toBeVisible()
  } finally {
    await prisma.job.delete({ where: { id: seededJob.id } })
  }
})
