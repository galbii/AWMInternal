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

// E2E_BASE_URL lets the suite target a server on another port (the default
// matches playwright.config.ts's webServer).
const BASE = (process.env.E2E_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '')
const HUB_URL = BASE + '/'
const APP_URL = BASE + '/offers'
const KERN_URL = BASE + '/kern'
const EMAIL = process.env.E2E_EMAIL || ''
const PASSWORD = process.env.E2E_PASSWORD || ''

async function signIn(page: Page): Promise<void> {
  await page.goto(APP_URL)
  // Unauthenticated hits redirect to /login.
  if (!page.url().includes('/login')) return
  await page.locator('.signin-box input[type="email"]').fill(EMAIL)
  await page.locator('.signin-box input[type="password"]').fill(PASSWORD)
  await page.locator('.signin-box button[type="submit"]').click()
  // Sign-in honours `?next=` (deep links land back on the app) but falls back
  // to the hub — accept either, then go to the app explicitly.
  await page.waitForURL((u) => !String(u).includes('/login'))
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

    // The sidebar (`nav.tabbar`, restyled vertical) always lists Pipeline /
    // Hired / Archived / All / Analysis; Editor appears only while a record is
    // open, so assert "at least five" and check by label, not position.
    const tabs = page.locator('nav.tabbar button')
    expect(await tabs.count()).toBeGreaterThanOrEqual(5)
    await expect(tabs.nth(0)).toContainText('Pipeline')
    await expect(tabs.filter({ hasText: 'All' })).toHaveCount(1)
    await expect(tabs.filter({ hasText: 'Analysis' })).toHaveCount(1)

    expect(errors).toEqual([])
  })

  test('new request autosaves and lands in the pipeline', async ({ page }) => {
    await signIn(page)

    const name = 'Playwright Smoke ' + Date.now().toString(36)
    // "New Request" lives in the corner action hub: open the disc, then pick
    // the hero row (a menuitem whose accessible name includes its hint line).
    await page.getByRole('button', { name: 'Quick actions' }).click()
    await page.getByRole('menuitem', { name: /New Request/ }).click()
    await page.locator('[data-fid="employeeName"] input').fill(name)

    // Autosave is debounced at 600ms (S2 618–636) — let it commit before
    // leaving the editor view, then the pipeline table is the signal.
    await page.waitForTimeout(1200)
    await page.locator('nav.tabbar button').first().click()
    // All four stage tables are mounted (hidden views included) — the pipeline
    // table is the first.
    const pipelineBody = page.locator('table.stage-table tbody').first()
    await expect(pipelineBody).toContainText(name, { timeout: 5000 })

    // Clean up so re-runs don't accumulate smoke rows (records now persist
    // server-side, not in this browser's localStorage). Delete lives behind
    // the row's "More actions" (⋯) menu.
    page.on('dialog', (d) => void d.accept())
    const row = pipelineBody.locator('tr', { hasText: name })
    await row.getByRole('button', { name: 'More actions' }).click()
    await row.getByRole('button', { name: 'Delete…' }).click()
    // The app uses its own confirm modal, not window.confirm.
    const modalContinue = page.getByRole('button', { name: 'Continue' })
    if (await modalContinue.isVisible().catch(() => false)) await modalContinue.click()
    await expect(pipelineBody).not.toContainText(name, { timeout: 5000 })
    // The provider persists AFTER the optimistic state update (fire-and-forget
    // POST). Give that request time to land before the browser closes, or the
    // delete never reaches the server and smoke rows accumulate in the DB.
    await page.waitForTimeout(1500)
  })

  test('cancel discards a new request and returns to the pipeline', async ({ page }) => {
    await signIn(page)

    const name = 'Playwright Cancel ' + Date.now().toString(36)
    await page.getByRole('button', { name: 'Quick actions' }).click()
    await page.getByRole('menuitem', { name: /New Request/ }).click()
    await page.locator('[data-fid="employeeName"] input').fill(name)

    // Past the 600ms autosave, so a DRAFT really exists to be discarded —
    // cancelling before the debounce would prove nothing.
    await page.waitForTimeout(1200)

    // On a new request the button is "Cancel"; on an opened record, "Close".
    // Every view stays MOUNTED and is shown/hidden by `.view.active`, so the
    // editor's buttons never leave the DOM — the active tab is the signal.
    await page.locator('#btnCancel').click()
    const modalContinue = page.getByRole('button', { name: 'Continue' })
    if (await modalContinue.isVisible().catch(() => false)) await modalContinue.click()

    // Back on a list view, and the draft is gone rather than left as litter.
    const pipelineBody = page.locator('table.stage-table tbody').first()
    await expect(page.locator('nav.tabbar button.tab.active')).toContainText('Pipeline')
    await expect(pipelineBody).not.toContainText(name, { timeout: 5000 })
    await page.waitForTimeout(1500)
  })
})

// The Kern Org Manager (src/app/(kern)) at /kern. Phase 1 keeps its org
// document in localStorage, so this smoke test asserts the shell, the tab bar
// (the source's 16 plus Users), and that a chart-bearing tab mounts ECharts
// without throwing — it does not mutate anything.
test.describe('Kern Org Manager @ /kern', () => {
  test.skip(!EMAIL || !PASSWORD, 'Set E2E_EMAIL and E2E_PASSWORD to run the app smoke test.')

  test('gates unauthenticated visitors at /login', async ({ page }) => {
    await page.goto(KERN_URL)
    await expect(page).toHaveURL(/\/login/)
  })

  test('renders the shell and all 17 tabs', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))

    await signIn(page)
    await page.goto(KERN_URL)

    await expect(page).toHaveTitle('Kern Org Manager')
    await expect(page.locator('.kern header h1')).toHaveText('Kern Org Manager')
    await expect(page.locator('.session-bar .sb-user')).toContainText('Signed in as')

    // The source's 16 tabs, plus the per-app Users view (2026-09). That last
    // one is admin/dev only (2026-09-25), so E2E_EMAIL must be a manager —
    // a plain user correctly sees 16.
    const tabs = page.locator('.kern nav.tabs .tab')
    await expect(tabs).toHaveCount(17)
    await expect(tabs.nth(0)).toContainText('Branches')
    await expect(tabs.nth(15)).toContainText('Org Builder')
    await expect(tabs.nth(16)).toContainText('Users')

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

// The public request form needs no session, so this block always runs.
test.describe('Public new-hire request form @ /apply', () => {
  const APPLY_URL = BASE + '/apply'

  test('renders the form without signing in', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await page.goto(APPLY_URL)
    await expect(page).toHaveURL(/\/apply$/)
    await expect(page).toHaveTitle('New hire request')
    await expect(page.locator('.apply-hero h1')).toHaveText('Request a new hire')
    await expect(page.locator('[data-fid="employeeName"] input')).toBeVisible()
    // HR's custom letter-wording card is not a requester's business.
    await expect(page.locator('#sec-pay-wording')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Send request' })).toBeVisible()
    expect(errors).toEqual([])
  })

  test('will not send with required fields empty', async ({ page }) => {
    await page.goto(APPLY_URL)
    await page.getByRole('button', { name: 'Send request' }).click()
    await expect(page.locator('.apply-error')).toBeVisible()
    await expect(page.locator('.fld.missing').first()).toBeVisible()
    // Still on the form — nothing was created.
    await expect(page.locator('.apply-done')).toHaveCount(0)
  })
})

// The Users app (src/app/(users)) at /users — admin/dev only. The redirect
// needs no credentials; the directory itself does.
test.describe('Users @ /users', () => {
  const USERS_URL = BASE + '/users'

  test('gates unauthenticated visitors at /login with a return path', async ({ page }) => {
    await page.goto(USERS_URL)
    await expect(page).toHaveURL(/\/login\?next=%2Fusers/)
  })

  test('renders the directory for an admin', async ({ page }) => {
    test.skip(!EMAIL || !PASSWORD, 'Set E2E_EMAIL and E2E_PASSWORD (an admin) to run this.')
    await signIn(page)
    await page.goto(USERS_URL)
    // A non-admin account is bounced to the hub — accept that outcome too.
    if (!page.url().includes('/users')) return
    await expect(page.locator('.us-head h1')).toHaveText('Users')
    await expect(page.locator('table.us-table tbody tr').first()).toBeVisible()
    await expect(page.locator('.us-you')).toHaveCount(1)
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
