'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { isValidEmail, isValidPassword } from './validation'

type SignupErrorBody = { error?: string; message?: string }

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailFieldError, setEmailFieldError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const canSubmit = isValidEmail(email) && isValidPassword(password) && !submitting

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    setEmailFieldError(null)
    setFormError(null)

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (res.status === 201) {
        router.push('/login?signup=success')
        return
      }

      const body = (await res.json().catch(() => ({}))) as SignupErrorBody
      if (res.status === 409) {
        setEmailFieldError('An account with this email already exists')
      } else {
        setFormError(body.message ?? 'Something went wrong. Please try again.')
      }
    } catch {
      setFormError('Network error. Please check your connection.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold tracking-tight text-gray-900">Sign up</h1>
      <p className="mb-8 text-gray-500">Create an account to get started.</p>

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
            onChange={(e) => {
              setEmail(e.target.value)
              setEmailFieldError(null)
            }}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {emailFieldError && (
            <p className="mt-1 text-sm text-red-600" role="alert">
              {emailFieldError}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-400">8-72 characters</p>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-2 w-full rounded-xl bg-blue-600 px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Creating account…' : 'Sign up'}
        </button>
      </form>
    </main>
  )
}
