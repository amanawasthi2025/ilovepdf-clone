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

function makeFile(
  name: string,
  options: { type?: string; size?: number; validMagic?: boolean } = {},
): File {
  const { type = 'application/pdf', size = 512, validMagic = true } = options
  const buf = Buffer.alloc(size)
  if (validMagic) buf.write('%PDF', 0, 'ascii')
  return new File([buf], name, { type })
}

function buildRequest(files: File[]): NextRequest {
  const form = new FormData()
  for (const file of files) form.append('files', file)
  return new NextRequest('http://localhost/api/merge/jobs', {
    method: 'POST',
    body: form,
  })
}

describe('POST /api/merge/jobs', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 400 MINIMUM_FILES_REQUIRED when fewer than 2 files are submitted', async () => {
    const res = await POST(buildRequest([makeFile('a.pdf')]))
    const body = (await res.json()) as { error: string }
    expect(res.status).toBe(400)
    expect(body.error).toBe('MINIMUM_FILES_REQUIRED')
  })

  it('returns 400 MAXIMUM_FILES_EXCEEDED when more than 10 files are submitted', async () => {
    const files = Array.from({ length: 11 }, (_, i) => makeFile(`file${i}.pdf`))
    const res = await POST(buildRequest(files))
    const body = (await res.json()) as { error: string }
    expect(res.status).toBe(400)
    expect(body.error).toBe('MAXIMUM_FILES_EXCEEDED')
  })

  it('returns 400 INVALID_FILE_TYPE when a file has wrong MIME type', async () => {
    const files = [makeFile('a.pdf'), makeFile('b.txt', { type: 'text/plain' })]
    const res = await POST(buildRequest(files))
    const body = (await res.json()) as { error: string }
    expect(res.status).toBe(400)
    expect(body.error).toBe('INVALID_FILE_TYPE')
  })

  it('returns 400 INVALID_FILE_TYPE when a file has correct MIME but wrong magic bytes', async () => {
    const files = [makeFile('a.pdf'), makeFile('b.pdf', { validMagic: false })]
    const res = await POST(buildRequest(files))
    const body = (await res.json()) as { error: string }
    expect(res.status).toBe(400)
    expect(body.error).toBe('INVALID_FILE_TYPE')
  })

  it('returns 413 FILE_TOO_LARGE when a single file exceeds the per-file limit', async () => {
    const oversized = makeFile('big.pdf', { size: 52_428_801 })
    const files = [makeFile('a.pdf'), oversized]
    const res = await POST(buildRequest(files))
    const body = (await res.json()) as { error: string }
    expect(res.status).toBe(413)
    expect(body.error).toBe('FILE_TOO_LARGE')
  })

  it('returns 413 TOTAL_SIZE_EXCEEDED when combined size exceeds the total limit', async () => {
    // Lower the total limit so two small files exceed it without needing large buffers
    const savedTotal = env.MAX_TOTAL_SIZE_BYTES
    env.MAX_TOTAL_SIZE_BYTES = 512
    try {
      const files = [makeFile('a.pdf'), makeFile('b.pdf')] // 512 bytes each → combined 1024 > 512
      const res = await POST(buildRequest(files))
      const body = (await res.json()) as { error: string }
      expect(res.status).toBe(413)
      expect(body.error).toBe('TOTAL_SIZE_EXCEEDED')
    } finally {
      env.MAX_TOTAL_SIZE_BYTES = savedTotal
    }
  })

  it('returns 202 with jobId when 2 valid PDFs are submitted', async () => {
    const files = [makeFile('a.pdf'), makeFile('b.pdf')]
    const res = await POST(buildRequest(files))
    const body = (await res.json()) as { jobId: string }
    expect(res.status).toBe(202)
    expect(body.jobId).toBe('test-job-id')
  })

  it('associates the job with the session user id when a session exists', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'user-123' } } as never)
    const files = [makeFile('a.pdf'), makeFile('b.pdf')]
    await POST(buildRequest(files))
    expect(vi.mocked(prisma.job.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-123' }),
      }),
    )
  })

  it('leaves the job unassociated when no session exists', async () => {
    const files = [makeFile('a.pdf'), makeFile('b.pdf')]
    await POST(buildRequest(files))
    expect(vi.mocked(prisma.job.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: undefined }),
      }),
    )
  })
})
