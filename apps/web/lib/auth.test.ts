// @vitest-environment node
import bcrypt from 'bcryptjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@auth/prisma-adapter', () => ({
  PrismaAdapter: vi.fn(() => ({})),
}))

vi.mock('next-auth', () => ({
  default: vi.fn(() => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() })),
}))

vi.mock('next-auth/providers/credentials', () => ({
  default: vi.fn((config: unknown) => config),
}))

import NextAuth, { type NextAuthConfig } from 'next-auth'
import { prisma } from '@/lib/db'
import { authorizeCredentials } from './auth'

const nextAuthConfig = vi.mocked(NextAuth).mock.calls[0][0] as NextAuthConfig

describe('authorizeCredentials', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns null when email is missing', async () => {
    expect(await authorizeCredentials({ password: 'password123' })).toBeNull()
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it('returns null when password is missing', async () => {
    expect(await authorizeCredentials({ email: 'user@example.com' })).toBeNull()
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it('returns null when no user matches the email', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    const result = await authorizeCredentials({
      email: 'nobody@example.com',
      password: 'password123',
    })
    expect(result).toBeNull()
  })

  it('looks up the email lowercased and trimmed', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    await authorizeCredentials({ email: '  User@Example.com  ', password: 'password123' })
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'user@example.com' },
    })
  })

  it('returns null when the password does not match the stored hash', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 10)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const result = await authorizeCredentials({
      email: 'user@example.com',
      password: 'wrong-password',
    })
    expect(result).toBeNull()
  })

  it('returns the user id and email when the password matches', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 10)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const result = await authorizeCredentials({
      email: 'user@example.com',
      password: 'correct-password',
    })
    expect(result).toEqual({ id: 'user-1', email: 'user@example.com' })
  })
})

describe('jwt callback', () => {
  it('copies the authenticated user id onto the token on sign-in', async () => {
    const token = await nextAuthConfig.callbacks!.jwt!({
      token: {},
      user: { id: 'user-1', email: 'user@example.com' },
    } as never)
    expect(token).toMatchObject({ id: 'user-1' })
  })

  it('leaves an existing token unchanged on subsequent requests (no user)', async () => {
    const token = await nextAuthConfig.callbacks!.jwt!({
      token: { id: 'user-1' },
      user: undefined,
    } as never)
    expect(token).toMatchObject({ id: 'user-1' })
  })
})

describe('session callback', () => {
  it("copies the token's user id onto session.user.id", async () => {
    const session = await nextAuthConfig.callbacks!.session!({
      session: { user: { email: 'user@example.com' }, expires: '2026-01-01T00:00:00.000Z' },
      token: { id: 'user-1' },
    } as never)
    expect(session.user?.id).toBe('user-1')
  })

  it('leaves session.user.id unset when the token has no id', async () => {
    const session = await nextAuthConfig.callbacks!.session!({
      session: { user: { email: 'user@example.com' }, expires: '2026-01-01T00:00:00.000Z' },
      token: {},
    } as never)
    expect(session.user?.id).toBeUndefined()
  })
})
