import { randomUUID } from 'crypto'
import { PDFDocument } from 'pdf-lib'
import type { Job } from 'bullmq'
import { JobStatus, JobType } from '@ilovepdf/shared'
import type { MergeJobPayload } from '@ilovepdf/shared'
import { logger } from '../lib/logger.js'
import { prisma } from '../lib/db.js'
import { downloadFile, uploadFile } from '../lib/storage.js'

const PDF_MAGIC = Buffer.from('%PDF')

function hasPdfMagicBytes(buffer: Buffer): boolean {
  return buffer.subarray(0, 4).equals(PDF_MAGIC)
}

export async function processMergeJob(job: Job<MergeJobPayload>): Promise<void> {
  const { jobId, inputKeys } = job.data

  const jobRecord = await prisma.job.findUniqueOrThrow({ where: { id: jobId } })
  const log = logger.child({
    jobId,
    correlationId: jobRecord.correlationId,
    jobType: JobType.MERGE,
  })

  log.info('merge job started')

  await prisma.job.update({
    where: { id: jobId },
    data: { status: JobStatus.PROCESSING },
  })

  try {
    const buffers: Buffer[] = []
    for (const key of inputKeys) {
      const buffer = await downloadFile(key)
      if (!hasPdfMagicBytes(buffer)) {
        throw new Error(`Input file "${key}" is not a valid PDF`)
      }
      log.debug({ key }, 'input file downloaded and validated')
      buffers.push(buffer)
    }

    const mergedDoc = await PDFDocument.create()
    for (const buffer of buffers) {
      const sourceDoc = await PDFDocument.load(buffer)
      const pageIndices = sourceDoc.getPageIndices()
      const copiedPages = await mergedDoc.copyPages(sourceDoc, pageIndices)
      for (const page of copiedPages) {
        mergedDoc.addPage(page)
      }
    }

    const mergedBytes = await mergedDoc.save()
    const outputKey = `outputs/${randomUUID()}.pdf`
    await uploadFile(outputKey, Buffer.from(mergedBytes), 'application/pdf')

    await prisma.job.update({
      where: { id: jobId },
      data: { status: JobStatus.COMPLETED, outputKey },
    })

    log.info({ outputKey, pageCount: mergedDoc.getPageCount() }, 'merge job completed')
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown processing error'
    log.error({ error }, 'merge job failed')

    await prisma.job.update({
      where: { id: jobId },
      data: { status: JobStatus.FAILED, errorMessage },
    })

    throw error
  }
}
