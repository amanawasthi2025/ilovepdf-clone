'use client'

import { useCallback, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDropzone } from 'react-dropzone'
import type { FileRejection } from 'react-dropzone'
import { formatBytes, MAX_FILE_SIZE_BYTES, MAX_FILES, MIN_FILES } from './validation'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FileEntry = {
  id: string
  file: File
}

type Rejection = {
  name: string
  error: string
}

type Phase = 'IDLE' | 'UPLOADING' | 'PROCESSING' | 'DONE' | 'ERROR'

type JobStatusResponse = {
  jobId: string
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  createdAt: string
  updatedAt: string
  errorMessage: string | null
}

// ---------------------------------------------------------------------------
// ImageToPdfPage
// ---------------------------------------------------------------------------

export default function ImageToPdfPage() {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [rejections, setRejections] = useState<Rejection[]>([])
  const [phase, setPhase] = useState<Phase>('IDLE')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [conversionError, setConversionError] = useState<string | null>(null)

  const isIdle = phase === 'IDLE'

  // File drop handler
  const handleDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      setUploadError(null)

      const sizeAndTypeErrors: Rejection[] = fileRejections.map(({ file, errors }) => ({
        name: file.name,
        error:
          errors[0]?.code === 'file-too-large'
            ? `"${file.name}" exceeds the 50 MB per-file limit.`
            : `"${file.name}" is not a PNG or JPEG image.`,
      }))

      // Enforce MAX_FILES — accept only what fits, reject the rest
      const slots = MAX_FILES - files.length
      const toAdd = acceptedFiles.slice(0, slots)
      const overLimitErrors: Rejection[] = acceptedFiles.slice(slots).map((f) => ({
        name: f.name,
        error: `"${f.name}" was not added — maximum of ${MAX_FILES} files already reached.`,
      }))

      setRejections([...sizeAndTypeErrors, ...overLimitErrors])
      if (toAdd.length > 0) {
        setFiles((prev) => [
          ...prev,
          ...toAdd.map((f) => ({ id: crypto.randomUUID(), file: f })),
        ])
      }
    },
    [files.length],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'] },
    maxSize: MAX_FILE_SIZE_BYTES,
    multiple: true,
    disabled: !isIdle,
    onDrop: handleDrop,
  })

  function handleRemove(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  // Submit
  async function handleConvert() {
    if (files.length < MIN_FILES || !isIdle) return

    setPhase('UPLOADING')
    setUploadError(null)

    const formData = new FormData()
    files.forEach(({ file }) => formData.append('files', file))

    try {
      const res = await fetch('/api/image-to-pdf/jobs', { method: 'POST', body: formData })
      if (!res.ok) {
        const body = (await res.json()) as { message?: string }
        throw new Error(body.message ?? 'Upload failed. Please try again.')
      }
      const { jobId: id } = (await res.json()) as { jobId: string }
      setJobId(id)
      setPhase('PROCESSING')
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Network error. Please check your connection.',
      )
      setPhase('IDLE')
    }
  }

  // ---------------------------------------------------------------------------
  // Status polling — active only while PROCESSING
  // ---------------------------------------------------------------------------
  const { data: jobStatus } = useQuery<JobStatusResponse>({
    queryKey: ['image-to-pdf-job-status', jobId],
    enabled: phase === 'PROCESSING' && jobId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === 'COMPLETED' || status === 'FAILED') return false
      return 2000
    },
    queryFn: async () => {
      const res = await fetch(`/api/image-to-pdf/jobs/${jobId}/status`)
      if (!res.ok) throw new Error('Failed to fetch job status')
      return res.json() as Promise<JobStatusResponse>
    },
  })

  // Drive phase transitions in an effect so setState is never called during render
  useEffect(() => {
    if (!jobStatus) return
    if (jobStatus.status === 'COMPLETED') {
      setPhase('DONE')
    } else if (jobStatus.status === 'FAILED') {
      setConversionError(jobStatus.errorMessage ?? 'An unknown error occurred.')
      setPhase('ERROR')
    }
  }, [jobStatus])

  // ---------------------------------------------------------------------------
  // PROCESSING state
  // ---------------------------------------------------------------------------
  if (phase === 'PROCESSING') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4">
        <svg className="h-10 w-10 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-lg font-medium text-gray-700">Converting your images…</p>
        <p className="text-sm text-gray-400">
          Building a PDF from {files.length} image{files.length !== 1 ? 's' : ''}
        </p>
      </main>
    )
  }

  // ---------------------------------------------------------------------------
  // DONE state
  // ---------------------------------------------------------------------------
  if (phase === 'DONE' && jobId) {
    const handleDownload = async () => {
      const res = await fetch(`/api/image-to-pdf/jobs/${jobId}/download`)
      if (!res.ok) return
      const { url } = (await res.json()) as { url: string }
      const a = document.createElement('a')
      a.href = url
      a.download = ''
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }

    const resetToIdle = () => {
      setFiles([])
      setJobId(null)
      setConversionError(null)
      setPhase('IDLE')
    }

    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Your PDF has been created successfully</h2>
        <p className="text-sm text-gray-400">Your file will be available for download for 1 hour.</p>
        <button
          type="button"
          onClick={handleDownload}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-3.5 text-base font-semibold text-white transition-colors hover:bg-blue-700"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download PDF
        </button>
        <button
          type="button"
          onClick={resetToIdle}
          className="text-sm text-blue-600 hover:underline"
        >
          Convert more images
        </button>
      </main>
    )
  }

  // ---------------------------------------------------------------------------
  // ERROR state
  // ---------------------------------------------------------------------------
  if (phase === 'ERROR') {
    const resetToIdle = () => {
      setFiles([])
      setJobId(null)
      setConversionError(null)
      setPhase('IDLE')
    }

    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Conversion failed</h2>
        <p className="text-sm text-gray-500">
          {conversionError ?? 'Something went wrong while processing your files.'}
        </p>
        <button
          type="button"
          onClick={resetToIdle}
          className="rounded-xl bg-gray-900 px-8 py-3.5 text-base font-semibold text-white transition-colors hover:bg-gray-700"
        >
          Try again
        </button>
      </main>
    )
  }

  // ---------------------------------------------------------------------------
  // IDLE / UPLOADING states
  // ---------------------------------------------------------------------------
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold tracking-tight text-gray-900">Image to PDF</h1>
      <p className="mb-8 text-gray-500">
        Combine one or more PNG or JPEG images into a single PDF, one full-page image per page,
        in upload order.
      </p>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={[
          'mb-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors',
          isDragActive
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100',
          !isIdle ? 'cursor-not-allowed opacity-60' : '',
        ].join(' ')}
      >
        <input {...getInputProps()} />
        <svg
          className={['mb-3 h-10 w-10', isDragActive ? 'text-blue-500' : 'text-gray-400'].join(' ')}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
          />
        </svg>
        <p className="text-base font-medium text-gray-700">
          {isDragActive ? 'Drop your images here…' : 'Drag PNG/JPEG images here, or click to browse'}
        </p>
        <p className="mt-1 text-sm text-gray-400">Up to {MAX_FILES} files · 50 MB each</p>
      </div>

      {/* Rejection errors */}
      {rejections.length > 0 && (
        <ul className="mb-4 space-y-1" role="alert">
          {rejections.map((r, i) => (
            <li
              key={i}
              className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              <svg className="mt-0.5 h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{r.error}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Upload error banner */}
      {uploadError && (
        <div
          className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          <svg className="mt-0.5 h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <span>{uploadError}</span>
        </div>
      )}

      {/* File list — upload order, no reordering */}
      {files.length > 0 && (
        <>
          <ul className="mb-4 space-y-2">
            {files.map((entry, index) => (
              <li
                key={entry.id}
                className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm"
              >
                <span className="shrink-0 text-xs font-medium text-gray-400">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{entry.file.name}</p>
                  <p className="text-xs text-gray-400">{formatBytes(entry.file.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(entry.id)}
                  disabled={!isIdle}
                  className="shrink-0 rounded p-1 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label={`Remove ${entry.file.name}`}
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>

          <p className="mb-4 text-right text-sm text-gray-400">
            {files.length} / {MAX_FILES} files
          </p>
        </>
      )}

      {/* Convert button */}
      <button
        type="button"
        onClick={handleConvert}
        disabled={files.length < MIN_FILES || !isIdle}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {phase === 'UPLOADING' ? (
          <>
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Uploading…
          </>
        ) : (
          'Convert to PDF'
        )}
      </button>
    </main>
  )
}
