import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db', () => ({ prisma: { job: { findMany: vi.fn() } } }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT')
  }),
}))
vi.mock('./download-button', () => ({
  default: ({ jobId }: { jobId: string }) => <div data-testid={`download-${jobId}`} />,
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { redirect } from 'next/navigation'
import HistoryPage from './page'

const mockAuth = vi.mocked(auth)
const mockFindMany = vi.mocked(prisma.job.findMany)
const mockRedirect = vi.mocked(redirect)

describe('HistoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects to /login when no session exists, without querying jobs', async () => {
    mockAuth.mockResolvedValue(null as never)

    await expect(HistoryPage()).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/login')
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it("queries only the current user's jobs, most recent first, capped to 50", async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } } as never)
    mockFindMany.mockResolvedValue([])

    await HistoryPage()

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, jobType: true, status: true, createdAt: true, errorMessage: true },
    })
  })

  it('renders each job with type, status, and a Download control only for COMPLETED jobs', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } } as never)
    mockFindMany.mockResolvedValue([
      {
        id: 'job-1',
        jobType: 'COMPRESS',
        status: 'COMPLETED',
        createdAt: new Date('2026-07-01T10:00:00Z'),
        errorMessage: null,
      },
      {
        id: 'job-2',
        jobType: 'MERGE',
        status: 'PROCESSING',
        createdAt: new Date('2026-07-01T09:00:00Z'),
        errorMessage: null,
      },
      {
        id: 'job-3',
        jobType: 'SPLIT',
        status: 'FAILED',
        createdAt: new Date('2026-07-01T08:00:00Z'),
        errorMessage: 'Something went wrong',
      },
    ] as never)

    render(await HistoryPage())

    expect(screen.getByText('Compress')).toBeInTheDocument()
    expect(screen.getByText('Merge')).toBeInTheDocument()
    expect(screen.getByText('Split')).toBeInTheDocument()
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()

    expect(screen.getByTestId('download-job-1')).toBeInTheDocument()
    expect(screen.queryByTestId('download-job-2')).not.toBeInTheDocument()
    expect(screen.queryByTestId('download-job-3')).not.toBeInTheDocument()
  })

  it('shows an empty-state message when the user has no jobs', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } } as never)
    mockFindMany.mockResolvedValue([])

    render(await HistoryPage())

    expect(screen.getByText(/haven't submitted any jobs yet/i)).toBeInTheDocument()
  })
})
