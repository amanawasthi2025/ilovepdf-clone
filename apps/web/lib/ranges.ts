export interface ParsedRange {
  start: number
  end: number
}

export type RangeValidationErrorCode =
  | 'RANGES_REQUIRED'
  | 'INVALID_RANGE_FORMAT'
  | 'RANGE_OUT_OF_BOUNDS'

export interface RangeValidationSuccess {
  ranges: ParsedRange[]
  error?: undefined
}

export interface RangeValidationFailure {
  ranges?: undefined
  error: RangeValidationErrorCode
  message: string
}

const RANGE_SYNTAX = /^\d+-\d+(,\d+-\d+)*$/

export function parseAndValidateRanges(
  input: string,
  pageCount: number,
): RangeValidationSuccess | RangeValidationFailure {
  if (input.trim().length === 0) {
    return { error: 'RANGES_REQUIRED', message: 'Page ranges are required.' }
  }

  if (!RANGE_SYNTAX.test(input)) {
    return {
      error: 'INVALID_RANGE_FORMAT',
      message: 'Page ranges must be in the format "1-3,4-6,7-10".',
    }
  }

  const ranges: ParsedRange[] = input.split(',').map((part) => {
    const [start, end] = part.split('-').map(Number)
    return { start, end }
  })

  for (const { start, end } of ranges) {
    if (start < 1 || end > pageCount || start > end) {
      return {
        error: 'RANGE_OUT_OF_BOUNDS',
        message: `Range "${start}-${end}" is out of bounds for a ${pageCount}-page document.`,
      }
    }
  }

  return { ranges }
}
