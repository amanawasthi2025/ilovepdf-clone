import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Job } from 'bullmq'
import { JobStatus } from '@ilovepdf/shared'
import type { MergeJobPayload } from '@ilovepdf/shared'

const mocks = vi.hoisted(() => {
  const mergedDoc = {
    copyPages: vi.fn(),
    addPage: vi.fn(),
    save: vi.fn(),
    getPageCount: vi.fn(),
  }
  const sourceDoc = {
    getPageIndices: vi.fn(),
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
    mergedDoc,
    sourceDoc,
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

import { processMergeJob } from './merge.js'

function makeJob(data: MergeJobPayload): Job<MergeJobPayload> {
  return { data, name: 'merge', id: 'bq-job-1' } as unknown as Job<MergeJobPayload>
}

const VALID_PDF_BUFFER = Buffer.from('%PDFtest-content')

describe('processMergeJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.loggerChild.mockReturnValue(mocks.childLogger)

    mocks.prismaFindUnique.mockResolvedValue({ correlationId: 'corr-123' })
    mocks.prismaUpdate.mockResolvedValue(undefined)
    mocks.downloadFile.mockResolvedValue(VALID_PDF_BUFFER)
    mocks.uploadFile.mockResolvedValue(undefined)

    mocks.sourceDoc.getPageIndices.mockReturnValue([0])
    mocks.mergedDoc.copyPages.mockResolvedValue([{}])
    mocks.mergedDoc.addPage.mockReturnValue(undefined)
    mocks.mergedDoc.save.mockResolvedValue(new Uint8Array([37, 80, 68, 70]))
    mocks.mergedDoc.getPageCount.mockReturnValue(2)

    mocks.pdfCreate.mockResolvedValue(mocks.mergedDoc)
    mocks.pdfLoad.mockResolvedValue(mocks.sourceDoc)
  })

  it('updates to PROCESSING then COMPLETED and uploads the merged PDF', async () => {
    const job = makeJob({ jobId: 'job-001', inputKeys: ['inputs/a.pdf', 'inputs/b.pdf'] })

    await processMergeJob(job)

    expect(mocks.downloadFile).toHaveBeenCalledTimes(2)
    expect(mocks.pdfLoad).toHaveBeenCalledTimes(2)
    expect(mocks.uploadFile).toHaveBeenCalledOnce()

    const [firstUpdate, secondUpdate] = mocks.prismaUpdate.mock.calls as [
      [{ where: { id: string }; data: { status: string } }],
      [{ where: { id: string }; data: { status: string; outputKey: string } }],
    ]
    expect(firstUpdate[0].data.status).toBe(JobStatus.PROCESSING)
    expect(secondUpdate[0].data.status).toBe(JobStatus.COMPLETED)
    expect(secondUpdate[0].data.outputKey).toMatch(/^outputs\/.+\.pdf$/)
  })

  it('updates to FAILED when a downloaded file has invalid magic bytes', async () => {
    mocks.downloadFile.mockResolvedValue(Buffer.from('not-a-pdf-content'))
    const job = makeJob({ jobId: 'job-002', inputKeys: ['inputs/bad.pdf'] })

    await expect(processMergeJob(job)).rejects.toThrow('not a valid PDF')

    const updateCalls = mocks.prismaUpdate.mock.calls as Array<
      [{ where: { id: string }; data: { status: string; errorMessage?: string } }]
    >
    const failedCall = updateCalls.find((c) => c[0].data.status === (JobStatus.FAILED as string))
    expect(failedCall).toBeDefined()
    expect(failedCall![0].data.errorMessage).toContain('not a valid PDF')
  })

  it('updates to FAILED when pdf-lib fails to load a PDF', async () => {
    mocks.pdfLoad.mockRejectedValue(new Error('Invalid PDF structure'))
    const job = makeJob({ jobId: 'job-003', inputKeys: ['inputs/corrupt.pdf'] })

    await expect(processMergeJob(job)).rejects.toThrow('Invalid PDF structure')

    expect(mocks.prismaUpdate).toHaveBeenCalledWith({
      where: { id: 'job-003' },
      data: { status: JobStatus.FAILED, errorMessage: 'Invalid PDF structure' },
    })
  })

  it('updates to FAILED when MinIO upload throws', async () => {
    mocks.uploadFile.mockRejectedValue(new Error('S3 connection refused'))
    const job = makeJob({ jobId: 'job-004', inputKeys: ['inputs/a.pdf'] })

    await expect(processMergeJob(job)).rejects.toThrow('S3 connection refused')

    expect(mocks.prismaUpdate).toHaveBeenCalledWith({
      where: { id: 'job-004' },
      data: { status: JobStatus.FAILED, errorMessage: 'S3 connection refused' },
    })
  })
})
