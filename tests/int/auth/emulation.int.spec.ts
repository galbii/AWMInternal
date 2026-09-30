// The rules that decide whether an emulated session may write, whose
// permissions it writes with, and who the audit names.
//
// These are the security-critical pure parts of src/lib/auth/viewer.ts. A slip
// here either blocks legitimate work or — far worse — forges an audit record.

import { describe, expect, test } from 'bun:test'

import {
  blockEmulatedWrite,
  canWrite,
  decodeEmulation,
  encodeEmulation,
  mayActAs,
  writeContext,
  writeUser,
  type EmulationState,
} from '@/lib/auth/emulation'
import type { User } from '@/payload-types'

const user = (id: string, roles: string[] = ['user']): User =>
  ({ id, roles, email: id + '@example.com' }) as unknown as User

const admin = user('u-admin', ['admin'])
const dana = user('u-dana', ['user'])

const session = (over: Partial<EmulationState> = {}): EmulationState =>
  ({
    actor: admin,
    viewer: admin,
    isEmulating: false,
    isActing: false,
    ...over,
  })

const viewing = session({ viewer: dana, isEmulating: true, isActing: false })
const acting = session({ viewer: dana, isEmulating: true, isActing: true })

/* ------------------------------ the cookie ------------------------------ */

describe('cookie encoding — one value, so mode cannot desync from target', () => {
  test('round-trips both modes', () => {
    expect(decodeEmulation(encodeEmulation('u1', 'view'))).toEqual({ userId: 'u1', mode: 'view' })
    expect(decodeEmulation(encodeEmulation('u1', 'act'))).toEqual({ userId: 'u1', mode: 'act' })
  })

  test('a bare id is VIEW — every cookie minted before act mode existed', () => {
    expect(decodeEmulation('u1')).toEqual({ userId: 'u1', mode: 'view' })
  })

  test('an unknown flag degrades to view, never up to act', () => {
    expect(decodeEmulation('u1|write')).toEqual({ userId: 'u1', mode: 'view' })
    expect(decodeEmulation('u1|')).toEqual({ userId: 'u1', mode: 'view' })
  })

  test('nothing at all is nothing', () => {
    expect(decodeEmulation(undefined)).toBeNull()
    expect(decodeEmulation('')).toBeNull()
    expect(decodeEmulation('|act')).toBeNull()
  })
})

/* --------------------------- strictly downward --------------------------- */

describe('mayActAs — never as a peer', () => {
  test('a plain user may be acted as', () => {
    expect(mayActAs(dana)).toBe(true)
  })

  test('an admin or developer may NOT — that would launder privilege changes', () => {
    expect(mayActAs(user('x', ['admin']))).toBe(false)
    expect(mayActAs(user('x', ['dev']))).toBe(false)
    expect(mayActAs(user('x', ['user', 'admin']))).toBe(false)
  })
})

/* ------------------------------- the tiers ------------------------------- */

describe('blockEmulatedWrite', () => {
  test('an ordinary session is never blocked', () => {
    expect(blockEmulatedWrite(session(), 'acting-ok')).toBeNull()
    expect(blockEmulatedWrite(session(), 'never')).toBeNull()
  })

  test('VIEWING blocks everything', () => {
    expect(blockEmulatedWrite(viewing, 'acting-ok')).not.toBeNull()
    expect(blockEmulatedWrite(viewing, 'never')).not.toBeNull()
  })

  test('ACTING unblocks in-app work but never the privileged tier', () => {
    expect(blockEmulatedWrite(acting, 'acting-ok')).toBeNull()
    // Roles, app membership, profiles, passkeys, outbound email.
    expect(blockEmulatedWrite(acting, 'never')).not.toBeNull()
  })

  test('the refusal is a 403 either way', () => {
    expect(blockEmulatedWrite(viewing, 'acting-ok')?.status).toBe(403)
    expect(blockEmulatedWrite(acting, 'never')?.status).toBe(403)
  })

  test('canWrite is false only while viewing', () => {
    expect(canWrite(session())).toBe(true)
    expect(canWrite(viewing)).toBe(false)
    expect(canWrite(acting)).toBe(true)
  })
})

/* --------------------------- write identity ------------------------------ */

describe('writeUser / writeContext — permissions vs attribution', () => {
  test('an ordinary session writes as itself, with no acting context', () => {
    expect(writeUser(session()).id).toBe('u-admin')
    expect(writeContext(session())).toEqual({})
  })

  test('ACTING writes as the EMULATED user, so their real limits apply', () => {
    // Writing as the admin would silently succeed at things the target cannot
    // do — worse than refusing, because it looks like it worked.
    expect(writeUser(acting).id).toBe('u-dana')
  })

  test('…and carries the REAL human for the audit hooks', () => {
    expect(writeContext(acting)).toEqual({ actingFor: 'u-admin' })
  })

  test('VIEWING never reaches a write, but still reports the actor', () => {
    expect(writeUser(viewing).id).toBe('u-admin')
    expect(writeContext(viewing)).toEqual({})
  })
})
