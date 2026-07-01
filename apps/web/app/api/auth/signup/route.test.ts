// @vitest-environment node
import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      create: vi.fn().mockResolvedValue({ id: 'test-user-id', email: 'user@example.com' }),
    },
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}))

import { prisma } from '@/lib/db'
import { POST } from './route'

function buildRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/auth/signup', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 201 with id and email for a valid signup', async () => {
    const res = await POST(buildRequest({ email: 'User@Example.com', password: 'password123' }))
    const body = (await res.json()) as { id: string; email: string }
    expect(res.status).toBe(201)
    expect(body).toEqual({ id: 'test-user-id', email: 'user@example.com' })
    expect(vi.mocked(prisma.user.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'user@example.com' }),
      }),
    )
  })

  it('never stores the plaintext password', async () => {
    await POST(buildRequest({ email: 'user@example.com', password: 'password123' }))
    const call = vi.mocked(prisma.user.create).mock.calls[0][0]
    expect(call.data.passwordHash).not.toBe('password123')
    expect(call.data.passwordHash.length).toBeGreaterThan(0)
  })

  it('returns 400 INVALID_EMAIL for a malformed email', async () => {
    const res = await POST(buildRequest({ email: 'not-an-email', password: 'password123' }))
    const body = (await res.json()) as { error: string }
    expect(res.status).toBe(400)
    expect(body.error).toBe('INVALID_EMAIL')
  })

  it('returns 400 PASSWORD_TOO_SHORT for a password under 8 characters', async () => {
    const res = await POST(buildRequest({ email: 'user@example.com', password: 'short' }))
    const body = (await res.json()) as { error: string }
    expect(res.status).toBe(400)
    expect(body.error).toBe('PASSWORD_TOO_SHORT')
  })

  it('returns 400 PASSWORD_TOO_LONG for a password over 72 characters', async () => {
    const res = await POST(
      buildRequest({ email: 'user@example.com', password: 'a'.repeat(73) }),
    )
    const body = (await res.json()) as { error: string }
    expect(res.status).toBe(400)
    expect(body.error).toBe('PASSWORD_TOO_LONG')
  })

  it('returns 409 EMAIL_ALREADY_REGISTERED when the email is already taken', async () => {
    vi.mocked(prisma.user.create).mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.22.0',
      }),
    )
    const res = await POST(buildRequest({ email: 'user@example.com', password: 'password123' }))
    const body = (await res.json()) as { error: string }
    expect(res.status).toBe(409)
    expect(body.error).toBe('EMAIL_ALREADY_REGISTERED')
  })

  it('returns 500 INTERNAL_ERROR when request body is not valid JSON', async () => {
    const req = new NextRequest('http://localhost/api/auth/signup', {
      method: 'POST',
      body: 'not json',
    })
    const res = await POST(req)
    const body = (await res.json()) as { error: string }
    expect(res.status).toBe(500)
    expect(body.error).toBe('INTERNAL_ERROR')
  })
})
