import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { logger } from '@/lib/logger'

export async function GET(
  _request: NextRequest,
  { params }: { params: { jobId: string } },
): Promise<NextResponse> {
  const { jobId } = params

  let job: {
    id: string
    status: string
    createdAt: Date
    updatedAt: Date
    errorMessage: string | null
  } | null

  try {
    job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        errorMessage: true,
      },
    })
  } catch (err) {
    logger.error({ err, jobId }, 'Failed to query job status')
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to retrieve job status.' },
      { status: 500 },
    )
  }

  if (!job) {
    return NextResponse.json(
      { error: 'JOB_NOT_FOUND', message: `No job found with id "${jobId}".` },
      { status: 404 },
    )
  }

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    errorMessage: job.errorMessage,
  })
}
