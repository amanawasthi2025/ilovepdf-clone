import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument } from 'pdf-lib'
import { JobType } from '@ilovepdf/shared'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { documentProcessingQueue } from '@/lib/queue'
import { parseAndValidateRanges } from '@/lib/ranges'
import { ensureBucketExists, uploadFile } from '@/lib/storage'

const PDF_MAGIC = '%PDF'

type ErrorCode =
  | 'FILE_REQUIRED'
  | 'INVALID_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'RANGES_REQUIRED'
  | 'INVALID_RANGE_FORMAT'
  | 'RANGE_OUT_OF_BOUNDS'
  | 'INTERNAL_ERROR'

function errorResponse(code: ErrorCode, message: string, status: number): NextResponse {
  return NextResponse.json({ error: code, message }, { status })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return errorResponse('INTERNAL_ERROR', 'Failed to parse request body.', 500)
  }

  const file = formData.get('file') as File | null
  const rangesInput = (formData.get('ranges') as string | null) ?? ''

  if (!file) {
    return errorResponse('FILE_REQUIRED', 'A PDF file is required.', 400)
  }

  if (file.type !== 'application/pdf') {
    return errorResponse('INVALID_FILE_TYPE', `"${file.name}" is not a PDF file.`, 400)
  }

  if (file.size > env.MAX_FILE_SIZE_BYTES) {
    return errorResponse(
      'FILE_TOO_LARGE',
      `"${file.name}" exceeds the maximum allowed file size of ${env.MAX_FILE_SIZE_BYTES} bytes.`,
      413,
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  if (buffer.subarray(0, 4).toString('ascii') !== PDF_MAGIC) {
    return errorResponse('INVALID_FILE_TYPE', `"${file.name}" is not a valid PDF file.`, 400)
  }

  let pageCount: number
  try {
    const pdf = await PDFDocument.load(buffer)
    pageCount = pdf.getPageCount()
  } catch (err) {
    logger.error({ err }, 'Failed to parse PDF to determine page count')
    return errorResponse(
      'INVALID_FILE_TYPE',
      `"${file.name}" could not be read as a valid PDF.`,
      400,
    )
  }

  const rangeResult = parseAndValidateRanges(rangesInput, pageCount)
  if (rangeResult.error) {
    return errorResponse(rangeResult.error, rangeResult.message, 400)
  }

  try {
    await ensureBucketExists()
  } catch (err) {
    logger.error({ err }, 'Failed to ensure storage bucket exists')
    return errorResponse('INTERNAL_ERROR', 'Storage initialization failed.', 500)
  }

  const inputKey = `inputs/${randomUUID()}.pdf`
  try {
    await uploadFile(inputKey, buffer, 'application/pdf')
  } catch (err) {
    logger.error({ err }, 'Failed to upload file to storage')
    return errorResponse('INTERNAL_ERROR', 'Failed to store uploaded file.', 500)
  }

  const correlationId = randomUUID()
  const expiresAt = new Date(Date.now() + env.FILE_TTL_SECONDS * 1000)
  const session = await auth()

  let job: { id: string }
  try {
    job = await prisma.job.create({
      data: {
        jobType: JobType.SPLIT,
        inputKeys: [inputKey],
        splitRanges: rangesInput,
        correlationId,
        expiresAt,
        userId: session?.user?.id,
      },
      select: { id: true },
    })
  } catch (err) {
    logger.error({ err, correlationId }, 'Failed to create job record')
    return errorResponse('INTERNAL_ERROR', 'Failed to create job record.', 500)
  }

  try {
    await documentProcessingQueue.add(
      'split',
      { jobId: job.id, inputKey, ranges: rangesInput },
      { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
    )
  } catch (err) {
    logger.error({ err, jobId: job.id, correlationId }, 'Failed to enqueue split job')
    await prisma.job.update({
      where: { id: job.id },
      data: { status: 'FAILED', errorMessage: 'Failed to enqueue job.' },
    }).catch(() => undefined)
    return errorResponse('INTERNAL_ERROR', 'Failed to enqueue split job.', 500)
  }

  logger.info(
    { jobId: job.id, correlationId, rangeCount: rangeResult.ranges.length },
    'Split job created',
  )
  return NextResponse.json({ jobId: job.id }, { status: 202 })
}
