import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import HomePage from './page'

describe('HomePage', () => {
  it('links to all four tools', () => {
    render(<HomePage />)

    expect(screen.getByRole('link', { name: /merge pdf/i })).toHaveAttribute('href', '/merge')
    expect(screen.getByRole('link', { name: /split pdf/i })).toHaveAttribute('href', '/split')
    expect(screen.getByRole('link', { name: /compress pdf/i })).toHaveAttribute('href', '/compress')
    expect(screen.getByRole('link', { name: /pdf to image/i })).toHaveAttribute(
      'href',
      '/pdf-to-image',
    )
  })
})
