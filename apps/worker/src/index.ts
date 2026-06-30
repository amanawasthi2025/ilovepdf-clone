import process from 'node:process'
import { Worker } from 'bullmq'
import type { Job } from 'bullmq'
import type { MergeJobPayload, SplitJobPayload } from '@ilovepdf/shared'
import { env } from './lib/env.js'
import { logger } from './lib/logger.js'
import { processMergeJob } from './jobs/merge.js'
import { processSplitJob } from './jobs/split.js'

const redisUrl = new URL(env.REDIS_URL)

const worker = new Worker<MergeJobPayload | SplitJobPayload>(
  'document-processing',
  async (job) => {
    if (job.name === 'merge') {
      return processMergeJob(job as Job<MergeJobPayload>)
    }
    if (job.name === 'split') {
      return processSplitJob(job as Job<SplitJobPayload>)
    }
    logger.warn({ jobName: job.name }, 'unknown job type received — skipping')
  },
  {
    connection: {
      host: redisUrl.hostname,
      port: Number(redisUrl.port) || 6379,
      password: redisUrl.password || undefined,
    },
    concurrency: env.WORKER_CONCURRENCY,
  },
)

worker.on('completed', (job) => {
  logger.info({ jobId: job.data.jobId }, 'bullmq job completed')
})

worker.on('failed', (job, error) => {
  logger.error({ jobId: job?.data.jobId, error }, 'bullmq job failed')
})

logger.info({ concurrency: env.WORKER_CONCURRENCY }, 'document processing worker started')

async function shutdown(): Promise<void> {
  logger.info('shutting down worker gracefully')
  await worker.close()
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown())
process.on('SIGINT', () => void shutdown())
