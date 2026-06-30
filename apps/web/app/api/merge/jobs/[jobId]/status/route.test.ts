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

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}))

import { prisma } from '@/lib/db'
import { GET } from './route'

const mockFindUnique = vi.mocked(prisma.job.findUnique)

function buildRequest(jobId: string): NextRequest {
  return new NextRequest(`http://localhost/api/merge/jobs/${jobId}/status`)
}

const FIXED_DATE = new Date('2026-06-30T10:00:00.000Z')

describe('GET /api/merge/jobs/:jobId/status', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 200 with job fields when the job exists', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'job-abc',
      status: 'COMPLETED',
      createdAt: FIXED_DATE,
      updatedAt: FIXED_DATE,
      errorMessage: null,
    } as never)

    const res = await GET(buildRequest('job-abc'), { params: { jobId: 'job-abc' } })
    const body = await res.json() as Record<string, unknown>

    expect(res.status).toBe(200)
    expect(body.jobId).toBe('job-abc')
    expect(body.status).toBe('COMPLETED')
    expect(body.errorMessage).toBeNull()
  })

  it('returns 404 JOB_NOT_FOUND when no job exists with the given id', async () => {
    mockFindUnique.mockResolvedValue(null)

    const res = await GET(buildRequest('nonexistent'), { params: { jobId: 'nonexistent' } })
    const body = await res.json() as Record<string, unknown>

    expect(res.status).toBe(404)
    expect(body.error).toBe('JOB_NOT_FOUND')
  })

  it('returns FAILED status with errorMessage populated', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'job-fail',
      status: 'FAILED',
      createdAt: FIXED_DATE,
      updatedAt: FIXED_DATE,
      errorMessage: 'Corrupt PDF input',
    } as never)

    const res = await GET(buildRequest('job-fail'), { params: { jobId: 'job-fail' } })
    const body = await res.json() as Record<string, unknown>

    expect(res.status).toBe(200)
    expect(body.status).toBe('FAILED')
    expect(body.errorMessage).toBe('Corrupt PDF input')
  })
})
