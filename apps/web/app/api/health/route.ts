import { NextResponse } from 'next/server'
import { checkDatabaseConnection } from '@/lib/db'

export async function GET() {
  const timestamp = new Date().toISOString()
  const isDatabaseHealthy = await checkDatabaseConnection()

  if (isDatabaseHealthy) {
    return NextResponse.json({ status: 'ok', database: 'ok', timestamp }, { status: 200 })
  }

  return NextResponse.json(
    { status: 'degraded', database: 'error', timestamp },
    { status: 503 },
  )
}
