import { randomUUID } from 'crypto'
import { PDFDocument } from 'pdf-lib'
import JSZip from 'jszip'
import type { Job } from 'bullmq'
import { JobStatus, JobType } from '@ilovepdf/shared'
import type { SplitJobPayload } from '@ilovepdf/shared'
import { logger } from '../lib/logger.js'
import { prisma } from '../lib/db.js'
import { downloadFile, uploadFile } from '../lib/storage.js'

const PDF_MAGIC = Buffer.from('%PDF')

interface ParsedRange {
  start: number
  end: number
}

function hasPdfMagicBytes(buffer: Buffer): boolean {
  return buffer.subarray(0, 4).equals(PDF_MAGIC)
}

// `ranges` has already been validated by the upload API (apps/web/lib/ranges.ts) — this is a trusted parse, not a re-validation.
function parseRanges(ranges: string): ParsedRange[] {
  return ranges.split(',').map((part) => {
    const [start, end] = part.split('-').map(Number)
    return { start, end }
  })
}

export async function processSplitJob(job: Job<SplitJobPayload>): Promise<void> {
  const { jobId, inputKey, ranges } = job.data

  const jobRecord = await prisma.job.findUniqueOrThrow({ where: { id: jobId } })
  const log = logger.child({
    jobId,
    correlationId: jobRecord.correlationId,
    jobType: JobType.SPLIT,
  })

  log.info('split job started')

  await prisma.job.update({
    where: { id: jobId },
    data: { status: JobStatus.PROCESSING },
  })

  try {
    const buffer = await downloadFile(inputKey)
    if (!hasPdfMagicBytes(buffer)) {
      throw new Error(`Input file "${inputKey}" is not a valid PDF`)
    }
    log.debug({ key: inputKey }, 'input file downloaded and validated')

    const sourceDoc = await PDFDocument.load(buffer)
    const parsedRanges = parseRanges(ranges)

    const zip = new JSZip()
    for (const { start, end } of parsedRanges) {
      const pageIndices = Array.from({ length: end - start + 1 }, (_, i) => start - 1 + i)
      const rangeDoc = await PDFDocument.create()
      const copiedPages = await rangeDoc.copyPages(sourceDoc, pageIndices)
      for (const page of copiedPages) {
        rangeDoc.addPage(page)
      }
      const rangeBytes = await rangeDoc.save()
      zip.file(`split-${start}-${end}.pdf`, rangeBytes)
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })
    const outputKey = `outputs/${randomUUID()}.zip`
    await uploadFile(outputKey, zipBuffer, 'application/zip')

    await prisma.job.update({
      where: { id: jobId },
      data: { status: JobStatus.COMPLETED, outputKey },
    })

    log.info({ outputKey, rangeCount: parsedRanges.length }, 'split job completed')
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown processing error'
    log.error({ error }, 'split job failed')

    await prisma.job.update({
      where: { id: jobId },
      data: { status: JobStatus.FAILED, errorMessage },
    })

    throw error
  }
}
