import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { JobType } from '@ilovepdf/shared'
import DownloadButton from './download-button'

const JOB_TYPE_LABELS: Record<string, string> = {
  MERGE: 'Merge',
  SPLIT: 'Split',
  COMPRESS: 'Compress',
  PDF_TO_IMAGE: 'PDF to Image',
}

const HISTORY_LIMIT = 50

export default async function HistoryPage() {
  const session = await auth()
  if (!session?.user?.id) {
    redirect('/login')
  }

  const jobs = await prisma.job.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_LIMIT,
    select: {
      id: true,
      jobType: true,
      status: true,
      createdAt: true,
      errorMessage: true,
    },
  })

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold tracking-tight text-gray-900">Job History</h1>
      <p className="mb-8 text-gray-500">Your most recent {HISTORY_LIMIT} jobs.</p>

      {jobs.length === 0 ? (
        <p className="text-sm text-gray-500">You haven&apos;t submitted any jobs yet.</p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
          {jobs.map((job) => (
            <li key={job.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {JOB_TYPE_LABELS[job.jobType] ?? job.jobType}
                </p>
                <p className="text-xs text-gray-400">
                  {job.createdAt.toLocaleString()} · {job.status}
                </p>
                {job.status === 'FAILED' && job.errorMessage && (
                  <p className="mt-1 text-xs text-red-600">{job.errorMessage}</p>
                )}
              </div>
              {job.status === 'COMPLETED' && (
                <DownloadButton jobId={job.id} jobType={job.jobType as JobType} />
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
