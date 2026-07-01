import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import sharp from 'sharp'
import type { Job } from 'bullmq'
import { CompressionLevel, JobStatus } from '@ilovepdf/shared'
import type { CompressJobPayload } from '@ilovepdf/shared'

// compress.ts operates on real pdf-lib/Sharp objects at the byte level (raw
// XObject streams, content-stream tokenizing) — mocking pdf-lib itself, as
// split.test.ts does for its high-level `create`/`load`/`copyPages` calls,
// would mean not testing the actual logic at all. Only the I/O boundaries
// (db, storage, logger) are mocked here; pdf-lib and Sharp run for real
// against generated fixture PDFs.

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

// vi.mock calls above are hoisted by vitest above this static import, so
// compress.js resolves against the mocked db/storage/logger modules.
import { processCompressJob } from './compress.js'

function makeJob(data: CompressJobPayload): Job<CompressJobPayload> {
  return { data, name: 'compress', id: 'bq-job-1' } as unknown as Job<CompressJobPayload>
}

async function buildJpegFixture(): Promise<{ bytes: Uint8Array; jpegBytes: Buffer }> {
  const noise = await sharp({
    create: {
      width: 1200,
      height: 900,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
      noise: { type: 'gaussian', mean: 128, sigma: 55 },
    },
  })
    .png()
    .toBuffer()
  const jpegBytes = await sharp({ create: { width: 1200, height: 900, channels: 3, background: { r: 10, g: 10, b: 10 } } })
    .composite([{ input: noise }])
    .jpeg({ quality: 95 })
    .toBuffer()

  const pdfDoc = await PDFDocument.create()
  const image = await pdfDoc.embedJpg(jpegBytes)
  // Placed at 300x225pt -> effective DPI = 1200 / (300/72) = 288, comfortably
  // above every level's maxDpi, so a resize is expected at every level.
  const page = pdfDoc.addPage([350, 275])
  page.drawImage(image, { x: 25, y: 25, width: 300, height: 225 })

  return { bytes: await pdfDoc.save(), jpegBytes }
}

// pdf-lib's own `embedPng` always converts to a `/DeviceRGB` XObject
// internally (see node_modules/pdf-lib/cjs/utils/png.js — it splits every
// PNG, grayscale or not, into an RGB channel), so it can't produce a genuine
// `/DeviceGray` FlateDecode image to test against. Real `/DeviceGray`
// FlateDecode images do occur in PDFs from other producers (Ghostscript,
// scanners, etc.), so this builds one by hand at the same low level
// compress.ts itself reads: register a flate-compressed single-channel
// stream directly, then wire it into a page's Resources/Contents.
async function buildGrayscaleFlateFixture(): Promise<Uint8Array> {
  const width = 600
  const height = 500
  // Noise defeats Flate's run-length-friendly compression on a flat color,
  // matching a real scanned/photo bitmap (a flat gray square would deflate
  // to almost nothing, making a JPEG re-encode's fixed overhead *larger*).
  const rawGrayBytes = Buffer.alloc(width * height)
  for (let i = 0; i < rawGrayBytes.length; i++) {
    rawGrayBytes[i] = Math.floor(Math.random() * 256)
  }

  const pdfDoc = await PDFDocument.create()
  const xObjectStream = pdfDoc.context.flateStream(rawGrayBytes, {
    Type: 'XObject',
    Subtype: 'Image',
    Width: width,
    Height: height,
    BitsPerComponent: 8,
    ColorSpace: 'DeviceGray',
  })
  const imageRef = pdfDoc.context.register(xObjectStream)

  const page = pdfDoc.addPage([350, 300])
  const resources = page.node.Resources()!
  const xObjectDict = pdfDoc.context.obj({})
  resources.set(PDFName.of('XObject'), xObjectDict)
  xObjectDict.set(PDFName.of('GrayImg'), imageRef)

  const contentBytes = Buffer.from('q\n300 0 0 250 25 25 cm\n/GrayImg Do\nQ')
  const contentRef = pdfDoc.context.register(pdfDoc.context.stream(contentBytes, {}))
  page.node.set(PDFName.of('Contents'), contentRef)

  return pdfDoc.save()
}

async function buildTextOnlyFixture(): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([300, 200])
  page.drawText('No images here')
  return pdfDoc.save()
}

async function buildCmykFixture(): Promise<Uint8Array> {
  const cmykJpeg = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 10, g: 200, b: 30 } } })
    .jpeg()
    .toColourspace('cmyk')
    .toBuffer()

  const pdfDoc = await PDFDocument.create()
  const image = await pdfDoc.embedJpg(cmykJpeg)
  const page = pdfDoc.addPage([350, 300])
  page.drawImage(image, { x: 25, y: 25, width: 300, height: 250 })
  return pdfDoc.save()
}

function findImageStreams(pdfDoc: PDFDocument): PDFRawStream[] {
  const streams: PDFRawStream[] = []
  for (const [, obj] of pdfDoc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream && obj.dict.lookup(PDFName.of('Subtype'))?.toString() === '/Image') {
      streams.push(obj)
    }
  }
  return streams
}

describe('processCompressJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.loggerChild.mockReturnValue(mocks.childLogger)
    mocks.prismaFindUnique.mockResolvedValue({ correlationId: 'corr-123' })
    mocks.prismaUpdate.mockResolvedValue(undefined)
    mocks.uploadFile.mockResolvedValue(undefined)
  })

  it('compresses a JPEG image and produces a smaller, valid, same-page-count PDF at every level', async () => {
    for (const level of [CompressionLevel.LOW, CompressionLevel.RECOMMENDED, CompressionLevel.HIGH]) {
      vi.clearAllMocks()
      mocks.prismaFindUnique.mockResolvedValue({ correlationId: 'corr-123' })
      mocks.prismaUpdate.mockResolvedValue(undefined)
      mocks.uploadFile.mockResolvedValue(undefined)

      const { bytes } = await buildJpegFixture()
      mocks.downloadFile.mockResolvedValue(Buffer.from(bytes))

      const job = makeJob({ jobId: `job-${level}`, inputKey: 'inputs/a.pdf', level })
      await processCompressJob(job)

      expect(mocks.prismaUpdate).toHaveBeenNthCalledWith(1, {
        where: { id: `job-${level}` },
        data: { status: JobStatus.PROCESSING },
      })

      const uploadCall = mocks.uploadFile.mock.calls[0] as [string, Buffer, string]
      expect(uploadCall[0]).toMatch(/^outputs\/.+\.pdf$/)
      expect(uploadCall[2]).toBe('application/pdf')

      const outputBytes = uploadCall[1]
      expect(outputBytes.length).toBeLessThan(bytes.length)

      const reloaded = await PDFDocument.load(outputBytes)
      expect(reloaded.getPageCount()).toBe(1)

      const secondUpdate = mocks.prismaUpdate.mock.calls[1] as [
        { where: { id: string }; data: { status: string; outputKey: string } },
      ]
      expect(secondUpdate[0].data.status).toBe(JobStatus.COMPLETED)
    }
  })

  it('recompresses a grayscale FlateDecode bitmap and keeps it visually grayscale', async () => {
    const bytes = await buildGrayscaleFlateFixture()
    mocks.downloadFile.mockResolvedValue(Buffer.from(bytes))

    const job = makeJob({ jobId: 'job-gray', inputKey: 'inputs/a.pdf', level: CompressionLevel.RECOMMENDED })
    await processCompressJob(job)

    const uploadCall = mocks.uploadFile.mock.calls[0] as [string, Buffer, string]
    const outputBytes = uploadCall[1]
    const reloaded = await PDFDocument.load(outputBytes)
    const [stream] = findImageStreams(reloaded)
    const colorSpace = stream.dict.lookup(PDFName.of('ColorSpace'))?.toString()
    const filter = stream.dict.lookup(PDFName.of('Filter'))?.toString()
    expect(filter).toBe('/DCTDecode')
    expect(colorSpace).toBe('/DeviceGray')
  })

  it('completes successfully for a PDF with no images (pure text/vector)', async () => {
    const bytes = await buildTextOnlyFixture()
    mocks.downloadFile.mockResolvedValue(Buffer.from(bytes))

    const job = makeJob({ jobId: 'job-text', inputKey: 'inputs/a.pdf', level: CompressionLevel.RECOMMENDED })
    await processCompressJob(job)

    const secondUpdate = mocks.prismaUpdate.mock.calls[1] as [
      { where: { id: string }; data: { status: string; outputKey: string } },
    ]
    expect(secondUpdate[0].data.status).toBe(JobStatus.COMPLETED)

    const uploadCall = mocks.uploadFile.mock.calls[0] as [string, Buffer, string]
    const reloaded = await PDFDocument.load(uploadCall[1])
    expect(reloaded.getPageCount()).toBe(1)
  })

  it('leaves an out-of-scope CMYK image untouched (job still completes)', async () => {
    const bytes = await buildCmykFixture()
    mocks.downloadFile.mockResolvedValue(Buffer.from(bytes))

    const job = makeJob({ jobId: 'job-cmyk', inputKey: 'inputs/a.pdf', level: CompressionLevel.HIGH })
    await processCompressJob(job)

    const secondUpdate = mocks.prismaUpdate.mock.calls[1] as [
      { where: { id: string }; data: { status: string; outputKey: string } },
    ]
    expect(secondUpdate[0].data.status).toBe(JobStatus.COMPLETED)

    const uploadCall = mocks.uploadFile.mock.calls[0] as [string, Buffer, string]
    const reloaded = await PDFDocument.load(uploadCall[1])
    const [stream] = findImageStreams(reloaded)
    // Untouched: still whatever pdf-lib originally embedded it as (DCTDecode
    // bytes, CMYK color space) — filter unchanged, not converted to RGB.
    expect(stream.dict.lookup(PDFName.of('ColorSpace'))?.toString()).toBe('/DeviceCMYK')
  })

  it('updates to FAILED when the downloaded file has invalid magic bytes', async () => {
    mocks.downloadFile.mockResolvedValue(Buffer.from('not-a-pdf-content'))
    const job = makeJob({ jobId: 'job-bad', inputKey: 'inputs/bad.pdf', level: CompressionLevel.RECOMMENDED })

    await expect(processCompressJob(job)).rejects.toThrow('not a valid PDF')

    const updateCalls = mocks.prismaUpdate.mock.calls as Array<
      [{ where: { id: string }; data: { status: string; errorMessage?: string } }]
    >
    const failedCall = updateCalls.find((c) => c[0].data.status === (JobStatus.FAILED as string))
    expect(failedCall).toBeDefined()
    expect(failedCall![0].data.errorMessage).toContain('not a valid PDF')
  })

  it('updates to FAILED when pdf-lib fails to load the source PDF', async () => {
    mocks.downloadFile.mockResolvedValue(Buffer.from('%PDF-not-really-valid-structure'))
    const job = makeJob({ jobId: 'job-corrupt', inputKey: 'inputs/corrupt.pdf', level: CompressionLevel.RECOMMENDED })

    await expect(processCompressJob(job)).rejects.toThrow()

    const updateCalls = mocks.prismaUpdate.mock.calls as Array<
      [{ where: { id: string }; data: { status: string; errorMessage?: string } }]
    >
    const failedCall = updateCalls.find((c) => c[0].data.status === (JobStatus.FAILED as string))
    expect(failedCall).toBeDefined()
    expect(typeof failedCall![0].data.errorMessage).toBe('string')
  })

  it('updates to FAILED when MinIO upload throws', async () => {
    const bytes = await buildTextOnlyFixture()
    mocks.downloadFile.mockResolvedValue(Buffer.from(bytes))
    mocks.uploadFile.mockRejectedValue(new Error('S3 connection refused'))

    const job = makeJob({ jobId: 'job-upload-fail', inputKey: 'inputs/a.pdf', level: CompressionLevel.RECOMMENDED })

    await expect(processCompressJob(job)).rejects.toThrow('S3 connection refused')

    expect(mocks.prismaUpdate).toHaveBeenCalledWith({
      where: { id: 'job-upload-fail' },
      data: { status: JobStatus.FAILED, errorMessage: 'S3 connection refused' },
    })
  })
})
