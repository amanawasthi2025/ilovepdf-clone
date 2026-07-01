import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument } from 'pdf-lib'
import { ImageFormat, JobType } from '@ilovepdf/shared'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { documentProcessingQueue } from '@/lib/queue'
import { ensureBucketExists, uploadFile } from '@/lib/storage'

const PDF_MAGIC = '%PDF'
const VALID_FORMATS = new Set<string>(Object.values(ImageFormat))

type ErrorCode =
  | 'FILE_REQUIRED'
  | 'INVALID_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'INVALID_IMAGE_FORMAT'
  | 'UNSUPPORTED_ENCRYPTED_PDF'
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
  const formatInput = formData.get('format') as string | null

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

  if (!formatInput || !VALID_FORMATS.has(formatInput)) {
    return errorResponse(
      'INVALID_IMAGE_FORMAT',
      `"${formatInput}" is not a valid image format. Must be one of PNG, JPEG.`,
      400,
    )
  }
  const format = formatInput as ImageFormat

  const buffer = Buffer.from(await file.arrayBuffer())
  if (buffer.subarray(0, 4).toString('ascii') !== PDF_MAGIC) {
    return errorResponse('INVALID_FILE_TYPE', `"${file.name}" is not a valid PDF file.`, 400)
  }

  try {
    await PDFDocument.load(buffer)
  } catch (err) {
    // pdf-lib's EncryptedPDFError fails `instanceof` checks: its ES5 build extends
    // the native Error class via a helper that returns a plain Error from `super()`,
    // discarding the subclass prototype. Message-matching is the only reliable signal.
    if (err instanceof Error && err.message.includes('is encrypted')) {
      return errorResponse(
        'UNSUPPORTED_ENCRYPTED_PDF',
        `"${file.name}" is encrypted/password-protected and cannot be converted.`,
        400,
      )
    }
    logger.error({ err }, 'Failed to parse PDF')
    return errorResponse(
      'INVALID_FILE_TYPE',
      `"${file.name}" could not be read as a valid PDF.`,
      400,
    )
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
        jobType: JobType.PDF_TO_IMAGE,
        inputKeys: [inputKey],
        imageFormat: format,
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
      'pdf-to-image',
      { jobId: job.id, inputKey, format },
      { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
    )
  } catch (err) {
    logger.error({ err, jobId: job.id, correlationId }, 'Failed to enqueue pdf-to-image job')
    await prisma.job.update({
      where: { id: job.id },
      data: { status: 'FAILED', errorMessage: 'Failed to enqueue job.' },
    }).catch(() => undefined)
    return errorResponse('INTERNAL_ERROR', 'Failed to enqueue pdf-to-image job.', 500)
  }

  logger.info({ jobId: job.id, correlationId, format }, 'PDF to Image job created')
  return NextResponse.json({ jobId: job.id }, { status: 202 })
}
