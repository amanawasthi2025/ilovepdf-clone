import { randomUUID } from 'crypto'
import path from 'node:path'
import { createCanvas } from '@napi-rs/canvas'
import JSZip from 'jszip'
import type { Job } from 'bullmq'
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { ImageFormat, JobStatus, JobType } from '@ilovepdf/shared'
import type { PdfToImageJobPayload } from '@ilovepdf/shared'
import { logger } from '../lib/logger.js'
import { prisma } from '../lib/db.js'
import { downloadFile, uploadFile } from '../lib/storage.js'

const PDF_MAGIC = Buffer.from('%PDF')
const RASTER_DPI = 150
const POINTS_PER_INCH = 72

const FORMAT_EXTENSIONS: Record<ImageFormat, string> = {
  [ImageFormat.PNG]: 'png',
  [ImageFormat.JPEG]: 'jpg',
}

// pdfjs-dist's legacy build is published as pure ESM (.mjs). A static `import`
// of it compiles to `require(...)` under this package's CommonJS output
// (tsconfig module: NodeNext without "type": "module" in package.json),
// which throws ERR_REQUIRE_ESM on Node < 22.12 — below this project's
// declared >=20 engine floor. A dynamic import() loads ESM from a CJS module
// on every supported Node version, so it's loaded lazily and cached here.
type PdfjsLib = typeof import('pdfjs-dist/legacy/build/pdf.mjs')
let pdfjsLibPromise: Promise<PdfjsLib> | undefined

function loadPdfjsLib(): Promise<PdfjsLib> {
  pdfjsLibPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs')
  return pdfjsLibPromise
}

// pdfjs-dist needs its bundled standard font metrics/glyphs to rasterize text
// drawn with the 14 base PDF fonts (Helvetica, Times, etc.) when they aren't
// embedded in the source PDF — without this, that text silently fails to
// render and pages come out blank wherever it appears. Despite the option's
// name, pdfjs-dist's Node font loader (node_utils.js) passes this straight to
// `fs.promises.readFile`, not a URL parser — a "file://" string fails there,
// it must be a plain filesystem path.
const STANDARD_FONT_DATA_URL = `${path.join(
  path.dirname(require.resolve('pdfjs-dist/package.json')),
  'standard_fonts',
)}${path.sep}`

function hasPdfMagicBytes(buffer: Buffer): boolean {
  return buffer.subarray(0, 4).equals(PDF_MAGIC)
}

async function rasterizePage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  format: ImageFormat,
): Promise<Buffer> {
  const page = await doc.getPage(pageNumber)
  const viewport = page.getViewport({ scale: RASTER_DPI / POINTS_PER_INCH })
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
  const context = canvas.getContext('2d')

  await page.render({
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise

  return format === ImageFormat.PNG ? canvas.toBuffer('image/png') : canvas.toBuffer('image/jpeg')
}

export async function processPdfToImageJob(job: Job<PdfToImageJobPayload>): Promise<void> {
  const { jobId, inputKey, format } = job.data

  const jobRecord = await prisma.job.findUniqueOrThrow({ where: { id: jobId } })
  const log = logger.child({
    jobId,
    correlationId: jobRecord.correlationId,
    jobType: JobType.PDF_TO_IMAGE,
  })

  log.info({ format }, 'pdf-to-image job started')

  await prisma.job.update({
    where: { id: jobId },
    data: { status: JobStatus.PROCESSING },
  })

  try {
    const inputBuffer = await downloadFile(inputKey)
    if (!hasPdfMagicBytes(inputBuffer)) {
      throw new Error(`Input file "${inputKey}" is not a valid PDF`)
    }
    log.debug({ key: inputKey }, 'input file downloaded and validated')

    const pdfjsLib = await loadPdfjsLib()
    const doc = await pdfjsLib.getDocument({
      data: new Uint8Array(inputBuffer),
      standardFontDataUrl: STANDARD_FONT_DATA_URL,
    }).promise
    const extension = FORMAT_EXTENSIONS[format]

    const zip = new JSZip()
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const pageBuffer = await rasterizePage(doc, pageNumber, format)
      zip.file(`page-${pageNumber}.${extension}`, pageBuffer)
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })
    const outputKey = `outputs/${randomUUID()}.zip`
    await uploadFile(outputKey, zipBuffer, 'application/zip')

    await prisma.job.update({
      where: { id: jobId },
      data: { status: JobStatus.COMPLETED, outputKey },
    })

    log.info({ outputKey, pageCount: doc.numPages }, 'pdf-to-image job completed')
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown processing error'
    log.error({ error }, 'pdf-to-image job failed')

    await prisma.job.update({
      where: { id: jobId },
      data: { status: JobStatus.FAILED, errorMessage },
    })

    throw error
  }
}
