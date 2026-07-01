import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import JSZip from 'jszip'
import type { Job } from 'bullmq'
import { ImageFormat, JobStatus } from '@ilovepdf/shared'
import type { PdfToImageJobPayload } from '@ilovepdf/shared'

// Mirrors compress.test.ts's approach: only the I/O boundaries (db, storage,
// logger) are mocked. pdfjs-dist and @napi-rs/canvas run for real against
// generated fixture PDFs — this is the first feature where the rasterization
// library itself was the source of a real bug (ADR-009 Addendum), so mocking
// it here would test nothing.

const mocks = vi.hoisted(() => {
  const childLogger = {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }
  return {
    prismaFindUnique: vi.fn(),
    prismaUpdate: vi.fn(),
    downloadFile: vi.fn(),
    uploadFile: vi.fn(),
    childLogger,
    loggerChild: vi.fn().mockReturnValue(childLogger),
  }
})

vi.mock('../lib/db.js', () => ({
  prisma: {
    job: {
      findUniqueOrThrow: mocks.prismaFindUnique,
      update: mocks.prismaUpdate,
    },
  },
}))

vi.mock('../lib/storage.js', () => ({
  downloadFile: mocks.downloadFile,
  uploadFile: mocks.uploadFile,
}))

vi.mock('../lib/logger.js', () => ({
  logger: { child: mocks.loggerChild },
}))

import { processPdfToImageJob } from './pdf-to-image.js'

function makeJob(data: PdfToImageJobPayload): Job<PdfToImageJobPayload> {
  return { data, name: 'pdf-to-image', id: 'bq-job-1' } as unknown as Job<PdfToImageJobPayload>
}

async function buildPdfFixture(pageCount: number): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) {
    const page = pdfDoc.addPage([200, 300])
    page.drawText(`Page ${i + 1}`)
  }
  return Buffer.from(await pdfDoc.save())
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47])
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff])

// Regression guard for the standardFontDataUrl bug found in ADR-009's Session
// 032 Addendum: without it, pdfjs-dist silently fails to rasterize glyphs for
// the 14 base PDF fonts and every page renders fully blank. Decoding the
// output and checking for non-white pixels catches that failure mode, which
// "is this a valid PNG/JPEG" magic-byte checks alone would not.
async function hasNonWhitePixel(imageBuffer: Buffer): Promise<boolean> {
  const image = await loadImage(imageBuffer)
  const canvas = createCanvas(image.width, image.height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0)
  const { data } = ctx.getImageData(0, 0, image.width, image.height)
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) return true
  }
  return false
}

describe('processPdfToImageJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.loggerChild.mockReturnValue(mocks.childLogger)
    mocks.prismaFindUnique.mockResolvedValue({ correlationId: 'corr-123' })
    mocks.prismaUpdate.mockResolvedValue(undefined)
    mocks.uploadFile.mockResolvedValue(undefined)
  })

  it('rasterizes a 3-page PDF into 3 correctly-named, correctly-formatted PNGs inside a ZIP', async () => {
    const bytes = await buildPdfFixture(3)
    mocks.downloadFile.mockResolvedValue(bytes)

    const job = makeJob({ jobId: 'job-png', inputKey: 'inputs/a.pdf', format: ImageFormat.PNG })
    await processPdfToImageJob(job)

    const uploadCall = mocks.uploadFile.mock.calls[0] as [string, Buffer, string]
    expect(uploadCall[0]).toMatch(/^outputs\/.+\.zip$/)
    expect(uploadCall[2]).toBe('application/zip')

    const zip = await JSZip.loadAsync(uploadCall[1])
    const names = Object.keys(zip.files).sort()
    expect(names).toEqual(['page-1.png', 'page-2.png', 'page-3.png'])

    for (const name of names) {
      const fileBuffer = await zip.files[name].async('nodebuffer')
      expect(fileBuffer.subarray(0, 4)).toEqual(PNG_MAGIC)
      expect(await hasNonWhitePixel(fileBuffer)).toBe(true)
    }

    const secondUpdate = mocks.prismaUpdate.mock.calls[1] as [
      { where: { id: string }; data: { status: string; outputKey: string } },
    ]
    expect(secondUpdate[0].data.status).toBe(JobStatus.COMPLETED)
  })

  it('rasterizes a 1-page PDF into a single JPEG inside a ZIP (always ZIP, no single-image branch)', async () => {
    const bytes = await buildPdfFixture(1)
    mocks.downloadFile.mockResolvedValue(bytes)

    const job = makeJob({ jobId: 'job-jpeg', inputKey: 'inputs/a.pdf', format: ImageFormat.JPEG })
    await processPdfToImageJob(job)

    const uploadCall = mocks.uploadFile.mock.calls[0] as [string, Buffer, string]
    const zip = await JSZip.loadAsync(uploadCall[1])
    const names = Object.keys(zip.files)
    expect(names).toEqual(['page-1.jpg'])

    const fileBuffer = await zip.files['page-1.jpg'].async('nodebuffer')
    expect(fileBuffer.subarray(0, 3)).toEqual(JPEG_MAGIC)
  })

  it('updates to FAILED when the downloaded file has invalid magic bytes', async () => {
    mocks.downloadFile.mockResolvedValue(Buffer.from('not-a-pdf-content'))
    const job = makeJob({ jobId: 'job-bad', inputKey: 'inputs/bad.pdf', format: ImageFormat.PNG })

    await expect(processPdfToImageJob(job)).rejects.toThrow('not a valid PDF')

    const updateCalls = mocks.prismaUpdate.mock.calls as Array<
      [{ where: { id: string }; data: { status: string; errorMessage?: string } }]
    >
    const failedCall = updateCalls.find((c) => c[0].data.status === (JobStatus.FAILED as string))
    expect(failedCall).toBeDefined()
    expect(failedCall![0].data.errorMessage).toContain('not a valid PDF')
  })

  it('updates to FAILED when the input has PDF magic bytes but a malformed structure', async () => {
    mocks.downloadFile.mockResolvedValue(Buffer.from('%PDF-not-really-valid-structure'))
    const job = makeJob({ jobId: 'job-corrupt', inputKey: 'inputs/corrupt.pdf', format: ImageFormat.PNG })

    await expect(processPdfToImageJob(job)).rejects.toThrow()

    const updateCalls = mocks.prismaUpdate.mock.calls as Array<
      [{ where: { id: string }; data: { status: string; errorMessage?: string } }]
    >
    const failedCall = updateCalls.find((c) => c[0].data.status === (JobStatus.FAILED as string))
    expect(failedCall).toBeDefined()
    expect(typeof failedCall![0].data.errorMessage).toBe('string')
  })

  it('updates to FAILED when MinIO upload throws', async () => {
    const bytes = await buildPdfFixture(1)
    mocks.downloadFile.mockResolvedValue(bytes)
    mocks.uploadFile.mockRejectedValue(new Error('S3 connection refused'))

    const job = makeJob({ jobId: 'job-upload-fail', inputKey: 'inputs/a.pdf', format: ImageFormat.PNG })

    await expect(processPdfToImageJob(job)).rejects.toThrow('S3 connection refused')

    expect(mocks.prismaUpdate).toHaveBeenCalledWith({
      where: { id: 'job-upload-fail' },
      data: { status: JobStatus.FAILED, errorMessage: 'S3 connection refused' },
    })
  })
})
