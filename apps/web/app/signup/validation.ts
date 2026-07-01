import { z } from 'zod'

export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_LENGTH = 72

const emailSchema = z.string().email()

export function isValidEmail(email: string): boolean {
  return emailSchema.safeParse(email).success
}

export function isValidPassword(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH
}
