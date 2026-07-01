// @vitest-environment node
import { NextRequest } from 'next/server'
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
import { prisma } from '@/lib/db'
import { POST } from './route'

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47])
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff])

function makePngFile(
  name: string,
  options: { size?: number; validMagic?: boolean } = {},
): File {
  const { size = 512, validMagic = true } = options
  const buf = Buffer.alloc(size)
  if (validMagic) PNG_MAGIC.copy(buf, 0)
  return new File([buf], name, { type: 'image/png' })
}

function makeJpegFile(
  name: string,
  options: { size?: number; validMagic?: boolean } = {},
): File {
  const { size = 512, validMagic = true } = options
  const buf = Buffer.alloc(size)
  if (validMagic) JPEG_MAGIC.copy(buf, 0)
  return new File([buf], name, { type: 'image/jpeg' })
}

function buildRequest(files: File[]): NextRequest {
  const form = new FormData()
  for (const file of files) form.append('files', file)
  return new NextRequest('http://localhost/api/image-to-pdf/jobs', {
    method: 'POST',
    body: form,
  })
}

describe('POST /api/image-to-pdf/jobs', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 400 MINIMUM_FILES_REQUIRED when 0 files are submitted', async () => {
    const res = await POST(buildRequest([]))
    const body = (await res.json()) as { error: string }
    expect(res.status).toBe(400)
    expect(body.error).toBe('MINIMUM_FILES_REQUIRED')
  })

  it('returns 400 MAXIMUM_FILES_EXCEEDED when more than 10 files are submitted', async () => {
    const files = Array.from({ length: 11 }, (_, i) => makePngFile(`file${i}.png`))
    const res = await POST(buildRequest(files))
    const body = (await res.json()) as { error: string }
    expect(res.status).toBe(400)
    expect(body.error).toBe('MAXIMUM_FILES_EXCEEDED')
  })

  it('returns 400 INVALID_FILE_TYPE when a file has wrong MIME type', async () => {
    const files = [makePngFile('a.png'), new File([Buffer.alloc(512)], 'b.txt', { type: 'text/plain' })]
    const res = await POST(buildRequest(files))
    const body = (await res.json()) as { error: string }
    expect(res.status).toBe(400)
    expect(body.error).toBe('INVALID_FILE_TYPE')
  })

  it('returns 400 INVALID_FILE_TYPE when a file has correct MIME but wrong magic bytes', async () => {
    const files = [makePngFile('a.png'), makePngFile('b.png', { validMagic: false })]
    const res = await POST(buildRequest(files))
    const body = (await res.json()) as { error: string }
    expect(res.status).toBe(400)
    expect(body.error).toBe('INVALID_FILE_TYPE')
  })

  it('returns 413 FILE_TOO_LARGE when a single file exceeds the per-file limit', async () => {
    const oversized = makePngFile('big.png', { size: 52_428_801 })
    const res = await POST(buildRequest([oversized]))
    const body = (await res.json()) as { error: string }
    expect(res.status).toBe(413)
    expect(body.error).toBe('FILE_TOO_LARGE')
  })

  it('returns 413 TOTAL_SIZE_EXCEEDED when combined size exceeds the total limit', async () => {
    const savedTotal = env.MAX_TOTAL_SIZE_BYTES
    env.MAX_TOTAL_SIZE_BYTES = 512
    try {
      const files = [makePngFile('a.png'), makePngFile('b.png')] // 512 bytes each → combined 1024 > 512
      const res = await POST(buildRequest(files))
      const body = (await res.json()) as { error: string }
      expect(res.status).toBe(413)
      expect(body.error).toBe('TOTAL_SIZE_EXCEEDED')
    } finally {
      env.MAX_TOTAL_SIZE_BYTES = savedTotal
    }
  })

  it('returns 202 with jobId when 1 valid PNG is submitted', async () => {
    const res = await POST(buildRequest([makePngFile('a.png')]))
    const body = (await res.json()) as { jobId: string }
    expect(res.status).toBe(202)
    expect(body.jobId).toBe('test-job-id')
  })

  it('returns 202 with jobId when mixed valid PNG/JPEG images are submitted, in upload order', async () => {
    const files = [makePngFile('a.png'), makeJpegFile('b.jpg'), makePngFile('c.png')]
    const res = await POST(buildRequest(files))
    const body = (await res.json()) as { jobId: string }
    expect(res.status).toBe(202)
    expect(body.jobId).toBe('test-job-id')
    expect(vi.mocked(prisma.job.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobType: 'IMAGE_TO_PDF',
          inputKeys: expect.arrayContaining([
            expect.stringMatching(/^inputs\/.+\.png$/),
            expect.stringMatching(/^inputs\/.+\.jpg$/),
          ]),
        }),
      }),
    )
  })

  it('associates the job with the session user id when a session exists', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'user-123' } } as never)
    const res = await POST(buildRequest([makePngFile('a.png')]))
    expect(res.status).toBe(202)
    expect(vi.mocked(prisma.job.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-123' }),
      }),
    )
  })

  it('leaves the job unassociated when no session exists', async () => {
    await POST(buildRequest([makePngFile('a.png')]))
    expect(vi.mocked(prisma.job.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: undefined }),
      }),
    )
  })
})
