import { describe, expect, it } from 'vitest'
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  isValidEmail,
  isValidPassword,
} from './validation'

describe('isValidEmail', () => {
  it('accepts a well-formed email', () => {
    expect(isValidEmail('user@example.com')).toBe(true)
  })

  it('rejects an email with no @', () => {
    expect(isValidEmail('not-an-email')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isValidEmail('')).toBe(false)
  })
})

describe('isValidPassword', () => {
  it('rejects a password under the minimum length', () => {
    expect(isValidPassword('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toBe(false)
  })

  it('accepts a password at the minimum length', () => {
    expect(isValidPassword('a'.repeat(MIN_PASSWORD_LENGTH))).toBe(true)
  })

  it('accepts a password at the maximum length', () => {
    expect(isValidPassword('a'.repeat(MAX_PASSWORD_LENGTH))).toBe(true)
  })

  it('rejects a password over the maximum length', () => {
    expect(isValidPassword('a'.repeat(MAX_PASSWORD_LENGTH + 1))).toBe(false)
  })
})
