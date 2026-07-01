import { test, expect, type Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import JSZip from 'jszip'
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

const prisma = new PrismaClient()

const PASSWORD = 'correct-horse-battery-staple'

function uniqueEmail(): string {
  return `e2e-pdf-to-image-${randomUUID()}@example.com`
}

async function signupAndLogin(page: Page, email: string): Promise<void> {
  await page.goto('/signup')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign up' }).click()
  await expect(page).toHaveURL(/\/login\?signup=success/)

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL('/')
}

let tmpDir: string
let pdfPath: string

test.beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-to-image-e2e-'))

  const doc = await PDFDocument.create()
  doc.addPage([300, 300])
  doc.addPage([300, 300])
  doc.addPage([300, 300])
  pdfPath = path.join(tmpDir, 'sample.pdf')
  await fs.writeFile(pdfPath, Buffer.from(await doc.save()))
})

test.afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
  await prisma.$disconnect()
})

// AC-22: full upload → format selection → process → download ZIP, contents verified
test('full pdf-to-image flow: upload → select JPEG → process → download ZIP with correct page images', async ({
  page,
}) => {
  await page.goto('/pdf-to-image')

  // Upload the 3-page PDF via react-dropzone's hidden file input
  await page.locator('input[type="file"]').setInputFiles(pdfPath)
  await expect(page.getByText('sample.pdf')).toBeVisible()

  // PNG is selected by default (initial state) — switch to JPEG
  const pngOption = page.getByRole('radio', { name: /PNG/ })
  const jpegOption = page.getByRole('radio', { name: /JPEG/ })
  await expect(pngOption).toHaveAttribute('aria-checked', 'true')
  await jpegOption.click()
  await expect(jpegOption).toHaveAttribute('aria-checked', 'true')

  const convertButton = page.getByRole('button', { name: 'Convert to Images' })
  await expect(convertButton).toBeEnabled()
  await convertButton.click()

  // Rasterizing 3 blank pages is fast enough that PROCESSING can complete before
  // it's observable here, so — unlike Split/Compress — this doesn't assert on it;
  // DONE state below is reached either way.
  await expect(page.getByText('Your PDF has been converted successfully')).toBeVisible({
    timeout: 60_000,
  })

  // Capture the download before clicking so the event is not missed
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download ZIP' }).click()
  const download = await downloadPromise

  // Verify the ZIP contains exactly 3 correctly-named, correctly-formatted JPEG page images
  const downloadedPath = await download.path()
  expect(downloadedPath).not.toBeNull()
  const zipBuffer = await fs.readFile(downloadedPath!)
  const zip = await JSZip.loadAsync(zipBuffer)

  expect(Object.keys(zip.files).sort()).toEqual(['page-1.jpg', 'page-2.jpg', 'page-3.jpg'])

  for (const name of ['page-1.jpg', 'page-2.jpg', 'page-3.jpg']) {
    const entryBytes = await zip.file(name)!.async('nodebuffer')
    // JPEG magic bytes: FF D8 FF
    expect(entryBytes.subarray(0, 3).toString('hex')).toBe('ffd8ff')
  }

  // "Convert another PDF" must reset to IDLE without a page refresh
  await page.getByRole('button', { name: 'Convert another PDF' }).click()
  await expect(page.getByText('Drag a PDF file here or click to browse')).toBeVisible()
})

// AC-23: a PDF_TO_IMAGE job submitted while logged in appears in /history and its Download control succeeds
test('pdf-to-image job submitted while logged in appears in history and downloads successfully', async ({
  page,
}) => {
  const email = uniqueEmail()

  try {
    await signupAndLogin(page, email)

    await page.goto('/pdf-to-image')
    await page.locator('input[type="file"]').setInputFiles(pdfPath)
    await page.getByRole('button', { name: 'Convert to Images' }).click()
    await expect(page.getByText('Your PDF has been converted successfully')).toBeVisible({
      timeout: 60_000,
    })

    await page.goto('/history')
    const row = page.getByRole('listitem').filter({ hasText: 'PDF to Image' })
    await expect(row).toBeVisible()
    await expect(row.getByText('COMPLETED')).toBeVisible()

    const downloadPromise = page.waitForEvent('download')
    await row.getByRole('button', { name: 'Download' }).click()
    const download = await downloadPromise

    const downloadedPath = await download.path()
    expect(downloadedPath).not.toBeNull()
    const zipBuffer = await fs.readFile(downloadedPath!)
    const zip = await JSZip.loadAsync(zipBuffer)
    expect(Object.keys(zip.files).sort()).toEqual(['page-1.png', 'page-2.png', 'page-3.png'])
  } finally {
    await prisma.user.deleteMany({ where: { email } })
  }
})
