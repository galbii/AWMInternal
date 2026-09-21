// The hub wiring for the Users app. As with kern, the registry `roles` field is
// a UX filter; requireApp('users') gates the routes and /api/directory re-checks
// admin/dev on every write. These tests pin the visibility rules.

import { describe, expect, test } from 'bun:test'

import { APPS, appsByGroup, appsFor, canUseApp, getApp } from '@/lib/apps/registry'

const user = (roles: string[], apps: string[] = []) => ({ id: '1', roles, apps })

describe('Users app on the hub', () => {
  test('is registered at /users under Administration', () => {
    const app = getApp('users')
    expect(app).toBeDefined()
    expect(app!.href).toBe('/users')
    expect(app!.status).toBe('live')
    expect(app!.group).toBe('Administration')
    expect(APPS.map((a) => a.id)).toContain('users')
  })

  test('admin and dev see it; a plain user does not', () => {
    expect(appsFor(user(['admin'])).map((a) => a.id)).toContain('users')
    expect(appsFor(user(['dev'])).map((a) => a.id)).toContain('users')
    expect(appsFor(user(['user'])).map((a) => a.id)).not.toContain('users')
    expect(canUseApp(null, getApp('users')!)).toBe(false)
  })

  test('it is role-gated: putting it on an apps list grants nothing', () => {
    expect(appsFor(user(['user'], ['users'])).map((a) => a.id)).not.toContain('users')
  })

  test('it has its own heading, apart from the other apps', () => {
    const groups = appsByGroup(appsFor(user(['admin'])))
    expect(groups.find((g) => g.group === 'Administration')!.apps.map((a) => a.id)).toEqual([
      'users',
    ])
  })
})
