import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/auth', () => ({ auth: vi.fn(), signOut: vi.fn() }))

import { auth } from '@/lib/auth'
import Nav from './nav'

const mockAuth = vi.mocked(auth)

describe('Nav', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a History link, pointing at /history, when a session exists', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'user@example.com' } } as never)

    render(await Nav())

    const link = screen.getByRole('link', { name: 'History' })
    expect(link).toHaveAttribute('href', '/history')
  })

  it('does not show a History link when logged out', async () => {
    mockAuth.mockResolvedValue(null as never)

    render(await Nav())

    expect(screen.queryByRole('link', { name: 'History' })).not.toBeInTheDocument()
  })
})
