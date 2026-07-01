export enum JobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum JobType {
  MERGE = 'MERGE',
  SPLIT = 'SPLIT',
  COMPRESS = 'COMPRESS',
  PDF_TO_IMAGE = 'PDF_TO_IMAGE',
  IMAGE_TO_PDF = 'IMAGE_TO_PDF',
}

export enum CompressionLevel {
  LOW = 'LOW',
  RECOMMENDED = 'RECOMMENDED',
  HIGH = 'HIGH',
}

export enum ImageFormat {
  PNG = 'PNG',
  JPEG = 'JPEG',
}

export interface MergeJobPayload {
  jobId: string
  inputKeys: string[]
}

export interface SplitJobPayload {
  jobId: string
  inputKey: string
  ranges: string
}

export interface CompressJobPayload {
  jobId: string
  inputKey: string
  level: CompressionLevel
}

export interface PdfToImageJobPayload {
  jobId: string
  inputKey: string
  format: ImageFormat
}

export interface ImageToPdfJobPayload {
  jobId: string
  inputKeys: string[]
}
