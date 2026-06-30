import {
  S3Client,
  PutObjectCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3'
import { env } from './env'

const protocol = env.MINIO_USE_SSL ? 'https' : 'http'

export const s3Client = new S3Client({
  endpoint: `${protocol}://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`,
  region: 'us-east-1',
  credentials: {
    accessKeyId: env.MINIO_ACCESS_KEY,
    secretAccessKey: env.MINIO_SECRET_KEY,
  },
  forcePathStyle: true,
})

let bucketReady = false

export async function ensureBucketExists(): Promise<void> {
  if (bucketReady) return
  try {
    await s3Client.send(new CreateBucketCommand({ Bucket: env.MINIO_BUCKET_NAME }))
  } catch (err) {
    const code = (err as { Code?: string; name?: string }).Code ?? (err as { name?: string }).name
    if (code !== 'BucketAlreadyOwnedByYou' && code !== 'BucketAlreadyExists') {
      throw err
    }
  }
  bucketReady = true
}

export async function uploadFile(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: env.MINIO_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )
}
