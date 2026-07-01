'use client'

import { useState } from 'react'
import { JobType } from '@ilovepdf/shared'

type Props = {
  jobId: string
  jobType: JobType
}

const JOB_TYPE_ROUTE_SLUGS: Record<JobType, string> = {
  [JobType.MERGE]: 'merge',
  [JobType.SPLIT]: 'split',
  [JobType.COMPRESS]: 'compress',
  [JobType.PDF_TO_IMAGE]: 'pdf-to-image',
  [JobType.IMAGE_TO_PDF]: 'image-to-pdf',
}

export default function DownloadButton({ jobId, jobType }: Props) {
  const [error, setError] = useState<string | null>(null)

  async function handleDownload() {
    setError(null)
    try {
      const res = await fetch(`/api/${JOB_TYPE_ROUTE_SLUGS[jobType]}/jobs/${jobId}/download`)
      if (!res.ok) {
        setError('Download failed. Please try again.')
        return
      }
      const { url } = (await res.json()) as { url: string }
      window.location.href = url
    } catch {
      setError('Download failed. Please try again.')
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleDownload}
        className="text-sm font-medium text-blue-600 hover:underline"
      >
        Download
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}
