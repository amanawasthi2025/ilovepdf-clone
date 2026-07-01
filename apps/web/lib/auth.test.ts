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

import { prisma } from '@/lib/db'
import { authorizeCredentials } from './auth'

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
