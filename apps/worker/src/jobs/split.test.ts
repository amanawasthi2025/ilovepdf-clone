import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Job } from 'bullmq'
import { JobStatus } from '@ilovepdf/shared'
import type { SplitJobPayload } from '@ilovepdf/shared'

const mocks = vi.hoisted(() => {
  const sourceDoc = { __tag: 'sourceDoc' }
  const rangeDoc = {
    copyPages: vi.fn(),
    addPage: vi.fn(),
    save: vi.fn(),
  }
  const zipInstance = {
    file: vi.fn(),
    generateAsync: vi.fn(),
  }
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
    pdfCreate: vi.fn(),
    pdfLoad: vi.fn(),
    sourceDoc,
    rangeDoc,
    zipInstance,
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

vi.mock('pdf-lib', () => ({
  PDFDocument: {
    create: mocks.pdfCreate,
    load: mocks.pdfLoad,
  },
}))

vi.mock('jszip', () => ({
  default: vi.fn().mockImplementation(() => mocks.zipInstance),
}))

import { processSplitJob } from './split.js'

function makeJob(data: SplitJobPayload): Job<SplitJobPayload> {
  return { data, name: 'split', id: 'bq-job-1' } as unknown as Job<SplitJobPayload>
}

const VALID_PDF_BUFFER = Buffer.from('%PDFtest-content')

describe('processSplitJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.loggerChild.mockReturnValue(mocks.childLogger)

    mocks.prismaFindUnique.mockResolvedValue({ correlationId: 'corr-123' })
    mocks.prismaUpdate.mockResolvedValue(undefined)
    mocks.downloadFile.mockResolvedValue(VALID_PDF_BUFFER)
    mocks.uploadFile.mockResolvedValue(undefined)

    mocks.rangeDoc.copyPages.mockResolvedValue([{}])
    mocks.rangeDoc.addPage.mockReturnValue(undefined)
    mocks.rangeDoc.save.mockResolvedValue(new Uint8Array([37, 80, 68, 70]))

    mocks.pdfCreate.mockResolvedValue(mocks.rangeDoc)
    mocks.pdfLoad.mockResolvedValue(mocks.sourceDoc)

    mocks.zipInstance.file.mockReturnValue(undefined)
    mocks.zipInstance.generateAsync.mockResolvedValue(Buffer.from('PK-zip-bytes'))
  })

  it('extracts the correct page indices per range and archives one PDF per range', async () => {
    const job = makeJob({ jobId: 'job-001', inputKey: 'inputs/a.pdf', ranges: '1-2,3-3' })

    await processSplitJob(job)

    expect(mocks.downloadFile).toHaveBeenCalledWith('inputs/a.pdf')
    expect(mocks.pdfLoad).toHaveBeenCalledOnce()
    expect(mocks.pdfCreate).toHaveBeenCalledTimes(2)

    expect(mocks.rangeDoc.copyPages).toHaveBeenNthCalledWith(1, mocks.sourceDoc, [0, 1])
    expect(mocks.rangeDoc.copyPages).toHaveBeenNthCalledWith(2, mocks.sourceDoc, [2])

    expect(mocks.zipInstance.file).toHaveBeenNthCalledWith(1, 'split-1-2.pdf', expect.any(Uint8Array))
    expect(mocks.zipInstance.file).toHaveBeenNthCalledWith(2, 'split-3-3.pdf', expect.any(Uint8Array))

    expect(mocks.uploadFile).toHaveBeenCalledWith(
      expect.stringMatching(/^outputs\/.+\.zip$/),
      expect.any(Buffer),
      'application/zip',
    )

    const [firstUpdate, secondUpdate] = mocks.prismaUpdate.mock.calls as [
      [{ where: { id: string }; data: { status: string } }],
      [{ where: { id: string }; data: { status: string; outputKey: string } }],
    ]
    expect(firstUpdate[0].data.status).toBe(JobStatus.PROCESSING)
    expect(secondUpdate[0].data.status).toBe(JobStatus.COMPLETED)
    expect(secondUpdate[0].data.outputKey).toMatch(/^outputs\/.+\.zip$/)
  })

  it('updates to FAILED when the downloaded file has invalid magic bytes', async () => {
    mocks.downloadFile.mockResolvedValue(Buffer.from('not-a-pdf-content'))
    const job = makeJob({ jobId: 'job-002', inputKey: 'inputs/bad.pdf', ranges: '1-1' })

    await expect(processSplitJob(job)).rejects.toThrow('not a valid PDF')

    const updateCalls = mocks.prismaUpdate.mock.calls as Array<
      [{ where: { id: string }; data: { status: string; errorMessage?: string } }]
    >
    const failedCall = updateCalls.find((c) => c[0].data.status === (JobStatus.FAILED as string))
    expect(failedCall).toBeDefined()
    expect(failedCall![0].data.errorMessage).toContain('not a valid PDF')
  })

  it('updates to FAILED when pdf-lib fails to load the source PDF', async () => {
    mocks.pdfLoad.mockRejectedValue(new Error('Invalid PDF structure'))
    const job = makeJob({ jobId: 'job-003', inputKey: 'inputs/corrupt.pdf', ranges: '1-1' })

    await expect(processSplitJob(job)).rejects.toThrow('Invalid PDF structure')

    expect(mocks.prismaUpdate).toHaveBeenCalledWith({
      where: { id: 'job-003' },
      data: { status: JobStatus.FAILED, errorMessage: 'Invalid PDF structure' },
    })
  })

  it('updates to FAILED when MinIO upload of the ZIP throws', async () => {
    mocks.uploadFile.mockRejectedValue(new Error('S3 connection refused'))
    const job = makeJob({ jobId: 'job-004', inputKey: 'inputs/a.pdf', ranges: '1-1' })

    await expect(processSplitJob(job)).rejects.toThrow('S3 connection refused')

    expect(mocks.prismaUpdate).toHaveBeenCalledWith({
      where: { id: 'job-004' },
      data: { status: JobStatus.FAILED, errorMessage: 'S3 connection refused' },
    })
  })

  it('updates to FAILED when ZIP generation throws', async () => {
    mocks.zipInstance.generateAsync.mockRejectedValue(new Error('compression failure'))
    const job = makeJob({ jobId: 'job-005', inputKey: 'inputs/a.pdf', ranges: '1-1' })

    await expect(processSplitJob(job)).rejects.toThrow('compression failure')

    expect(mocks.prismaUpdate).toHaveBeenCalledWith({
      where: { id: 'job-005' },
      data: { status: JobStatus.FAILED, errorMessage: 'compression failure' },
    })
  })
})
