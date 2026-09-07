import { expect, test, type Page } from '@playwright/test'

// `/` serves the Offer & New Hire Request Manager (src/app/(app)), now behind
// a login gate with Payload-backed persistence. This is a committed smoke test
// only — it renders the shell and one record round-trip, and deliberately does
// not touch export/print paths.
//
// Credentials come from E2E_EMAIL / E2E_PASSWORD (a real user in the target
// DB). Without them the suite skips rather than fails, so `bun run test:e2e`
// stays green on machines without a seeded login.

const APP_URL = 'http://localhost:3000/'
const EMAIL = process.env.E2E_EMAIL || ''
const PASSWORD = process.env.E2E_PASSWORD || ''

async function signIn(page: Page): Promise<void> {
  await page.goto(APP_URL)
  // Unauthenticated hits redirect to /login.
  if (!page.url().includes('/login')) return
  await page.locator('.login-card input[type="email"]').fill(EMAIL)
  await page.locator('.login-card input[type="password"]').fill(PASSWORD)
  await page.locator('.login-card button[type="submit"]').click()
  await page.waitForURL(APP_URL)
}

test.describe('Offer & New Hire Request Manager @ /', () => {
  test.skip(!EMAIL || !PASSWORD, 'Set E2E_EMAIL and E2E_PASSWORD to run the app smoke test.')

  test('gates unauthenticated visitors at /login', async ({ page }) => {
    await page.goto(APP_URL)
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.locator('.login-card h1')).toBeVisible()
  })

  test('renders the app shell after sign-in', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))

    await signIn(page)

    await expect(page).toHaveTitle('Offer & New Hire Request Manager')
    await expect(page.locator('header.app h1')).toHaveText('Offer & New Hire Request Manager')
    await expect(page.locator('.session-bar .sb-user')).toContainText('Signed in as')

    // Pipeline / Hired / Archived / Analysis are always present; Editor is hidden
    // until a record is open, so assert "at least four".
    const tabs = page.locator('nav.tabbar button')
    expect(await tabs.count()).toBeGreaterThanOrEqual(4)
    await expect(tabs.nth(0)).toContainText('Pipeline')
    await expect(tabs.nth(3)).toContainText('Analysis')

    expect(errors).toEqual([])
  })

  test('new request autosaves and lands in the pipeline', async ({ page }) => {
    await signIn(page)

    const name = 'Playwright Smoke ' + Date.now().toString(36)
    // Two "+ New Request" buttons exist once records are present (header +
    // record-list panel) — target the header one.
    await page.getByRole('banner').getByRole('button', { name: '+ New Request' }).click()
    await page.locator('[data-fid="employeeName"] input').fill(name)

    // Autosave is debounced at 600ms (S2 618–636) — let it commit before
    // leaving the editor view, then the pipeline table is the signal.
    await page.waitForTimeout(1200)
    await page.locator('nav.tabbar button').first().click()
    // All three stage tables are mounted (hidden tabs included) — the pipeline
    // table is the first.
    const pipelineBody = page.locator('table.stage-table tbody').first()
    await expect(pipelineBody).toContainText(name, { timeout: 5000 })

    // Clean up so re-runs don't accumulate smoke rows (records now persist
    // server-side, not in this browser's localStorage).
    page.on('dialog', (d) => void d.accept())
    const row = pipelineBody.locator('tr', { hasText: name })
    await row.getByRole('button', { name: 'Delete' }).click()
    // The app uses its own confirm modal, not window.confirm.
    const modalContinue = page.getByRole('button', { name: 'Continue' })
    if (await modalContinue.isVisible().catch(() => false)) await modalContinue.click()
    await expect(pipelineBody).not.toContainText(name, { timeout: 5000 })
  })
})
