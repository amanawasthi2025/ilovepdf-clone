import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { logger } from '@/lib/logger'

const BCRYPT_SALT_ROUNDS = 10

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
})

type ErrorCode =
  | 'INVALID_EMAIL'
  | 'PASSWORD_TOO_SHORT'
  | 'PASSWORD_TOO_LONG'
  | 'EMAIL_ALREADY_REGISTERED'
  | 'INTERNAL_ERROR'

function errorResponse(code: ErrorCode, message: string, status: number): NextResponse {
  return NextResponse.json({ error: code, message }, { status })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse('INTERNAL_ERROR', 'Failed to parse request body.', 500)
  }

  const parsed = signupSchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    if (issue?.path[0] === 'email') {
      return errorResponse('INVALID_EMAIL', 'Please provide a valid email address.', 400)
    }
    if (issue?.code === 'too_small') {
      return errorResponse(
        'PASSWORD_TOO_SHORT',
        'Password must be at least 8 characters.',
        400,
      )
    }
    if (issue?.code === 'too_big') {
      return errorResponse('PASSWORD_TOO_LONG', 'Password must be at most 72 characters.', 400)
    }
    return errorResponse('INVALID_EMAIL', 'Please provide a valid email address.', 400)
  }

  const email = parsed.data.email.toLowerCase().trim()
  const passwordHash = await bcrypt.hash(parsed.data.password, BCRYPT_SALT_ROUNDS)

  try {
    const user = await prisma.user.create({
      data: { email, passwordHash },
      select: { id: true, email: true },
    })
    logger.info({ userId: user.id }, 'User signed up')
    return NextResponse.json(user, { status: 201 })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return errorResponse(
        'EMAIL_ALREADY_REGISTERED',
        'An account with this email already exists.',
        409,
      )
    }
    logger.error({ err }, 'Failed to create user')
    return errorResponse('INTERNAL_ERROR', 'Failed to create account.', 500)
  }
}
