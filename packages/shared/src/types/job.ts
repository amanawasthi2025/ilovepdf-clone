export enum JobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum JobType {
  MERGE = 'MERGE',
  SPLIT = 'SPLIT',
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
