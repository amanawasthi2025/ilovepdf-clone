import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import type { Readable } from 'node:stream'
import { env } from './env.js'

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

export async function downloadFile(key: string): Promise<Buffer> {
  const response = await s3Client.send(
    new GetObjectCommand({ Bucket: env.MINIO_BUCKET_NAME, Key: key }),
  )
  const stream = response.Body as Readable
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBuffer))
  }
  return Buffer.concat(chunks)
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
