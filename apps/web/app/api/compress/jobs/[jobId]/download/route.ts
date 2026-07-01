import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { logger } from '@/lib/logger'
import { getPresignedDownloadUrl } from '@/lib/storage'

export async function GET(
  _request: NextRequest,
  { params }: { params: { jobId: string } },
): Promise<NextResponse> {
  const { jobId } = params

  let job: {
    id: string
    status: string
    outputKey: string | null
    correlationId: string
    userId: string | null
  } | null

  try {
    job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        status: true,
        outputKey: true,
        correlationId: true,
        userId: true,
      },
    })
  } catch (err) {
    logger.error({ err, jobId }, 'Failed to query job for download')
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to retrieve job.' },
      { status: 500 },
    )
  }

  if (!job) {
    return NextResponse.json(
      { error: 'JOB_NOT_FOUND', message: `No job found with id "${jobId}".` },
      { status: 404 },
    )
  }

  if (job.userId) {
    const session = await auth()
    if (session?.user?.id !== job.userId) {
      return NextResponse.json(
        { error: 'JOB_ACCESS_DENIED', message: 'You do not have access to this job.' },
        { status: 403 },
      )
    }
  }

  if (job.status !== 'COMPLETED') {
    return NextResponse.json(
      { error: 'JOB_NOT_COMPLETE', status: job.status },
      { status: 409 },
    )
  }

  let url: string
  try {
    const date = new Date().toISOString().slice(0, 10)
    url = await getPresignedDownloadUrl(job.outputKey!, `compressed-${date}.pdf`)
  } catch (err) {
    logger.error({ err, jobId, correlationId: job.correlationId }, 'Failed to generate pre-signed URL')
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to generate download URL.' },
      { status: 500 },
    )
  }

  logger.info({ jobId, correlationId: job.correlationId }, 'Pre-signed download URL issued')
  return NextResponse.json({ url })
}
