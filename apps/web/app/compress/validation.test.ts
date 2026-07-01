import { describe, expect, it } from 'vitest'
import { MAX_FILE_SIZE_BYTES, formatBytes } from './validation'

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
