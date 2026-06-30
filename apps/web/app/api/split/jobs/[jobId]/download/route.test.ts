// @vitest-environment node
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    job: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@/lib/storage', () => ({
  getPresignedDownloadUrl: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}))

import { prisma } from '@/lib/db'
import { getPresignedDownloadUrl } from '@/lib/storage'
import { GET } from './route'

const mockFindUnique = vi.mocked(prisma.job.findUnique)
const mockGetPresignedUrl = vi.mocked(getPresignedDownloadUrl)

function buildRequest(jobId: string): NextRequest {
  return new NextRequest(`http://localhost/api/split/jobs/${jobId}/download`)
}

describe('GET /api/split/jobs/:jobId/download', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 200 with pre-signed url when job is COMPLETED', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'job-abc',
      status: 'COMPLETED',
      outputKey: 'outputs/abc.zip',
      correlationId: 'corr-123',
    } as never)
    mockGetPresignedUrl.mockResolvedValue('https://storage.example.com/outputs/abc.zip?sig=xxx')

    const res = await GET(buildRequest('job-abc'), { params: { jobId: 'job-abc' } })
    const body = await res.json() as Record<string, unknown>

    expect(res.status).toBe(200)
    expect(body.url).toBe('https://storage.example.com/outputs/abc.zip?sig=xxx')
    expect(mockGetPresignedUrl).toHaveBeenCalledWith('outputs/abc.zip')
  })

  it('returns 409 JOB_NOT_COMPLETE with current status when job is not COMPLETED', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'job-abc',
      status: 'PROCESSING',
      outputKey: null,
      correlationId: 'corr-123',
    } as never)

    const res = await GET(buildRequest('job-abc'), { params: { jobId: 'job-abc' } })
    const body = await res.json() as Record<string, unknown>

    expect(res.status).toBe(409)
    expect(body.error).toBe('JOB_NOT_COMPLETE')
    expect(body.status).toBe('PROCESSING')
  })

  it('returns 409 JOB_NOT_COMPLETE when job is PENDING', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'job-abc',
      status: 'PENDING',
      outputKey: null,
      correlationId: 'corr-123',
    } as never)

    const res = await GET(buildRequest('job-abc'), { params: { jobId: 'job-abc' } })
    const body = await res.json() as Record<string, unknown>

    expect(res.status).toBe(409)
    expect(body.error).toBe('JOB_NOT_COMPLETE')
    expect(body.status).toBe('PENDING')
  })

  it('returns 404 JOB_NOT_FOUND when no job exists with the given id', async () => {
    mockFindUnique.mockResolvedValue(null)

    const res = await GET(buildRequest('nonexistent'), { params: { jobId: 'nonexistent' } })
    const body = await res.json() as Record<string, unknown>

    expect(res.status).toBe(404)
    expect(body.error).toBe('JOB_NOT_FOUND')
  })
})
