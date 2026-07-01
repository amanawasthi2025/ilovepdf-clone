import { test, expect } from '@playwright/test'
import { PDFDocument, PDFName } from 'pdf-lib'
import { PrismaClient, JobType, JobStatus, CompressionLevel } from '@prisma/client'
import { randomUUID } from 'crypto'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

const prisma = new PrismaClient()

let tmpDir: string
let pdfPath: string
let originalSize: number

// Builds a real /DeviceRGB + /FlateDecode raw-bitmap image XObject by hand,
// wired directly into a page's Resources/Contents via pdf-lib's low-level
// context API. This is in v1 compression scope (see wiki/active-feature.md
// Scope Decisions) and needs no image-encoding library — `sharp` is a
// worker-only dependency per ADR-006, so the e2e fixture can't lean on it.
// Random noise defeats Flate's run-length-friendly compression on a flat
// color, so the image is large enough for a JPEG re-encode to shrink.
async function buildFixturePdf(): Promise<Uint8Array> {
  const width = 900
  const height = 700
  const rawRgbBytes = Buffer.alloc(width * height * 3)
  for (let i = 0; i < rawRgbBytes.length; i++) {
    rawRgbBytes[i] = Math.floor(Math.random() * 256)
  }

  const pdfDoc = await PDFDocument.create()
  const xObjectStream = pdfDoc.context.flateStream(rawRgbBytes, {
    Type: 'XObject',
    Subtype: 'Image',
    Width: width,
    Height: height,
    BitsPerComponent: 8,
    ColorSpace: 'DeviceRGB',
  })
  const imageRef = pdfDoc.context.register(xObjectStream)

  const imagePage = pdfDoc.addPage([450, 350])
  const resources = imagePage.node.Resources()!
  const xObjectDict = pdfDoc.context.obj({})
  resources.set(PDFName.of('XObject'), xObjectDict)
  xObjectDict.set(PDFName.of('Img0'), imageRef)

  const contentBytes = Buffer.from('q\n400 0 0 300 25 25 cm\n/Img0 Do\nQ')
  const contentRef = pdfDoc.context.register(pdfDoc.context.stream(contentBytes, {}))
  imagePage.node.set(PDFName.of('Contents'), contentRef)

  // Two more plain pages so page count/order preservation is meaningfully verified.
  pdfDoc.addPage([300, 300])
  pdfDoc.addPage([300, 300])

  return pdfDoc.save()
}

test.beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'compress-e2e-'))
  pdfPath = path.join(tmpDir, 'sample.pdf')
  const bytes = await buildFixturePdf()
  await fs.writeFile(pdfPath, bytes)
  originalSize = bytes.byteLength
})

test.afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
  await prisma.$disconnect()
})

// AC-39: full upload → process → download flow verified at every compression level.
const LEVELS: { label: string; isDefault: boolean }[] = [
  { label: 'Low', isDefault: false },
  { label: 'Recommended', isDefault: true },
  { label: 'High', isDefault: false },
]

for (const { label, isDefault } of LEVELS) {
  test(`full compress flow at ${label} level: upload → process → download smaller PDF with pages preserved`, async ({ page }) => {
    await page.goto('/compress')

    // Upload via react-dropzone's hidden file input
    await page.locator('input[type="file"]').setInputFiles(pdfPath)
    await expect(page.getByText('sample.pdf')).toBeVisible()

    const levelOption = page.getByRole('radio', { name: new RegExp(label) })
    if (isDefault) {
      // Recommended is selected by default (AC-05) — no click needed
      await expect(levelOption).toHaveAttribute('aria-checked', 'true')
    } else {
      await levelOption.click()
      await expect(levelOption).toHaveAttribute('aria-checked', 'true')
    }

    const compressButton = page.getByRole('button', { name: 'Compress PDF' })
    await expect(compressButton).toBeEnabled()
    await compressButton.click()

    // PROCESSING state
    await expect(page.getByText('Compressing your file…')).toBeVisible({ timeout: 10_000 })

    // DONE state — allow time for the worker to process and polling to catch it
    await expect(page.getByText('Your PDF has been compressed successfully')).toBeVisible({
      timeout: 60_000,
    })

    // Capture the download before clicking so the event is not missed
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download PDF' }).click()
    const download = await downloadPromise

    const downloadedPath = await download.path()
    expect(downloadedPath).not.toBeNull()
    const buffer = await fs.readFile(downloadedPath!)

    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF')
    expect(buffer.byteLength).toBeLessThan(originalSize)

    const downloadedDoc = await PDFDocument.load(buffer)
    expect(downloadedDoc.getPageCount()).toBe(3)
    expect(downloadedDoc.getPage(0).getSize()).toEqual({ width: 450, height: 350 })
    expect(downloadedDoc.getPage(1).getSize()).toEqual({ width: 300, height: 300 })

    // "Compress another PDF" must reset to IDLE without a page refresh
    await page.getByRole('button', { name: 'Compress another PDF' }).click()
    await expect(page.getByText('Drag a PDF file here or click to browse')).toBeVisible()
  })
}

test('user can select the High compression level (AC-05)', async ({ page }) => {
  await page.goto('/compress')

  await page.locator('input[type="file"]').setInputFiles(pdfPath)
  await expect(page.getByText('sample.pdf')).toBeVisible()

  const highOption = page.getByRole('radio', { name: /High/ })
  await highOption.click()
  await expect(highOption).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('radio', { name: /Recommended/ })).toHaveAttribute('aria-checked', 'false')
})

test('encrypted PDF is rejected server-side and shows an error banner without losing the file (AC-20)', async ({ page }) => {
  await page.goto('/compress')

  await page.route('**/api/compress/jobs', async (route) => {
    await route.fulfill({
      status: 400,
      json: { error: 'UNSUPPORTED_ENCRYPTED_PDF', message: '"sample.pdf" is encrypted/password-protected and cannot be compressed.' },
    })
  })

  await page.locator('input[type="file"]').setInputFiles(pdfPath)
  await expect(page.getByText('sample.pdf')).toBeVisible()
  await page.getByRole('button', { name: 'Compress PDF' }).click()

  await expect(page.getByRole('alert').filter({ hasText: 'encrypted' })).toBeVisible({ timeout: 10_000 })
  // Selected file must remain intact and the button re-enabled (back to IDLE)
  await expect(page.getByText('sample.pdf', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Compress PDF' })).toBeEnabled()
})

test('a network error during upload shows an error banner and keeps the file intact (AC-24)', async ({ page }) => {
  await page.goto('/compress')

  await page.route('**/api/compress/jobs', async (route) => {
    await route.abort('failed')
  })

  await page.locator('input[type="file"]').setInputFiles(pdfPath)
  await expect(page.getByText('sample.pdf', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Compress PDF' }).click()

  // A real browser fetch failure throws `TypeError: Failed to fetch`, which is
  // `instanceof Error`, so the banner shows that message rather than the
  // catch block's generic fallback string — asserting on the alert itself,
  // not specific wording, keeps this resilient to the browser's exact message.
  await expect(page.getByRole('alert').filter({ hasText: 'Failed to fetch' })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('sample.pdf', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Compress PDF' })).toBeEnabled()
})

test('job that fails after being queued shows the ERROR state (AC-22/AC-23)', async ({ page }) => {
  const errorMessage = 'Input file "inputs/seeded.pdf" is not a valid PDF'
  const seededJob = await prisma.job.create({
    data: {
      jobType: JobType.COMPRESS,
      status: JobStatus.FAILED,
      inputKeys: ['inputs/seeded.pdf'],
      compressionLevel: CompressionLevel.RECOMMENDED,
      errorMessage,
      correlationId: randomUUID(),
      expiresAt: new Date(Date.now() + 3600_000),
    },
  })

  try {
    await page.goto('/compress')
    await page.route('**/api/compress/jobs', async (route) => {
      await route.fulfill({ status: 202, json: { jobId: seededJob.id } })
    })

    await page.locator('input[type="file"]').setInputFiles(pdfPath)
    await page.getByRole('button', { name: 'Compress PDF' }).click()

    await expect(page.getByText('Compression failed')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(errorMessage)).toBeVisible()

    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByText('Drag a PDF file here or click to browse')).toBeVisible()
  } finally {
    await prisma.job.delete({ where: { id: seededJob.id } })
  }
})
