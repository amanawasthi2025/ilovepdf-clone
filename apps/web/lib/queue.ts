import { Queue } from 'bullmq'
import type {
  CompressJobPayload,
  ImageToPdfJobPayload,
  MergeJobPayload,
  PdfToImageJobPayload,
  SplitJobPayload,
} from '@ilovepdf/shared'
import { env } from './env'

const redisUrl = new URL(env.REDIS_URL)

export const documentProcessingQueue = new Queue<
  MergeJobPayload | SplitJobPayload | CompressJobPayload | PdfToImageJobPayload | ImageToPdfJobPayload
>(
  'document-processing',
  {
    connection: {
      host: redisUrl.hostname,
      port: Number(redisUrl.port) || 6379,
      password: redisUrl.password || undefined,
    },
  },
)
