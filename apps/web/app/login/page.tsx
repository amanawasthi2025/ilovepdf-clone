'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'

function LoginForm() {
  const searchParams = useSearchParams()
  const showSignupSuccess = searchParams.get('signup') === 'success'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const canSubmit = email.length > 0 && password.length > 0 && !submitting

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    setFormError(null)

    try {
      const result = await signIn('credentials', { email, password, redirect: false })
      if (result?.error) {
        setFormError('Invalid email or password')
        return
      }
      // A full navigation (not router.push) so the root layout's Nav server component
      // re-reads auth() against the new session cookie — router.push reuses the cached
      // logged-out layout render from before login, per manual verification.
      window.location.href = '/'
    } catch {
      setFormError('Network error. Please check your connection.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold tracking-tight text-gray-900">Log in</h1>
      <p className="mb-8 text-gray-500">Welcome back.</p>

      {showSignupSuccess && (
        <div
          className="mb-4 flex items-start gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700"
          role="status"
        >
          <span>Account created — log in to continue</span>
        </div>
      )}

      {formError && (
        <div
          className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          <span>{formError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-2 w-full rounded-xl bg-blue-600 px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
