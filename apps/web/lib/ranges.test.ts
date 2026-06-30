import { describe, expect, it } from 'vitest'
import { parseAndValidateRanges } from './ranges'

describe('parseAndValidateRanges', () => {
  it('parses valid comma-separated ranges in submission order', () => {
    const result = parseAndValidateRanges('1-3,4-6,7-10', 10)
    expect(result.error).toBeUndefined()
    expect(result.ranges).toEqual([
      { start: 1, end: 3 },
      { start: 4, end: 6 },
      { start: 7, end: 10 },
    ])
  })

  it('returns RANGES_REQUIRED for an empty string', () => {
    const result = parseAndValidateRanges('', 10)
    expect(result.error).toBe('RANGES_REQUIRED')
  })

  it('returns RANGES_REQUIRED for a whitespace-only string', () => {
    const result = parseAndValidateRanges('   ', 10)
    expect(result.error).toBe('RANGES_REQUIRED')
  })

  it('returns INVALID_RANGE_FORMAT for non-matching syntax', () => {
    expect(parseAndValidateRanges('abc', 10).error).toBe('INVALID_RANGE_FORMAT')
    expect(parseAndValidateRanges('1-3,4', 10).error).toBe('INVALID_RANGE_FORMAT')
    expect(parseAndValidateRanges('1,2-3', 10).error).toBe('INVALID_RANGE_FORMAT')
    expect(parseAndValidateRanges('1-3,', 10).error).toBe('INVALID_RANGE_FORMAT')
    expect(parseAndValidateRanges('1-3 ,4-6', 10).error).toBe('INVALID_RANGE_FORMAT')
  })

  it('returns RANGE_OUT_OF_BOUNDS when start is less than 1', () => {
    const result = parseAndValidateRanges('0-3', 10)
    expect(result.error).toBe('RANGE_OUT_OF_BOUNDS')
  })

  it('returns RANGE_OUT_OF_BOUNDS when end exceeds the page count', () => {
    const result = parseAndValidateRanges('1-11', 10)
    expect(result.error).toBe('RANGE_OUT_OF_BOUNDS')
  })

  it('returns RANGE_OUT_OF_BOUNDS when start is greater than end', () => {
    const result = parseAndValidateRanges('5-3', 10)
    expect(result.error).toBe('RANGE_OUT_OF_BOUNDS')
  })

  it('allows overlapping ranges', () => {
    const result = parseAndValidateRanges('1-5,3-8', 10)
    expect(result.error).toBeUndefined()
    expect(result.ranges).toHaveLength(2)
  })

  it('allows ranges submitted out of order and preserves submission order', () => {
    const result = parseAndValidateRanges('7-10,1-3', 10)
    expect(result.error).toBeUndefined()
    expect(result.ranges).toEqual([
      { start: 7, end: 10 },
      { start: 1, end: 3 },
    ])
  })

  it('allows a single-page range where start equals end', () => {
    const result = parseAndValidateRanges('5-5', 10)
    expect(result.error).toBeUndefined()
    expect(result.ranges).toEqual([{ start: 5, end: 5 }])
  })
})
