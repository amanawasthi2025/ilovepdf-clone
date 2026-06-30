export enum JobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum JobType {
  MERGE = 'MERGE',
}

export interface MergeJobPayload {
  jobId: string
  inputKeys: string[]
}
