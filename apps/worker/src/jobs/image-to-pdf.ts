import { randomUUID } from 'crypto'
import { PDFDocument } from 'pdf-lib'
import type { Job } from 'bullmq'
import { JobStatus, JobType } from '@ilovepdf/shared'
import type { ImageToPdfJobPayload } from '@ilovepdf/shared'
import { logger } from '../lib/logger.js'
import { prisma } from '../lib/db.js'
import { downloadFile, uploadFile } from '../lib/storage.js'

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47])
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff])

function isPng(buffer: Buffer): boolean {
  return buffer.subarray(0, 4).equals(PNG_MAGIC)
}

function isJpeg(buffer: Buffer): boolean {
  return buffer.subarray(0, 3).equals(JPEG_MAGIC)
}

export async function processImageToPdfJob(job: Job<ImageToPdfJobPayload>): Promise<void> {
  const { jobId, inputKeys } = job.data

  const jobRecord = await prisma.job.findUniqueOrThrow({ where: { id: jobId } })
  const log = logger.child({
    jobId,
    correlationId: jobRecord.correlationId,
    jobType: JobType.IMAGE_TO_PDF,
  })

  log.info('image-to-pdf job started')

  await prisma.job.update({
    where: { id: jobId },
    data: { status: JobStatus.PROCESSING },
  })

  try {
    const pdfDoc = await PDFDocument.create()

    for (const key of inputKeys) {
      const buffer = await downloadFile(key)

      // pdf-lib's JpegEmbedder builds a DataView directly on the buffer's
      // underlying ArrayBuffer without accounting for Buffer.byteOffset. Small
      // buffers returned by downloadFile's Buffer.concat are frequently
      // pool-allocated at a nonzero offset, which corrupts pdf-lib's read of
      // the SOI marker ("SOI not found in JPEG") despite valid magic bytes.
      // Re-wrapping in `new Uint8Array` forces a byteOffset-0 copy.
      const embeddable = new Uint8Array(buffer)

      const image = isPng(buffer)
        ? await pdfDoc.embedPng(embeddable)
        : isJpeg(buffer)
          ? await pdfDoc.embedJpg(embeddable)
          : null

      if (!image) {
        throw new Error(`Input file "${key}" is not a valid PNG or JPEG image`)
      }

      const page = pdfDoc.addPage([image.width, image.height])
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })

      log.debug({ key, width: image.width, height: image.height }, 'input image embedded')
    }

    const pdfBytes = await pdfDoc.save()
    const outputKey = `outputs/${randomUUID()}.pdf`
    await uploadFile(outputKey, Buffer.from(pdfBytes), 'application/pdf')

    await prisma.job.update({
      where: { id: jobId },
      data: { status: JobStatus.COMPLETED, outputKey },
    })

    log.info({ outputKey, pageCount: pdfDoc.getPageCount() }, 'image-to-pdf job completed')
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown processing error'
    log.error({ error }, 'image-to-pdf job failed')

    await prisma.job.update({
      where: { id: jobId },
      data: { status: JobStatus.FAILED, errorMessage },
    })

    throw error
  }
}
