import { randomUUID } from 'crypto'
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  decodePDFRawStream,
} from 'pdf-lib'
import type { PDFPage, PDFRef } from 'pdf-lib'
import sharp from 'sharp'
import type { Job } from 'bullmq'
import { CompressionLevel, JobStatus, JobType } from '@ilovepdf/shared'
import type { CompressJobPayload } from '@ilovepdf/shared'
import { logger } from '../lib/logger.js'
import { prisma } from '../lib/db.js'
import { downloadFile, uploadFile } from '../lib/storage.js'

const PDF_MAGIC = Buffer.from('%PDF')
const POINTS_PER_INCH = 72

const LEVEL_PARAMS: Record<CompressionLevel, { maxDpi: number; jpegQuality: number }> = {
  [CompressionLevel.LOW]: { maxDpi: 200, jpegQuality: 85 },
  [CompressionLevel.RECOMMENDED]: { maxDpi: 150, jpegQuality: 75 },
  [CompressionLevel.HIGH]: { maxDpi: 96, jpegQuality: 60 },
}

function hasPdfMagicBytes(buffer: Buffer): boolean {
  return buffer.subarray(0, 4).equals(PDF_MAGIC)
}

// --- Placed-size detection ---
//
// Per the DPI-based downsample rule in wiki/active-feature.md, the target
// pixel size for an image depends on how large it's actually drawn on the
// page (its placed size in PDF points), not just its raw pixel dimensions.
// pdf-lib has no public API for reading a page's drawing operators, so this
// is a small hand-rolled content-stream tokenizer that tracks only the
// operators needed to resolve that: `q`/`Q` (graphics state stack) and `cm`
// (CTM concatenation), recording the CTM in effect at each `Do` call.
//
// Deliberately does not recurse into Form XObjects (Subtype /Form) — an
// image drawn only inside a nested Form will not get a placed size from
// this pass. See the fallback in `recompressImage`.

type Matrix = [number, number, number, number, number, number]
const IDENTITY_MATRIX: Matrix = [1, 0, 0, 1, 0, 0]

function multiplyMatrix(m1: Matrix, m2: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m1
  const [a2, b2, c2, d2, e2, f2] = m2
  return [
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2,
    e1 * b2 + f1 * d2 + f2,
  ]
}

interface PlacedSize {
  widthPt: number
  heightPt: number
}

const DELIMITER_RE = /[\s/<>[\]()%]/
const WHITESPACE_RE = /\s/
const NUMBER_START_RE = /[0-9+\-.]/
const NUMBER_BODY_RE = /[0-9+\-.eE]/

// Maps XObject resource name (e.g. "Image-1") -> largest placed size found
// for it within this single content stream.
function trackXObjectPlacedSizes(contentBytes: Uint8Array): Map<string, PlacedSize> {
  const placedSizes = new Map<string, PlacedSize>()
  const text = Buffer.from(contentBytes).toString('latin1')

  let pos = 0
  let ctm: Matrix = IDENTITY_MATRIX
  const ctmStack: Matrix[] = []
  const numberBuffer: number[] = []
  let lastName: string | undefined

  while (pos < text.length) {
    const ch = text[pos]

    if (WHITESPACE_RE.test(ch)) {
      pos++
      continue
    }

    if (ch === '%') {
      while (pos < text.length && text[pos] !== '\n' && text[pos] !== '\r') pos++
      continue
    }

    if (ch === '(') {
      // Literal string — skip to the matching unescaped ')'.
      pos++
      let depth = 1
      while (pos < text.length && depth > 0) {
        if (text[pos] === '\\') pos++
        else if (text[pos] === '(') depth++
        else if (text[pos] === ')') depth--
        pos++
      }
      continue
    }

    if (ch === '<' && text[pos + 1] === '<') {
      // Dictionary — skip to the matching '>>' (handles nesting).
      pos += 2
      let depth = 1
      while (pos < text.length && depth > 0) {
        if (text[pos] === '<' && text[pos + 1] === '<') {
          depth++
          pos += 2
          continue
        }
        if (text[pos] === '>' && text[pos + 1] === '>') {
          depth--
          pos += 2
          continue
        }
        pos++
      }
      continue
    }

    if (ch === '<') {
      // Hex string.
      pos++
      while (pos < text.length && text[pos] !== '>') pos++
      pos++
      continue
    }

    if (ch === '[' || ch === ']') {
      pos++
      continue
    }

    if (ch === '/') {
      const start = pos + 1
      pos = start
      while (pos < text.length && !DELIMITER_RE.test(text[pos])) pos++
      lastName = text.slice(start, pos)
      continue
    }

    if (NUMBER_START_RE.test(ch)) {
      const start = pos
      pos++
      while (pos < text.length && NUMBER_BODY_RE.test(text[pos])) pos++
      numberBuffer.push(Number(text.slice(start, pos)))
      continue
    }

    const start = pos
    while (pos < text.length && !DELIMITER_RE.test(text[pos])) pos++
    const op = text.slice(start, pos)

    if (op === '') {
      // Stray delimiter we don't otherwise handle (e.g. a bare ')' from
      // malformed input) — advance to avoid an infinite loop.
      pos++
      continue
    }

    if (op === 'BI') {
      // Inline image — its binary payload is opaque and never an XObject
      // `Do` target. Skip to the next whitespace-bounded "EI" (the standard
      // heuristic PDF content-stream parsers use for inline image bounds).
      const rest = text.slice(pos)
      const eiMatch = /\sEI(\s|$)/.exec(rest)
      pos = eiMatch ? pos + eiMatch.index + eiMatch[0].length : text.length
    } else if (op === 'q') {
      ctmStack.push(ctm)
    } else if (op === 'Q') {
      ctm = ctmStack.pop() ?? IDENTITY_MATRIX
    } else if (op === 'cm' && numberBuffer.length >= 6) {
      const [a, b, c, d, e, f] = numberBuffer.slice(-6)
      ctm = multiplyMatrix([a, b, c, d, e, f], ctm)
    } else if (op === 'Do' && lastName) {
      const widthPt = Math.hypot(ctm[0], ctm[1])
      const heightPt = Math.hypot(ctm[2], ctm[3])
      const existing = placedSizes.get(lastName)
      if (!existing || widthPt * heightPt > existing.widthPt * existing.heightPt) {
        placedSizes.set(lastName, { widthPt, heightPt })
      }
    }

    numberBuffer.length = 0
  }

  return placedSizes
}

function getPageContentBytes(pdfDoc: PDFDocument, page: PDFPage): Uint8Array {
  const contents = page.node.Contents()
  if (contents instanceof PDFArray) {
    const parts: Uint8Array[] = []
    for (let i = 0; i < contents.size(); i++) {
      const stream = pdfDoc.context.lookup(contents.get(i))
      if (stream instanceof PDFRawStream) {
        parts.push(decodePDFRawStream(stream).decode())
      }
    }
    return Buffer.concat(parts.map((p) => Buffer.from(p)))
  }
  if (contents instanceof PDFRawStream) {
    return decodePDFRawStream(contents).decode()
  }
  return new Uint8Array(0)
}

// Walks every page's content stream and returns, for each image XObject ref
// that is directly drawn on a page, the largest placed size found for it
// across all pages/occurrences. Refs never found here (e.g. only referenced
// inside a nested Form XObject) are simply absent from the returned map.
function findPlacedSizesByRef(pdfDoc: PDFDocument): Map<string, PlacedSize> {
  const placedSizesByRef = new Map<string, PlacedSize>()

  for (const page of pdfDoc.getPages()) {
    const resources = page.node.Resources()
    const xObjectDict = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict)
    if (!xObjectDict) continue

    const contentBytes = getPageContentBytes(pdfDoc, page)
    const placedSizesByName = trackXObjectPlacedSizes(contentBytes)

    for (const [name, size] of placedSizesByName) {
      const ref = xObjectDict.get(PDFName.of(name))
      if (!ref) continue
      const refKey = ref.toString()
      const existing = placedSizesByRef.get(refKey)
      if (!existing || size.widthPt * size.heightPt > existing.widthPt * existing.heightPt) {
        placedSizesByRef.set(refKey, size)
      }
    }
  }

  return placedSizesByRef
}

// --- Image XObject classification ---

interface ImageXObject {
  ref: PDFRef
  stream: PDFRawStream
  filter: string | undefined
  colorSpace: string | undefined
  pixelWidth: number
  pixelHeight: number
  inScope: boolean
}

const SUPPORTED_FILTERS = new Set(['/DCTDecode', '/FlateDecode'])
const SUPPORTED_COLOR_SPACES = new Set(['/DeviceRGB', '/DeviceGray'])

// Returns every image XObject in the document, in or out of v1 scope (see
// wiki/active-feature.md Scope Decisions) — callers use `inScope` to decide
// whether to recompress or leave the image untouched.
function findImageXObjects(pdfDoc: PDFDocument): ImageXObject[] {
  const images: ImageXObject[] = []

  for (const [ref, obj] of pdfDoc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue

    const dict = obj.dict
    const subtype = dict.lookup(PDFName.of('Subtype'))
    if (!subtype || subtype.toString() !== '/Image') continue

    const filter = dict.lookup(PDFName.of('Filter'))?.toString()
    const colorSpace = dict.lookup(PDFName.of('ColorSpace'))?.toString()
    const pixelWidth = dict.lookup(PDFName.of('Width'))
    const pixelHeight = dict.lookup(PDFName.of('Height'))

    if (!(pixelWidth instanceof PDFNumber) || !(pixelHeight instanceof PDFNumber)) continue

    images.push({
      ref,
      stream: obj,
      filter,
      colorSpace,
      pixelWidth: pixelWidth.asNumber(),
      pixelHeight: pixelHeight.asNumber(),
      inScope: Boolean(
        filter && colorSpace && SUPPORTED_FILTERS.has(filter) && SUPPORTED_COLOR_SPACES.has(colorSpace),
      ),
    })
  }

  return images
}

interface RecompressResult {
  recompressed: boolean
  originalBytes: number
  newBytes: number
}

// Recompresses a single in-scope image XObject and, if smaller, replaces it
// at its existing ref via `context.assign` — the same mechanism pdf-lib's own
// JpegEmbedder/PngEmbedder use to register a stream at a ref. PDFRawStream's
// `contents` is a readonly property with a private constructor (no public
// mutator), so replacement — not in-place mutation — is the supported way to
// swap a stream's bytes. Returns without modifying anything if Sharp's output
// would not be smaller than the original.
async function recompressImage(
  pdfDoc: PDFDocument,
  image: ImageXObject,
  placedSize: PlacedSize | undefined,
  level: CompressionLevel,
): Promise<RecompressResult> {
  const { maxDpi, jpegQuality } = LEVEL_PARAMS[level]
  const originalBytes = image.stream.getContents().length

  let sharpInput: sharp.Sharp
  if (image.filter === '/DCTDecode') {
    // DCTDecode contents are already a complete JPEG file — hand directly to
    // Sharp (it decodes JPEG natively). decodePDFRawStream() does NOT
    // support '/DCTDecode' (it only unwraps filters like Flate/LZW that
    // wrap other data, not terminal image codecs) — using getContents() here
    // is required, not just a shortcut.
    sharpInput = sharp(Buffer.from(image.stream.getContents()))
  } else {
    // FlateDecode raw bitmap: contents are deflate-compressed interleaved
    // pixel samples. Must inflate before Sharp can interpret them as raw
    // pixel data.
    const channels = image.colorSpace === '/DeviceGray' ? 1 : 3
    const rawPixelBytes = decodePDFRawStream(image.stream).decode()
    sharpInput = sharp(Buffer.from(rawPixelBytes), {
      raw: { width: image.pixelWidth, height: image.pixelHeight, channels },
    })
  }

  // Sharp's JPEG encoder defaults to sRGB output regardless of input channel
  // count — a single-channel raw/DCTDecode-grayscale source would otherwise
  // silently come back as a 3-channel RGB JPEG. Force grayscale explicitly
  // when the source was DeviceGray so the output stays 1-channel.
  if (image.colorSpace === '/DeviceGray') {
    sharpInput = sharpInput.toColourspace('b-w')
  }

  // Without a discovered placed size (image only reachable via a nested Form
  // XObject — not walked in v1), skip resizing and fall back to quality-only
  // re-encoding: still real compression, never risks guessing a target size
  // wrong and visibly degrading an image drawn larger than assumed.
  if (placedSize) {
    const targetPixelWidth = Math.round(maxDpi * (placedSize.widthPt / POINTS_PER_INCH))
    sharpInput = sharpInput.resize({ width: targetPixelWidth, withoutEnlargement: true })
  }

  const recompressed = await sharpInput.jpeg({ quality: jpegQuality }).toBuffer()

  if (recompressed.length >= originalBytes) {
    return { recompressed: false, originalBytes, newBytes: originalBytes }
  }

  const meta = await sharp(recompressed).metadata()
  const dict = image.stream.dict
  dict.set(PDFName.of('Width'), PDFNumber.of(meta.width!))
  dict.set(PDFName.of('Height'), PDFNumber.of(meta.height!))
  dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'))
  // Preserve grayscale vs. RGB based on Sharp's actual output — re-encoding
  // never converts one to the other, but asserting the wrong ColorSpace name
  // in the dict would make a correctly-encoded JPEG render with wrong colors.
  // (Sharp's Metadata.channels type is declared as `3 | 4`, which doesn't
  // reflect reality for grayscale output — hence the numeric cast.)
  const outputChannels = meta.channels as number
  dict.set(PDFName.of('ColorSpace'), PDFName.of(outputChannels === 1 ? 'DeviceGray' : 'DeviceRGB'))
  dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8))
  dict.delete(PDFName.of('DecodeParms'))

  pdfDoc.context.assign(image.ref, PDFRawStream.of(dict, new Uint8Array(recompressed)))

  return { recompressed: true, originalBytes, newBytes: recompressed.length }
}

export async function processCompressJob(job: Job<CompressJobPayload>): Promise<void> {
  const { jobId, inputKey, level } = job.data

  const jobRecord = await prisma.job.findUniqueOrThrow({ where: { id: jobId } })
  const log = logger.child({
    jobId,
    correlationId: jobRecord.correlationId,
    jobType: JobType.COMPRESS,
  })

  log.info({ level }, 'compress job started')

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

    const pdfDoc = await PDFDocument.load(inputBuffer)

    const allImages = findImageXObjects(pdfDoc)
    const placedSizesByRef = findPlacedSizesByRef(pdfDoc)

    let recompressedCount = 0
    let noImprovementCount = 0
    let outOfScopeCount = 0

    for (const image of allImages) {
      if (!image.inScope) {
        outOfScopeCount++
        continue
      }
      const placedSize = placedSizesByRef.get(image.ref.toString())
      const result = await recompressImage(pdfDoc, image, placedSize, level)
      if (result.recompressed) recompressedCount++
      else noImprovementCount++
    }

    const outputBytes = await pdfDoc.save({ useObjectStreams: true })
    const outputKey = `outputs/${randomUUID()}.pdf`
    await uploadFile(outputKey, Buffer.from(outputBytes), 'application/pdf')

    await prisma.job.update({
      where: { id: jobId },
      data: { status: JobStatus.COMPLETED, outputKey },
    })

    log.info(
      {
        outputKey,
        inputBytes: inputBuffer.length,
        outputBytes: outputBytes.length,
        imagesRecompressed: recompressedCount,
        imagesSkippedNoImprovement: noImprovementCount,
        imagesSkippedOutOfScope: outOfScopeCount,
      },
      'compress job completed',
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown processing error'
    log.error({ error }, 'compress job failed')

    await prisma.job.update({
      where: { id: jobId },
      data: { status: JobStatus.FAILED, errorMessage },
    })

    throw error
  }
}
