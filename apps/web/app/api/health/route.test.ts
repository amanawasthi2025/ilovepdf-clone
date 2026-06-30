import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'

vi.mock('@/lib/db', () => ({
  checkDatabaseConnection: vi.fn(),
}))

import { checkDatabaseConnection } from '@/lib/db'

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 ok when database is reachable', async () => {
    vi.mocked(checkDatabaseConnection).mockResolvedValueOnce(true)

    const response = await GET()
    const body = (await response.json()) as { status: string; database: string; timestamp: string }

    expect(response.status).toBe(200)
    expect(body.status).toBe('ok')
    expect(body.database).toBe('ok')
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('returns 503 degraded when database is unreachable', async () => {
    vi.mocked(checkDatabaseConnection).mockResolvedValueOnce(false)

    const response = await GET()
    const body = (await response.json()) as { status: string; database: string; timestamp: string }

    expect(response.status).toBe(503)
    expect(body.status).toBe('degraded')
    expect(body.database).toBe('error')
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
