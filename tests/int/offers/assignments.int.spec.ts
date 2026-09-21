import { describe, expect, test } from 'bun:test'

import { applyAssignmentEdit, isAssignRole, sameAssignees } from '@/lib/offers/assignments'
import { initialsOf } from '@/lib/users/initials'

interface Row {
  user: string
  role: string
}
const row = (user: string, role = ''): Row => ({ user, role })
const make = (user: string): Row => row(user)

describe('applyAssignmentEdit', () => {
  test('adds a new user at the end without touching existing rows', () => {
    const out = applyAssignmentEdit([row('a', 'hr'), row('b')], { add: ['c'] }, make)
    expect(out).toEqual([row('a', 'hr'), row('b'), row('c')])
  })
  test('adding an existing user is a no-op that keeps their role', () => {
    const out = applyAssignmentEdit([row('a', 'recruiter')], { add: ['a'] }, make)
    expect(out).toEqual([row('a', 'recruiter')])
  })
  test('removes by id and keeps order of the rest', () => {
    const out = applyAssignmentEdit([row('a'), row('b'), row('c')], { remove: ['b'] }, make)
    expect(out).toEqual([row('a'), row('c')])
  })
  test('remove wins over add of the same id; adds are de-duplicated', () => {
    const out = applyAssignmentEdit([row('a')], { add: ['b', 'b', 'a'], remove: ['a'] }, make)
    expect(out).toEqual([row('b')])
  })
  test('ignores empty ids and returns a new array', () => {
    const cur = [row('a')]
    const out = applyAssignmentEdit(cur, { add: [''], remove: [''] }, make)
    expect(out).toEqual(cur)
    expect(out).not.toBe(cur)
  })
})

describe('sameAssignees', () => {
  test('compares users in order', () => {
    expect(sameAssignees([row('a'), row('b')], [row('a'), row('b')])).toBe(true)
    expect(sameAssignees([row('a'), row('b')], [row('b'), row('a')])).toBe(false)
    expect(sameAssignees([row('a')], [])).toBe(false)
  })
})

describe('isAssignRole', () => {
  test('accepts the preset roles only', () => {
    expect(isAssignRole('hr')).toBe(true)
    expect(isAssignRole('ceo')).toBe(false)
    expect(isAssignRole(null)).toBe(false)
  })
})

describe('initialsOf', () => {
  test('two names → two letters, email → one, empty → ?', () => {
    expect(initialsOf('Chance Dev')).toBe('CD')
    expect(initialsOf('  Maya  Anne Okafor ')).toBe('MO')
    expect(initialsOf('chance@example.com')).toBe('C')
    expect(initialsOf('')).toBe('?')
  })
})
