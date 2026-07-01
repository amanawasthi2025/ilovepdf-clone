import Link from 'next/link'
import { auth, signOut } from '@/lib/auth'

export default async function Nav() {
  const session = await auth()

  return (
    <header className="flex items-center justify-end gap-4 border-b border-gray-200 px-4 py-3">
      {session?.user?.email ? (
        <form
          action={async () => {
            'use server'
            await signOut({ redirectTo: '/' })
          }}
          className="flex items-center gap-3"
        >
          <Link href="/history" className="text-sm font-medium text-gray-700 hover:underline">
            History
          </Link>
          <span className="text-sm text-gray-600">{session.user.email}</span>
          <button type="submit" className="text-sm font-medium text-blue-600 hover:underline">
            Log out
          </button>
        </form>
      ) : (
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm font-medium text-gray-700 hover:underline">
            Log in
          </Link>
          <Link href="/signup" className="text-sm font-medium text-blue-600 hover:underline">
            Sign up
          </Link>
        </div>
      )}
    </header>
  )
}
