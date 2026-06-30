import { describe, expect, it } from 'vitest'
import { MAX_FILE_SIZE_BYTES, formatBytes, isValidRangesSyntax } from './validation'

describe('formatBytes', () => {
  it('formats zero bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
  })

  it('formats bytes below 1 KB', () => {
    expect(formatBytes(512)).toBe('512 B')
  })

  it('formats exactly 1 KB', () => {
    expect(formatBytes(1_024)).toBe('1.0 KB')
  })

  it('formats fractional KB', () => {
    expect(formatBytes(1_536)).toBe('1.5 KB')
  })

  it('formats exactly 1 MB', () => {
    expect(formatBytes(1_048_576)).toBe('1.0 MB')
  })

  it('formats fractional MB', () => {
    expect(formatBytes(2_621_440)).toBe('2.5 MB')
  })
})

describe('constants', () => {
  it('MAX_FILE_SIZE_BYTES is 50 MB', () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(50 * 1_024 * 1_024)
  })
})

describe('isValidRangesSyntax', () => {
  it('accepts a single range', () => {
    expect(isValidRangesSyntax('1-3')).toBe(true)
  })

  it('accepts multiple comma-separated ranges', () => {
    expect(isValidRangesSyntax('1-3,4-6,7-10')).toBe(true)
  })

  it('rejects an empty string', () => {
    expect(isValidRangesSyntax('')).toBe(false)
  })

  it('rejects whitespace-only input', () => {
    expect(isValidRangesSyntax('   ')).toBe(false)
  })

  it('rejects ranges with internal spaces', () => {
    expect(isValidRangesSyntax('1-3, 4-6')).toBe(false)
  })

  it('rejects a single page number with no dash', () => {
    expect(isValidRangesSyntax('1,2,3')).toBe(false)
  })

  it('rejects a trailing comma', () => {
    expect(isValidRangesSyntax('1-3,')).toBe(false)
  })

  it('rejects non-numeric input', () => {
    expect(isValidRangesSyntax('a-b')).toBe(false)
  })

  it('tolerates surrounding whitespace', () => {
    expect(isValidRangesSyntax('  1-3,4-6  ')).toBe(true)
  })
})
