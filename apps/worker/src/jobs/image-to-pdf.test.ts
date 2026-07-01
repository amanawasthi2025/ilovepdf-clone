import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
import type { Job } from 'bullmq'
import { JobStatus } from '@ilovepdf/shared'
import type { ImageToPdfJobPayload } from '@ilovepdf/shared'

// Only the I/O boundaries (db, storage, logger) are mocked — pdf-lib runs for
// real against generated fixture PNG/JPEG buffers, same pattern as
// compress.test.ts and pdf-to-image.test.ts.

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

import { processImageToPdfJob } from './image-to-pdf.js'

function makeJob(data: ImageToPdfJobPayload): Job<ImageToPdfJobPayload> {
  return { data, name: 'image-to-pdf', id: 'bq-job-1' } as unknown as Job<ImageToPdfJobPayload>
}

async function buildPng(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 20, b: 20 } } })
    .png()
    .toBuffer()
}

async function buildJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 20, g: 200, b: 20 } } })
    .jpeg({ quality: 90 })
    .toBuffer()
}

describe('processImageToPdfJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.loggerChild.mockReturnValue(mocks.childLogger)
    mocks.prismaFindUnique.mockResolvedValue({ correlationId: 'corr-123' })
    mocks.prismaUpdate.mockResolvedValue(undefined)
    mocks.uploadFile.mockResolvedValue(undefined)
  })

  it('embeds a single PNG as one full-bleed page sized to its pixel dimensions', async () => {
    const png = await buildPng(300, 200)
    mocks.downloadFile.mockResolvedValue(png)

    const job = makeJob({ jobId: 'job-1', inputKeys: ['inputs/a.png'] })
    await processImageToPdfJob(job)

    const uploadCall = mocks.uploadFile.mock.calls[0] as [string, Buffer, string]
    expect(uploadCall[0]).toMatch(/^outputs\/.+\.pdf$/)
    expect(uploadCall[2]).toBe('application/pdf')

    const pdfDoc = await PDFDocument.load(uploadCall[1])
    expect(pdfDoc.getPageCount()).toBe(1)
    const page = pdfDoc.getPage(0)
    expect(page.getWidth()).toBe(300)
    expect(page.getHeight()).toBe(200)

    const secondUpdate = mocks.prismaUpdate.mock.calls[1] as [
      { where: { id: string }; data: { status: string; outputKey: string } },
    ]
    expect(secondUpdate[0].data.status).toBe(JobStatus.COMPLETED)
  })

  it('embeds a JPEG correctly when the downloaded buffer is pool-allocated at a nonzero byteOffset', async () => {
    // Regression test for a real bug found during Session 036 manual E2E
    // verification: pdf-lib's JpegEmbedder reads `new DataView(buf.buffer)`
    // without respecting Buffer.byteOffset. downloadFile's real Buffer.concat
    // return value is frequently pool-allocated at a nonzero offset for small
    // files, which this test reproduces directly (a fresh Sharp buffer alone
    // has byteOffset 0 and would not catch a regression here).
    const jpeg = await buildJpeg(120, 80)
    const poolOffsetBuffer = Buffer.concat([jpeg])
    expect(poolOffsetBuffer.byteOffset).toBeGreaterThan(0)
    mocks.downloadFile.mockResolvedValue(poolOffsetBuffer)

    const job = makeJob({ jobId: 'job-offset', inputKeys: ['inputs/offset.jpg'] })
    await processImageToPdfJob(job)

    const uploadCall = mocks.uploadFile.mock.calls[0] as [string, Buffer, string]
    const pdfDoc = await PDFDocument.load(uploadCall[1])
    expect(pdfDoc.getPageCount()).toBe(1)
    expect(pdfDoc.getPage(0).getWidth()).toBe(120)
    expect(pdfDoc.getPage(0).getHeight()).toBe(80)
  })

  it('embeds mixed PNG/JPEG images as pages in upload order, each sized to its own dimensions', async () => {
    const png = await buildPng(300, 200)
    const jpeg = await buildJpeg(150, 450)
    mocks.downloadFile.mockResolvedValueOnce(png).mockResolvedValueOnce(jpeg)

    const job = makeJob({ jobId: 'job-2', inputKeys: ['inputs/a.png', 'inputs/b.jpg'] })
    await processImageToPdfJob(job)

    const uploadCall = mocks.uploadFile.mock.calls[0] as [string, Buffer, string]
    const pdfDoc = await PDFDocument.load(uploadCall[1])
    expect(pdfDoc.getPageCount()).toBe(2)
    expect(pdfDoc.getPage(0).getWidth()).toBe(300)
    expect(pdfDoc.getPage(0).getHeight()).toBe(200)
    expect(pdfDoc.getPage(1).getWidth()).toBe(150)
    expect(pdfDoc.getPage(1).getHeight()).toBe(450)
  })

  it('updates to FAILED when a downloaded file has invalid PNG/JPEG magic bytes', async () => {
    mocks.downloadFile.mockResolvedValue(Buffer.from('not-an-image'))
    const job = makeJob({ jobId: 'job-bad', inputKeys: ['inputs/bad.png'] })

    await expect(processImageToPdfJob(job)).rejects.toThrow('not a valid PNG or JPEG image')

    const updateCalls = mocks.prismaUpdate.mock.calls as Array<
      [{ where: { id: string }; data: { status: string; errorMessage?: string } }]
    >
    const failedCall = updateCalls.find((c) => c[0].data.status === (JobStatus.FAILED as string))
    expect(failedCall).toBeDefined()
    expect(failedCall![0].data.errorMessage).toContain('not a valid PNG or JPEG image')
  })

  it('updates to FAILED when MinIO upload throws', async () => {
    const png = await buildPng(100, 100)
    mocks.downloadFile.mockResolvedValue(png)
    mocks.uploadFile.mockRejectedValue(new Error('S3 connection refused'))

    const job = makeJob({ jobId: 'job-upload-fail', inputKeys: ['inputs/a.png'] })

    await expect(processImageToPdfJob(job)).rejects.toThrow('S3 connection refused')

    expect(mocks.prismaUpdate).toHaveBeenCalledWith({
      where: { id: 'job-upload-fail' },
      data: { status: JobStatus.FAILED, errorMessage: 'S3 connection refused' },
    })
  })
})
