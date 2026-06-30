import { test, expect } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

let tmpDir: string
let pdf1Path: string
let pdf2Path: string

test.beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'merge-e2e-'))

  const makePdf = async () => {
    const doc = await PDFDocument.create()
    doc.addPage([300, 300])
    return Buffer.from(await doc.save())
  }

  pdf1Path = path.join(tmpDir, 'sample1.pdf')
  await fs.writeFile(pdf1Path, await makePdf())

  pdf2Path = path.join(tmpDir, 'sample2.pdf')
  await fs.writeFile(pdf2Path, await makePdf())
})

test.afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

test('full merge flow: upload → process → download', async ({ page }) => {
  await page.goto('/merge')

  // Upload 2 PDFs via react-dropzone's hidden file input
  await page.locator('input[type="file"]').setInputFiles([pdf1Path, pdf2Path])

  // Both filenames must appear in the list
  await expect(page.getByText('sample1.pdf')).toBeVisible()
  await expect(page.getByText('sample2.pdf')).toBeVisible()

  // Merge button must be enabled with 2 files
  const mergeButton = page.getByRole('button', { name: 'Merge PDFs' })
  await expect(mergeButton).toBeEnabled()

  // Start merge
  await mergeButton.click()

  // PROCESSING state
  await expect(page.getByText('Merging your files…')).toBeVisible({ timeout: 10_000 })

  // DONE state — allow time for the worker to process and polling to catch it
  await expect(page.getByText('Your PDFs have been merged successfully')).toBeVisible({
    timeout: 60_000,
  })

  // Capture the download before clicking so the event is not missed
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download merged PDF' }).click()
  const download = await downloadPromise

  // Verify the downloaded bytes start with the PDF magic bytes
  const downloadedPath = await download.path()
  expect(downloadedPath).not.toBeNull()
  const buffer = await fs.readFile(downloadedPath!)
  expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF')

  // "Merge more PDFs" must reset to IDLE without a page refresh
  await page.getByRole('button', { name: 'Merge more PDFs' }).click()
  await expect(page.getByText('Drag PDF files here, or click to browse')).toBeVisible()
})
