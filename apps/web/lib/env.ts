import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  MINIO_ENDPOINT: z.string().min(1),
  MINIO_PORT: z.coerce.number().int().positive(),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  MINIO_BUCKET_NAME: z.string().min(1),
  MINIO_USE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  MAX_FILE_SIZE_BYTES: z.coerce.number().int().positive().default(52428800),
  MAX_TOTAL_SIZE_BYTES: z.coerce.number().int().positive().default(209715200),
  FILE_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  DOWNLOAD_URL_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  AUTH_SECRET: z.string().min(1),
})

export const env = envSchema.parse(process.env)
