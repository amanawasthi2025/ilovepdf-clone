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
}

export enum CompressionLevel {
  LOW = 'LOW',
  RECOMMENDED = 'RECOMMENDED',
  HIGH = 'HIGH',
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
