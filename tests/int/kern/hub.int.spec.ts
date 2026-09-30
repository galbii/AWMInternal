// The hub wiring for the Kern app.
//
// The registry decides what a user SEES on the hub and what requireApp('kern')
// lets through — a UX filter, not a security boundary. Since 2026-09 the app
// is MEMBERSHIP-MANAGED: admins/devs always open it, everyone else needs it on
// their `apps` list. These tests pin the visibility rules so a registry edit
// can't silently expose or hide the app.

import { describe, expect, test } from 'bun:test'

import { APPS, appsByGroup, appsFor, canUseApp, getApp } from '@/lib/apps/registry'

const user = (roles: string[], apps: string[] = []) => ({ id: '1', roles, apps })

describe('Kern Org Manager on the hub', () => {
  test('is registered, and its href matches the route that exists', () => {
    const app = getApp('kern')
    expect(app).toBeDefined()
    expect(app!.href).toBe('/kern')
    expect(app!.status).toBe('beta')
    expect(app!.group).toBe('Operations')
    expect(APPS.map((a) => a.id)).toContain('kern')
  })

  test('admin and dev see it', () => {
    expect(appsFor(user(['admin'])).map((a) => a.id)).toContain('kern')
    expect(appsFor(user(['dev'])).map((a) => a.id)).toContain('kern')
    expect(canUseApp(user(['admin']), getApp('kern')!)).toBe(true)
  })

  test('a plain user sees it only once it is on their apps list', () => {
    expect(appsFor(user(['user'])).map((a) => a.id)).not.toContain('kern')
    expect(appsFor(user(['user'], ['offers'])).map((a) => a.id)).not.toContain('kern')
    expect(appsFor(user(['user'], ['kern'])).map((a) => a.id)).toContain('kern')
    expect(canUseApp(user(['user'], ['kern']), getApp('kern')!)).toBe(true)
  })

  test('offers works the same way — membership, not roles', () => {
    expect(getApp('offers')!.roles).toBeUndefined()
    expect(appsFor(user(['user'])).map((a) => a.id)).not.toContain('offers')
    expect(appsFor(user(['user'], ['offers'])).map((a) => a.id)).toContain('offers')
  })

  test('a signed-out visitor sees nothing at all', () => {
    expect(appsFor(null)).toEqual([])
    expect(canUseApp(null, getApp('kern')!)).toBe(false)
  })

  test('it renders under its own Operations heading, apart from offers', () => {
    const groups = appsByGroup(appsFor(user(['admin'])))
    expect(groups.find((g) => g.group === 'Operations')!.apps.map((a) => a.id)).toEqual(['kern'])
    expect(groups.find((g) => g.group === 'People')!.apps.map((a) => a.id)).toEqual([
      'hiring',
      'offers',
    ])
  })
})
