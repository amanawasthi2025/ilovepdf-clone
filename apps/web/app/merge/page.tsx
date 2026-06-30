'use client'

import { useCallback, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useDropzone } from 'react-dropzone'
import type { FileRejection } from 'react-dropzone'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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
// SortableFileRow
// ---------------------------------------------------------------------------

function SortableFileRow({
  entry,
  isFirst,
  isLast,
  disabled,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  entry: FileEntry
  isFirst: boolean
  isLast: boolean
  disabled: boolean
  onRemove: (id: string) => void
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: entry.id, disabled })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={[
        'flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm',
        isDragging ? 'opacity-50 shadow-lg ring-2 ring-blue-400' : '',
      ].join(' ')}
    >
      {/* Drag handle */}
      <button
        type="button"
        {...listeners}
        {...attributes}
        disabled={disabled}
        className="shrink-0 cursor-grab touch-none text-gray-300 hover:text-gray-500 disabled:cursor-not-allowed"
        aria-label="Drag to reorder"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
          <path d="M7 2a2 2 0 110 4 2 2 0 010-4zm6 0a2 2 0 110 4 2 2 0 010-4zM7 8a2 2 0 110 4 2 2 0 010-4zm6 0a2 2 0 110 4 2 2 0 010-4zM7 14a2 2 0 110 4 2 2 0 010-4zm6 0a2 2 0 110 4 2 2 0 010-4z" />
        </svg>
      </button>

      {/* File info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{entry.file.name}</p>
        <p className="text-xs text-gray-400">{formatBytes(entry.file.size)}</p>
      </div>

      {/* Up / down buttons */}
      <div className="flex flex-col">
        <button
          type="button"
          onClick={() => onMoveUp(entry.id)}
          disabled={isFirst || disabled}
          className="rounded p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label={`Move ${entry.file.name} up`}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onMoveDown(entry.id)}
          disabled={isLast || disabled}
          className="rounded p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label={`Move ${entry.file.name} down`}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Remove */}
      <button
        type="button"
        onClick={() => onRemove(entry.id)}
        disabled={disabled}
        className="shrink-0 rounded p-1 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label={`Remove ${entry.file.name}`}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MergePage
// ---------------------------------------------------------------------------

export default function MergePage() {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [rejections, setRejections] = useState<Rejection[]>([])
  const [phase, setPhase] = useState<Phase>('IDLE')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [mergeError, setMergeError] = useState<string | null>(null)

  const isIdle = phase === 'IDLE'

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // File drop handler
  const handleDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      setUploadError(null)

      const sizeAndTypeErrors: Rejection[] = fileRejections.map(({ file, errors }) => ({
        name: file.name,
        error:
          errors[0]?.code === 'file-too-large'
            ? `"${file.name}" exceeds the 50 MB per-file limit.`
            : `"${file.name}" is not a PDF file.`,
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
    accept: { 'application/pdf': ['.pdf'] },
    maxSize: MAX_FILE_SIZE_BYTES,
    multiple: true,
    disabled: !isIdle,
    onDrop: handleDrop,
  })

  // List reorder via DnD
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setFiles((prev) => {
        const from = prev.findIndex((f) => f.id === active.id)
        const to = prev.findIndex((f) => f.id === over.id)
        return arrayMove(prev, from, to)
      })
    }
  }

  // List reorder via buttons
  function handleMoveUp(id: string) {
    setFiles((prev) => {
      const idx = prev.findIndex((f) => f.id === id)
      return idx > 0 ? arrayMove(prev, idx, idx - 1) : prev
    })
  }

  function handleMoveDown(id: string) {
    setFiles((prev) => {
      const idx = prev.findIndex((f) => f.id === id)
      return idx < prev.length - 1 ? arrayMove(prev, idx, idx + 1) : prev
    })
  }

  function handleRemove(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  // Submit
  async function handleMerge() {
    if (files.length < MIN_FILES || !isIdle) return

    setPhase('UPLOADING')
    setUploadError(null)

    const formData = new FormData()
    files.forEach(({ file }) => formData.append('files', file))

    try {
      const res = await fetch('/api/merge/jobs', { method: 'POST', body: formData })
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
    queryKey: ['job-status', jobId],
    enabled: phase === 'PROCESSING' && jobId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === 'COMPLETED' || status === 'FAILED') return false
      return 2000
    },
    queryFn: async () => {
      const res = await fetch(`/api/merge/jobs/${jobId}/status`)
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
      setMergeError(jobStatus.errorMessage ?? 'An unknown error occurred.')
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
        <p className="text-lg font-medium text-gray-700">Merging your files…</p>
        <p className="text-sm text-gray-400">
          Combining {files.length} PDF{files.length !== 1 ? 's' : ''}
        </p>
      </main>
    )
  }

  // ---------------------------------------------------------------------------
  // DONE state
  // ---------------------------------------------------------------------------
  if (phase === 'DONE' && jobId) {
    const handleDownload = async () => {
      const res = await fetch(`/api/merge/jobs/${jobId}/download`)
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
      setMergeError(null)
      setPhase('IDLE')
    }

    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Your PDFs have been merged successfully</h2>
        <p className="text-sm text-gray-400">Your file will be available for download for 1 hour.</p>
        <button
          type="button"
          onClick={handleDownload}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-3.5 text-base font-semibold text-white transition-colors hover:bg-blue-700"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download merged PDF
        </button>
        <button
          type="button"
          onClick={resetToIdle}
          className="text-sm text-blue-600 hover:underline"
        >
          Merge more PDFs
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
      setMergeError(null)
      setPhase('IDLE')
    }

    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Merge failed</h2>
        <p className="text-sm text-gray-500">
          {mergeError ?? 'Something went wrong while processing your files.'}
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
      <h1 className="mb-2 text-3xl font-bold tracking-tight text-gray-900">Merge PDFs</h1>
      <p className="mb-8 text-gray-500">
        Combine multiple PDF files into one, in the order you choose.
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
            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
          />
        </svg>
        <p className="text-base font-medium text-gray-700">
          {isDragActive ? 'Drop your PDFs here…' : 'Drag PDF files here, or click to browse'}
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

      {/* File list */}
      {files.length > 0 && (
        <>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={files.map((f) => f.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="mb-4 space-y-2">
                {files.map((entry, index) => (
                  <li key={entry.id}>
                    <SortableFileRow
                      entry={entry}
                      isFirst={index === 0}
                      isLast={index === files.length - 1}
                      disabled={!isIdle}
                      onRemove={handleRemove}
                      onMoveUp={handleMoveUp}
                      onMoveDown={handleMoveDown}
                    />
                  </li>
                ))}
              </ul>
            </SortableContext>
          </DndContext>

          <p className="mb-4 text-right text-sm text-gray-400">
            {files.length} / {MAX_FILES} files
          </p>
        </>
      )}

      {/* Merge button */}
      <button
        type="button"
        onClick={handleMerge}
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
          'Merge PDFs'
        )}
      </button>

      {files.length === 1 && (
        <p className="mt-2 text-center text-sm text-gray-400">
          Add at least one more PDF to enable merging
        </p>
      )}
    </main>
  )
}
