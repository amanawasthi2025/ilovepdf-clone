// @vitest-environment node
import { NextRequest } from 'next/server'
import { EncryptedPDFError, PDFDocument } from 'pdf-lib'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({
  env: {
    MAX_FILE_SIZE_BYTES: 52_428_800,
    MAX_TOTAL_SIZE_BYTES: 209_715_200,
    FILE_TTL_SECONDS: 3600,
    MINIO_BUCKET_NAME: 'ilovepdf',
    MINIO_ENDPOINT: 'localhost',
    MINIO_PORT: 9000,
    MINIO_ACCESS_KEY: 'minioadmin',
    MINIO_SECRET_KEY: 'minioadmin',
    MINIO_USE_SSL: false,
    REDIS_URL: 'redis://localhost:6379',
  },
}))

vi.mock('@/lib/storage', () => ({
  ensureBucketExists: vi.fn().mockResolvedValue(undefined),
  uploadFile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/queue', () => ({
  documentProcessingQueue: {
    add: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    job: {
      create: vi.fn().mockResolvedValue({ id: 'test-job-id' }),
      update: vi.fn().mockResolvedValue(undefined),
    },
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}))

vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue(null),
}))

import { auth } from '@/lib/auth'
import { env } from '@/lib/env'
import { documentProcessingQueue } from '@/lib/queue'
import { prisma } from '@/lib/db'
import { POST } from './route'

async function makePdfBuffer(pageCount: number): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) pdf.addPage()
  return Buffer.from(await pdf.save())
}

function makeFile(
  name: string,
  buffer: Buffer,
  options: { type?: string } = {},
): File {
  const { type = 'application/pdf' } = options
  return new File([new Uint8Array(buffer)], name, { type })
}

function buildRequest(file: File | null, format: string | null): NextRequest {
  const form = new FormData()
  if (file) form.append('file', file)
  if (format !== null) form.append('format', format)
  return new NextRequest('http://localhost/api/pdf-to-image/jobs', {
    method: 'POST',
    body: form,
  })
}

describe('POST /api/pdf-to-image/jobs', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 400 FILE_REQUIRED when no file is submitted', async () => {
    const res = await POST(buildRequest(null, 'PNG'))
    const body = (await res.json()) as { error: string }
    expect(res.status).toBe(400)
    expect(body.error).toBe('FILE_REQUIRED')
  })

  it('returns 400 INVALID_FILE_TYPE when the file has the wrong MIME type', async () => {
    const file = makeFile('a.txt', Buffer.from('not a pdf'), { type: 'text/plain' })
    const res = await POST(buildRequest(file, 'PNG'))
    const body = (await res.json()) as { error: string }
    expect(res.status).toBe(400)
    expect(body.error).toBe('INVALID_FILE_TYPE')
  })

  it('returns 400 INVALID_FILE_TYPE when MIME is correct but magic bytes are wrong', async () => {
    const file = makeFile('a.pdf', Buffer.alloc(64))
    const res = await POST(buildRequest(file, 'PNG'))
    const body = (await res.json()) as { error: string }
    expect(res.status).toBe(400)
    expect(body.error).toBe('INVALID_FILE_TYPE')
  })

  it('returns 413 FILE_TOO_LARGE when the file exceeds the size limit', async () => {
    const savedLimit = env.MAX_FILE_SIZE_BYTES
    env.MAX_FILE_SIZE_BYTES = 10
    try {
      const buffer = await makePdfBuffer(3)
      const file = makeFile('a.pdf', buffer)
      const res = await POST(buildRequest(file, 'PNG'))
      const body = (await res.json()) as { error: string }
      expect(res.status).toBe(413)
      expect(body.error).toBe('FILE_TOO_LARGE')
    } finally {
      env.MAX_FILE_SIZE_BYTES = savedLimit
    }
  })

  it('returns 400 INVALID_IMAGE_FORMAT when format is not one of PNG/JPEG', async () => {
    const buffer = await makePdfBuffer(3)
    const file = makeFile('a.pdf', buffer)
    const res = await POST(buildRequest(file, 'GIF'))
    const body = (await res.json()) as { error: string }
    expect(res.status).toBe(400)
    expect(body.error).toBe('INVALID_IMAGE_FORMAT')
  })

  it('returns 400 INVALID_IMAGE_FORMAT when format is omitted', async () => {
    const buffer = await makePdfBuffer(3)
    const file = makeFile('a.pdf', buffer)
    const res = await POST(buildRequest(file, null))
    const body = (await res.json()) as { error: string }
    expect(res.status).toBe(400)
    expect(body.error).toBe('INVALID_IMAGE_FORMAT')
  })

  it('returns 400 UNSUPPORTED_ENCRYPTED_PDF when the PDF cannot be loaded due to encryption', async () => {
    const buffer = await makePdfBuffer(3)
    const file = makeFile('a.pdf', buffer)
    const loadSpy = vi.spyOn(PDFDocument, 'load').mockRejectedValueOnce(new EncryptedPDFError())
    const res = await POST(buildRequest(file, 'PNG'))
    const body = (await res.json()) as { error: string }
    expect(res.status).toBe(400)
    expect(body.error).toBe('UNSUPPORTED_ENCRYPTED_PDF')
    loadSpy.mockRestore()
  })

  it('returns 202 with jobId for a valid PDF and PNG format', async () => {
    const buffer = await makePdfBuffer(3)
    const file = makeFile('a.pdf', buffer)
    const res = await POST(buildRequest(file, 'PNG'))
    const body = (await res.json()) as { jobId: string }
    expect(res.status).toBe(202)
    expect(body.jobId).toBe('test-job-id')
    expect(vi.mocked(prisma.job.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobType: 'PDF_TO_IMAGE',
          imageFormat: 'PNG',
        }),
      }),
    )
    expect(vi.mocked(documentProcessingQueue.add)).toHaveBeenCalledWith(
      'pdf-to-image',
      expect.objectContaining({ jobId: 'test-job-id', format: 'PNG' }),
      expect.anything(),
    )
  })

  it('returns 202 with jobId for a valid PDF and JPEG format', async () => {
    const buffer = await makePdfBuffer(3)
    const file = makeFile('a.pdf', buffer)
    const res = await POST(buildRequest(file, 'JPEG'))
    const body = (await res.json()) as { jobId: string }
    expect(res.status).toBe(202)
    expect(body.jobId).toBe('test-job-id')
    expect(vi.mocked(prisma.job.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ imageFormat: 'JPEG' }),
      }),
    )
  })

  it('associates the job with the session user id when a session exists', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'user-123' } } as never)
    const buffer = await makePdfBuffer(3)
    const file = makeFile('a.pdf', buffer)
    await POST(buildRequest(file, 'PNG'))
    expect(vi.mocked(prisma.job.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-123' }),
      }),
    )
  })

  it('leaves the job unassociated when no session exists', async () => {
    const buffer = await makePdfBuffer(3)
    const file = makeFile('a.pdf', buffer)
    await POST(buildRequest(file, 'PNG'))
    expect(vi.mocked(prisma.job.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: undefined }),
      }),
    )
  })
})
