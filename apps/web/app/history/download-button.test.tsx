import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { JobType } from '@ilovepdf/shared'
import DownloadButton from './download-button'

describe('DownloadButton', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // jsdom doesn't implement navigation; stub `location` so assigning `.href` is observable.
    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: { href: '' },
    })
  })

  it('fetches the per-type download url and navigates the browser to it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ url: 'https://storage.example.com/file.pdf?sig=abc' }),
      }),
    )

    render(<DownloadButton jobId="job-1" jobType={JobType.COMPRESS} />)
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))

    expect(fetch).toHaveBeenCalledWith('/api/compress/jobs/job-1/download')
    await waitFor(() =>
      expect(window.location.href).toBe('https://storage.example.com/file.pdf?sig=abc'),
    )
  })

  it('uses the lowercase job type in the request path for each job type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: 'https://x/y.pdf' }) }),
    )

    render(<DownloadButton jobId="job-2" jobType={JobType.MERGE} />)
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))

    expect(fetch).toHaveBeenCalledWith('/api/merge/jobs/job-2/download')
  })

  it('maps the multi-word PDF_TO_IMAGE job type to its kebab-case route slug', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: 'https://x/y.zip' }) }),
    )

    render(<DownloadButton jobId="job-3" jobType={JobType.PDF_TO_IMAGE} />)
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))

    expect(fetch).toHaveBeenCalledWith('/api/pdf-to-image/jobs/job-3/download')
  })

  it('maps the multi-word IMAGE_TO_PDF job type to its kebab-case route slug', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: 'https://x/y.pdf' }) }),
    )

    render(<DownloadButton jobId="job-4" jobType={JobType.IMAGE_TO_PDF} />)
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))

    expect(fetch).toHaveBeenCalledWith('/api/image-to-pdf/jobs/job-4/download')
  })

  it('shows an error message and does not navigate when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

    render(<DownloadButton jobId="job-1" jobType={JobType.SPLIT} />)
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))

    expect(await screen.findByText('Download failed. Please try again.')).toBeInTheDocument()
    expect(window.location.href).toBe('')
  })

  it('shows an error message when the fetch itself rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))

    render(<DownloadButton jobId="job-1" jobType={JobType.SPLIT} />)
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))

    expect(await screen.findByText('Download failed. Please try again.')).toBeInTheDocument()
  })
})
