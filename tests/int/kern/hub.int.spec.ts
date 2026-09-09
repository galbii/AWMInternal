// The hub wiring for the Kern app.
//
// The registry `roles` field is a UX filter, not a security boundary — it
// decides what a user SEES on the hub. requireApp('kern') gates the routes.
// These tests pin the visibility rules so a registry edit can't silently
// expose or hide the app.

import { describe, expect, test } from 'bun:test'

import { APPS, appsByGroup, appsFor, canUseApp, getApp } from '@/lib/apps/registry'

const user = (roles: string[]) => ({ id: '1', roles })

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

  test('a plain user does not — but still sees offers, which lists no roles', () => {
    const ids = appsFor(user(['user'])).map((a) => a.id)
    expect(ids).not.toContain('kern')
    expect(ids).toContain('offers')
  })

  test('a signed-out visitor sees nothing at all', () => {
    expect(appsFor(null)).toEqual([])
    expect(canUseApp(null, getApp('kern')!)).toBe(false)
  })

  test('it renders under its own Operations heading, apart from offers', () => {
    const groups = appsByGroup(appsFor(user(['admin'])))
    expect(groups.find((g) => g.group === 'Operations')!.apps.map((a) => a.id)).toEqual(['kern'])
    expect(groups.find((g) => g.group === 'People')!.apps.map((a) => a.id)).toEqual(['offers'])
  })
})
