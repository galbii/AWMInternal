// Per-app membership (2026-09): who may open a membership-managed app, and
// the one helper every write path uses to edit a user's `apps` list.

import { describe, expect, test } from 'bun:test'

import { withApps } from '@/lib/apps/membership'
import {
  appsFor,
  canUseApp,
  getApp,
  isAppManager,
  isMembershipApp,
  membershipApps,
  userApps,
} from '@/lib/apps/registry'

const user = (roles: string[], apps: string[] = []) => ({ id: '1', roles, apps })

describe('membership apps', () => {
  test('are the registry entries that list no roles — Users is role-gated', () => {
    const ids = membershipApps().map((a) => a.id)
    // Both doors onto the offers app are membership-managed — that membership
    // is what decides who may issue a final letter (src/lib/offers/official.ts).
    expect(ids).toEqual(['hiring', 'offers', 'kern'])
    expect(isMembershipApp('hiring')).toBe(true)
    expect(isMembershipApp('offers')).toBe(true)
    expect(isMembershipApp('users')).toBe(false)
    expect(isMembershipApp('nope')).toBe(false)
  })

  test('a plain user opens only the apps on their list', () => {
    expect(appsFor(user(['user'])).map((a) => a.id)).toEqual([])
    expect(appsFor(user(['user'], ['offers'])).map((a) => a.id)).toEqual(['offers'])
    expect(appsFor(user(['user'], ['kern'])).map((a) => a.id)).toEqual(['kern'])
    expect(appsFor(user(['user'], ['kern', 'offers'])).map((a) => a.id)).toEqual(['offers', 'kern'])
  })

  test('membership can never grant a role-gated app', () => {
    expect(canUseApp(user(['user'], ['users', 'offers']), getApp('users')!)).toBe(false)
    expect(appsFor(user(['user'], ['users'])).map((a) => a.id)).toEqual([])
  })

  test('admins and developers open every app whatever their list says', () => {
    expect(isAppManager(user(['admin']))).toBe(true)
    expect(isAppManager(user(['dev']))).toBe(true)
    expect(isAppManager(user(['user']))).toBe(false)
    expect(appsFor(user(['admin'])).map((a) => a.id)).toEqual(['hiring', 'offers', 'kern', 'users'])
    expect(appsFor(user(['dev'], [])).map((a) => a.id)).toEqual(['hiring', 'offers', 'kern', 'users'])
  })

  test('a missing or malformed list reads as no apps', () => {
    expect(userApps({ roles: ['user'] })).toEqual([])
    expect(userApps({ apps: 'offers' })).toEqual([])
    expect(userApps({ apps: ['offers', 3, null] })).toEqual(['offers'])
    expect(appsFor({ id: '1', roles: ['user'] }).map((a) => a.id)).toEqual([])
    expect(canUseApp(null, getApp('offers')!)).toBe(false)
  })
})

describe('withApps', () => {
  const valid = ['offers', 'kern']

  test('adds, in registry order, without duplicates', () => {
    expect(withApps([], ['kern', 'offers'], [], valid)).toEqual(['offers', 'kern'])
    expect(withApps(['offers'], ['offers'], [], valid)).toEqual(['offers'])
  })

  test('removes, and remove wins over add', () => {
    expect(withApps(['offers', 'kern'], [], ['kern'], valid)).toEqual(['offers'])
    expect(withApps(['offers'], ['kern'], ['kern'], valid)).toEqual(['offers'])
  })

  test('drops ids that are not membership apps', () => {
    expect(withApps(['offers', 'users', 'legacy'], ['nope'], [], valid)).toEqual(['offers'])
  })

  test('defaults `valid` to the registry', () => {
    expect(withApps([], ['kern', 'users', 'offers'])).toEqual(['offers', 'kern'])
  })
})
