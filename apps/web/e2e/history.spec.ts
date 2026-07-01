import { test, expect, type Page } from '@playwright/test'
import { PrismaClient, JobType } from '@prisma/client'
import { randomUUID } from 'crypto'
import { PDFDocument } from 'pdf-lib'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

const prisma = new PrismaClient()

const PASSWORD = 'correct-horse-battery-staple'

function uniqueEmail(): string {
  return `e2e-history-${randomUUID()}@example.com`
}

async function signupAndLogin(page: Page, email: string): Promise<void> {
  await page.goto('/signup')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign up' }).click()
  await expect(page).toHaveURL(/\/login\?signup=success/)

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL('/')
}

let tmpDir: string
let pdf1Path: string
let pdf2Path: string

test.beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'history-e2e-'))

  const makePdf = async () => {
    const doc = await PDFDocument.create()
    doc.addPage([300, 300])
    return Buffer.from(await doc.save())
  }

  pdf1Path = path.join(tmpDir, 'sample1.pdf')
  await fs.writeFile(pdf1Path, await makePdf())

  pdf2Path = path.join(tmpDir, 'sample2.pdf')
  await fs.writeFile(pdf2Path, await makePdf())
})

test.afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
  await prisma.$disconnect()
})

// AC-23: submit a job while logged in → job appears in /history with correct type/status → download succeeds
test('job submitted while logged in appears in history and downloads successfully', async ({ page }) => {
  const email = uniqueEmail()

  try {
    await signupAndLogin(page, email)

    await page.goto('/merge')
    await page.locator('input[type="file"]').setInputFiles([pdf1Path, pdf2Path])
    await page.getByRole('button', { name: 'Merge PDFs' }).click()
    await expect(page.getByText('Your PDFs have been merged successfully')).toBeVisible({
      timeout: 60_000,
    })

    await page.goto('/history')
    const row = page.getByRole('listitem').filter({ hasText: 'Merge' })
    await expect(row).toBeVisible()
    await expect(row.getByText('COMPLETED')).toBeVisible()

    const downloadPromise = page.waitForEvent('download')
    await row.getByRole('button', { name: 'Download' }).click()
    const download = await downloadPromise

    const downloadedPath = await download.path()
    expect(downloadedPath).not.toBeNull()
    const buffer = await fs.readFile(downloadedPath!)
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF')
  } finally {
    await prisma.user.deleteMany({ where: { email } })
  }
})

// AC-03/AC-14: a user's history never shows anonymous (userId null) jobs or another user's jobs
test("a user's history shows neither anonymous jobs nor another user's jobs", async ({ page }) => {
  const email = uniqueEmail()
  const otherUser = await prisma.user.create({
    data: { email: uniqueEmail(), passwordHash: 'irrelevant-for-this-test' },
  })
  const anonJob = await prisma.job.create({
    data: {
      jobType: JobType.MERGE,
      inputKeys: ['inputs/anon-history.pdf'],
      correlationId: randomUUID(),
      expiresAt: new Date(Date.now() + 3_600_000),
      userId: null,
    },
    select: { id: true },
  })
  await prisma.job.create({
    data: {
      jobType: JobType.SPLIT,
      inputKeys: ['inputs/other-user-history.pdf'],
      correlationId: randomUUID(),
      expiresAt: new Date(Date.now() + 3_600_000),
      userId: otherUser.id,
    },
  })

  try {
    await signupAndLogin(page, email)
    await page.goto('/history')
    await expect(page.getByText("You haven't submitted any jobs yet.")).toBeVisible()
  } finally {
    await prisma.job.delete({ where: { id: anonJob.id } }).catch(() => undefined)
    // onDelete: Cascade on Job.user removes otherUser's job along with its owner
    await prisma.user.deleteMany({ where: { email: { in: [email, otherUser.email] } } })
  }
})

// AC-24: /history redirects to /login when logged out; a job owned by one user returns
// 403 when its status/download endpoints are requested using a different user's session
test('history redirects when logged out, and cross-user access to an owned job is denied', async ({
  page,
  browser,
}) => {
  await page.goto('/history')
  await expect(page).toHaveURL('/login')

  const emailA = uniqueEmail()
  const emailB = uniqueEmail()
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()

  try {
    const pageA = await contextA.newPage()
    await signupAndLogin(pageA, emailA)
    const userA = await prisma.user.findUniqueOrThrow({ where: { email: emailA } })

    const seededJob = await prisma.job.create({
      data: {
        jobType: JobType.MERGE,
        inputKeys: ['inputs/seeded-history.pdf'],
        correlationId: randomUUID(),
        expiresAt: new Date(Date.now() + 3_600_000),
        userId: userA.id,
      },
      select: { id: true },
    })

    const pageB = await contextB.newPage()
    await signupAndLogin(pageB, emailB)

    const statusRes = await pageB.request.get(`/api/merge/jobs/${seededJob.id}/status`)
    expect(statusRes.status()).toBe(403)
    expect((await statusRes.json()).error).toBe('JOB_ACCESS_DENIED')

    const downloadRes = await pageB.request.get(`/api/merge/jobs/${seededJob.id}/download`)
    expect(downloadRes.status()).toBe(403)
    expect((await downloadRes.json()).error).toBe('JOB_ACCESS_DENIED')
  } finally {
    await contextA.close()
    await contextB.close()
    // onDelete: Cascade on Job.user removes the seeded job along with its owner
    await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB] } } })
  }
})
