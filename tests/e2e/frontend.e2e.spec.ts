import { expect, test, type Page } from '@playwright/test'

// `/` serves the app hub/launcher (src/app/(hub)), a login-gated dashboard that
// lists the internal apps a signed-in user may open. The Offer & New Hire
// Request Manager (src/app/(offers)) is one such app and now serves at
// `/offers` instead of `/`. This is a committed smoke test only — it renders
// the hub, then the Offer Manager shell and one record round-trip, and
// deliberately does not touch export/print paths.
//
// Credentials come from E2E_EMAIL / E2E_PASSWORD (a real user in the target
// DB). Without them the suite skips rather than fails, so `bun run test:e2e`
// stays green on machines without a seeded login.

const HUB_URL = 'http://localhost:3000/'
const APP_URL = 'http://localhost:3000/offers'
const KERN_URL = 'http://localhost:3000/kern'
const EMAIL = process.env.E2E_EMAIL || ''
const PASSWORD = process.env.E2E_PASSWORD || ''

async function signIn(page: Page): Promise<void> {
  await page.goto(APP_URL)
  // Unauthenticated hits redirect to /login.
  if (!page.url().includes('/login')) return
  await page.locator('.signin-card input[type="email"]').fill(EMAIL)
  await page.locator('.signin-card input[type="password"]').fill(PASSWORD)
  await page.locator('.signin-card button[type="submit"]').click()
  // Sign-in always lands on the hub, not back on the app that triggered the
  // login redirect — go there next explicitly.
  await page.waitForURL(HUB_URL)
  await page.goto(APP_URL)
}

test.describe('Offer & New Hire Request Manager @ /offers', () => {
  test.skip(!EMAIL || !PASSWORD, 'Set E2E_EMAIL and E2E_PASSWORD to run the app smoke test.')

  test('gates unauthenticated visitors at /login', async ({ page }) => {
    await page.goto(APP_URL)
    await expect(page).toHaveURL(/\/login/)
    await expect(page.locator('.signin-title')).toBeVisible()
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

// The Kern Org Manager (src/app/(kern)) at /kern. Phase 1 keeps its org
// document in localStorage, so this smoke test asserts the shell, the 16-tab
// bar, and that a chart-bearing tab mounts ECharts without throwing — it does
// not mutate anything.
test.describe('Kern Org Manager @ /kern', () => {
  test.skip(!EMAIL || !PASSWORD, 'Set E2E_EMAIL and E2E_PASSWORD to run the app smoke test.')

  test('gates unauthenticated visitors at /login', async ({ page }) => {
    await page.goto(KERN_URL)
    await expect(page).toHaveURL(/\/login/)
  })

  test('renders the shell and all 16 tabs', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))

    await signIn(page)
    await page.goto(KERN_URL)

    await expect(page).toHaveTitle('Kern Org Manager')
    await expect(page.locator('.kern header h1')).toHaveText('Kern Org Manager')
    await expect(page.locator('.session-bar .sb-user')).toContainText('Signed in as')

    const tabs = page.locator('.kern nav.tabs .tab')
    await expect(tabs).toHaveCount(16)
    await expect(tabs.nth(0)).toContainText('Branches')
    await expect(tabs.nth(15)).toContainText('Org Builder')

    // The seed loads through the storage seam, so the branch table has rows.
    await expect(page.locator('.kern table.tbl-center tbody tr').first()).toBeVisible()

    expect(errors).toEqual([])
  })

  test('a chart tab mounts ECharts and syncs ?tab=', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))

    await signIn(page)
    await page.goto(KERN_URL)
    await page.locator('.kern nav.tabs .tab', { hasText: 'Analysis' }).click()

    await expect(page).toHaveURL(/\?tab=analysis/)
    // ECharts renders into a <canvas> inside .chart-canvas once it loads.
    await expect(page.locator('.kern .chart-canvas canvas').first()).toBeVisible({
      timeout: 15000,
    })
    expect(errors).toEqual([])
  })

  test('the tab in ?tab= survives a reload', async ({ page }) => {
    await signIn(page)
    await page.goto(`${KERN_URL}?tab=hierarchy`)
    await expect(page.locator('.kern nav.tabs .tab.active')).toContainText('Hierarchy')
  })
})

test.describe('App hub @ /', () => {
  test.skip(!EMAIL || !PASSWORD, 'Set E2E_EMAIL and E2E_PASSWORD to run the app smoke test.')

  test('renders an app row linking to /offers', async ({ page }) => {
    await signIn(page)
    await page.goto(HUB_URL)
    await expect(page.locator('a[href="/offers"]')).toBeVisible()
  })

  test('renders an app row linking to /kern', async ({ page }) => {
    await signIn(page)
    await page.goto(HUB_URL)
    await expect(page.locator('a[href="/kern"]')).toBeVisible()
  })
})
