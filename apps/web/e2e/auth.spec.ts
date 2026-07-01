import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient()

function uniqueEmail(): string {
  return `e2e-auth-${randomUUID()}@example.com`
}

const PASSWORD = 'correct-horse-battery-staple'

test.afterAll(async () => {
  await prisma.$disconnect()
})

// AC-27: signup → login → nav shows logged-in state → reload persists session → logout → nav shows logged-out state
test('full auth flow: signup, login, session persists on reload, logout', async ({ page }) => {
  const email = uniqueEmail()

  try {
    await page.goto('/signup')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign up' }).click()

    // Redirected to /login with a success message
    await expect(page).toHaveURL(/\/login\?signup=success/)
    await expect(page.getByText('Account created — log in to continue')).toBeVisible()

    // Logged-out nav is showing before login
    await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sign up' })).toBeVisible()

    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Log in' }).click()

    // Full navigation back to home; nav now shows the logged-in state
    await expect(page).toHaveURL('/')
    await expect(page.getByText(email)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()

    // AC-14: session cookie is HTTP-only, not readable from the page
    const cookieVisibleToJs = await page.evaluate(() => document.cookie.includes('authjs.session-token'))
    expect(cookieVisibleToJs).toBe(false)

    // AC-18: reload persists the session with no flash of the logged-out state
    await page.reload()
    await expect(page.getByText(email)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()

    // Logout reverts the nav
    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sign up' })).toBeVisible()
    await expect(page.getByText(email)).not.toBeVisible()
  } finally {
    await prisma.user.deleteMany({ where: { email } })
  }
})

// AC-28: duplicate-email signup and wrong-password login both show their respective error states
test('duplicate email signup and wrong-password login show error states without crashing', async ({ page }) => {
  const email = uniqueEmail()

  try {
    await page.goto('/signup')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign up' }).click()
    await expect(page).toHaveURL(/\/login\?signup=success/)

    // Duplicate signup with the same email
    await page.goto('/signup')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign up' }).click()

    await expect(page.getByText('An account with this email already exists')).toBeVisible()
    // Form values remain intact, no navigation away
    await expect(page).toHaveURL('/signup')
    await expect(page.getByLabel('Email')).toHaveValue(email)

    // Wrong password on login
    await page.goto('/login')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('wrong-password-entirely')
    await page.getByRole('button', { name: 'Log in' }).click()

    await expect(page.getByRole('alert').filter({ hasText: 'Invalid email or password' })).toBeVisible()
    await expect(page).toHaveURL('/login')

    // Nav still shows logged-out state — no partial/crashed session was created
    await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible()
  } finally {
    await prisma.user.deleteMany({ where: { email } })
  }
})
