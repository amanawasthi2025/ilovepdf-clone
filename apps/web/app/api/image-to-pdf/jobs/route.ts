import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { JobType } from '@ilovepdf/shared'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { documentProcessingQueue } from '@/lib/queue'
import { ensureBucketExists, uploadFile } from '@/lib/storage'

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47])
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff])
const MIN_FILES = 1
const MAX_FILES = 10

type ErrorCode =
  | 'MINIMUM_FILES_REQUIRED'
  | 'MAXIMUM_FILES_EXCEEDED'
  | 'INVALID_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'TOTAL_SIZE_EXCEEDED'
  | 'INTERNAL_ERROR'

function errorResponse(code: ErrorCode, message: string, status: number): NextResponse {
  return NextResponse.json({ error: code, message }, { status })
}

function hasValidImageMagicBytes(buffer: Buffer): boolean {
  return (
    buffer.subarray(0, 4).equals(PNG_MAGIC) || buffer.subarray(0, 3).equals(JPEG_MAGIC)
  )
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return errorResponse('INTERNAL_ERROR', 'Failed to parse request body.', 500)
  }

  const files = formData.getAll('files') as File[]

  if (files.length < MIN_FILES) {
    return errorResponse(
      'MINIMUM_FILES_REQUIRED',
      `At least ${MIN_FILES} file is required.`,
      400,
    )
  }

  if (files.length > MAX_FILES) {
    return errorResponse(
      'MAXIMUM_FILES_EXCEEDED',
      `No more than ${MAX_FILES} files are allowed.`,
      400,
    )
  }

  const fileBuffers: Buffer[] = []
  let totalSize = 0

  for (const file of files) {
    if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
      return errorResponse(
        'INVALID_FILE_TYPE',
        `"${file.name}" is not a PNG or JPEG image.`,
        400,
      )
    }

    if (file.size > env.MAX_FILE_SIZE_BYTES) {
      return errorResponse(
        'FILE_TOO_LARGE',
        `"${file.name}" exceeds the maximum allowed file size of ${env.MAX_FILE_SIZE_BYTES} bytes.`,
        413,
      )
    }

    totalSize += file.size
    if (totalSize > env.MAX_TOTAL_SIZE_BYTES) {
      return errorResponse(
        'TOTAL_SIZE_EXCEEDED',
        `Combined file size exceeds the maximum allowed total of ${env.MAX_TOTAL_SIZE_BYTES} bytes.`,
        413,
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    if (!hasValidImageMagicBytes(buffer)) {
      return errorResponse(
        'INVALID_FILE_TYPE',
        `"${file.name}" is not a valid PNG or JPEG image.`,
        400,
      )
    }

    fileBuffers.push(buffer)
  }

  try {
    await ensureBucketExists()
  } catch (err) {
    logger.error({ err }, 'Failed to ensure storage bucket exists')
    return errorResponse('INTERNAL_ERROR', 'Storage initialization failed.', 500)
  }

  const inputKeys: string[] = []
  try {
    for (let i = 0; i < fileBuffers.length; i++) {
      const extension = files[i].type === 'image/png' ? 'png' : 'jpg'
      const key = `inputs/${randomUUID()}.${extension}`
      await uploadFile(key, fileBuffers[i], files[i].type)
      inputKeys.push(key)
    }
  } catch (err) {
    logger.error({ err }, 'Failed to upload files to storage')
    return errorResponse('INTERNAL_ERROR', 'Failed to store uploaded files.', 500)
  }

  const correlationId = randomUUID()
  const expiresAt = new Date(Date.now() + env.FILE_TTL_SECONDS * 1000)
  const session = await auth()

  let job: { id: string }
  try {
    job = await prisma.job.create({
      data: {
        jobType: JobType.IMAGE_TO_PDF,
        inputKeys,
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
      'image-to-pdf',
      { jobId: job.id, inputKeys },
      { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
    )
  } catch (err) {
    logger.error({ err, jobId: job.id, correlationId }, 'Failed to enqueue image-to-pdf job')
    await prisma.job.update({
      where: { id: job.id },
      data: { status: 'FAILED', errorMessage: 'Failed to enqueue job.' },
    }).catch(() => undefined)
    return errorResponse('INTERNAL_ERROR', 'Failed to enqueue image-to-pdf job.', 500)
  }

  logger.info({ jobId: job.id, correlationId, fileCount: files.length }, 'Image-to-PDF job created')
  return NextResponse.json({ jobId: job.id }, { status: 202 })
}
