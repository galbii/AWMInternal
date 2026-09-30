// Who may issue a final letter, and the one chokepoint that enforces it.
//
// The rules under test are the ones the feature rests on:
//   1. the access matrix in src/lib/offers/official.ts;
//   2. `resolveLetter(rec, official)` forcing the stamp — and only ever ADDING
//      it, never clearing one the record asked for;
//   3. the three export paths that used to bypass the record's watermark.

import { describe, expect, test } from 'bun:test'

import { resolveLetter } from '@/lib/offers/letter'
import {
  letterDocHTML,
  packetWatermarkControl,
  packetWatermarkJs,
} from '@/lib/offers/letter-exports'
import {
  HIRING_APP_ID,
  HR_APP_ID,
  letterIsOfficial,
  mayIssueFinal,
  mayIssueFinalForShell,
  stampReason,
} from '@/lib/offers/official'
import type { OfferRecord } from '@/lib/offers/types'

const rec = (data: Record<string, string> = {}, extra: Partial<OfferRecord> = {}): OfferRecord => ({
  id: 'r1',
  data: { employeeName: 'Dana Reyes', position: 'Loan Officer', ...data },
  status: 'draft',
  created: '2026-09-01T00:00:00.000Z',
  updated: '2026-09-01T00:00:00.000Z',
  ...extra,
})

const user = (roles: string[], apps: string[]) => ({ roles, apps })

/* ------------------------------ the matrix ------------------------------ */

describe('mayIssueFinal — the access matrix', () => {
  test('admin and dev issue without appearing on any list', () => {
    expect(mayIssueFinal(user(['admin'], []))).toBe(true)
    expect(mayIssueFinal(user(['dev'], []))).toBe(true)
  })

  test('HR membership is the right to issue', () => {
    expect(mayIssueFinal(user(['user'], [HR_APP_ID]))).toBe(true)
  })

  test('a hiring manager never issues', () => {
    expect(mayIssueFinal(user(['user'], [HIRING_APP_ID]))).toBe(false)
  })

  test('membership in both apps issues — it is a deliberate grant', () => {
    expect(mayIssueFinal(user(['user'], [HIRING_APP_ID, HR_APP_ID]))).toBe(true)
  })

  test('no membership, no session, junk: deny by default', () => {
    expect(mayIssueFinal(user(['user'], []))).toBe(false)
    expect(mayIssueFinal(null)).toBe(false)
    expect(mayIssueFinal(undefined)).toBe(false)
    expect(mayIssueFinal({ roles: 'admin', apps: 'offers' })).toBe(false)
  })

  test('the client half agrees with the server half', () => {
    expect(mayIssueFinalForShell({ isManager: true, apps: [] })).toBe(true)
    expect(mayIssueFinalForShell({ isManager: false, apps: [HR_APP_ID] })).toBe(true)
    expect(mayIssueFinalForShell({ isManager: false, apps: [HIRING_APP_ID] })).toBe(false)
    // Emulation drops isManager, so an admin viewing as a hiring manager is
    // held to the hiring manager's answer.
    expect(mayIssueFinalForShell({ isManager: false, apps: [] })).toBe(false)
  })
})

describe('letterIsOfficial — BOTH halves are required', () => {
  test('pushed + may issue', () => {
    expect(letterIsOfficial(true, true)).toBe(true)
  })

  test('HR looking at a request nobody pushed still sees a draft', () => {
    expect(letterIsOfficial(false, true)).toBe(false)
  })

  test('a hiring manager looking at a pushed request still cannot issue', () => {
    expect(letterIsOfficial(true, false)).toBe(false)
  })

  test('stampReason explains which half failed', () => {
    expect(stampReason(true, true)).toBeNull()
    expect(stampReason(false, true)).toBe('not-pushed')
    expect(stampReason(true, false)).toBe('may-not-issue')
    // The viewer's own limit is the more fundamental one, so it wins.
    expect(stampReason(false, false)).toBe('may-not-issue')
  })
})

/* --------------------------- the chokepoint ----------------------------- */

describe('resolveLetter(rec, official) is the only watermark decision', () => {
  test('an official letter keeps the record’s own setting (off by default)', () => {
    expect(resolveLetter(rec()).watermark.on).toBe(false)
    expect(resolveLetter(rec(), true).watermark.on).toBe(false)
  })

  test('a draft is stamped', () => {
    expect(resolveLetter(rec(), false).watermark.on).toBe(true)
    expect(resolveLetter(rec(), false).watermark.text).toBe('SAMPLE')
  })

  test('it only ever ADDS a stamp — an official letter that asked for one keeps it', () => {
    const asked = rec({}, { letter: { watermark: { on: true, text: 'PROOF' } } })
    expect(resolveLetter(asked, true).watermark).toEqual({ on: true, text: 'PROOF' })
    // …and forcing preserves the record's chosen wording rather than resetting it.
    expect(resolveLetter(asked, false).watermark).toEqual({ on: true, text: 'PROOF' })
  })

  test('the default is `official`, so every pre-existing caller is unchanged', () => {
    expect(resolveLetter(rec())).toEqual(resolveLetter(rec(), true))
  })
})

/* ------------------- the three paths that used to leak ------------------- */

describe('export paths honour the draft stamp', () => {
  test('Word: was letterDocHTML(rec, null) and dropped the watermark entirely', () => {
    expect(letterDocHTML(rec(), { official: true }).doc).not.toContain('SAMPLE')
    expect(letterDocHTML(rec(), { official: false }).doc).toContain('SAMPLE')
  })

  test('Word: the bulk "SAMPLE watermark" tick stamps an official letter too', () => {
    expect(letterDocHTML(rec(), { official: true, stamp: true }).doc).toContain('SAMPLE')
  })

  // offerPacketHTML itself measures layout (planLetterFit), so it is
  // browser-only; the rule that leaked is pulled out as a pure function.
  test('packet: a draft bakes the stamp in and binds no control', () => {
    const js = packetWatermarkJs(true, 'SAMPLE')
    expect(js).toContain('var WM={on:true')
    expect(js).toContain('rwm();')
    expect(js).not.toContain('onchange')
  })

  test('packet: a draft ships NO toggle for the recipient to flip', () => {
    const ctrl = packetWatermarkControl(true, 'SAMPLE')
    expect(ctrl).not.toContain('id="wmOn"')
    expect(ctrl).toContain('not an official offer letter')
  })

  test('packet: an official letter keeps the port’s interactive control', () => {
    expect(packetWatermarkJs(false, 'SAMPLE')).toContain('var WM={on:false')
    expect(packetWatermarkControl(false, 'SAMPLE')).toContain('id="wmOn"')
  })
})

/* ------------------------- who may DELETE an offer ------------------------ */

describe('offer-requests delete access', () => {
  // Imported lazily: the collection module pulls in hooks, and only the access
  // function is under test here.
  const { deleteOfferRequest } =
    require('@/collections/OfferRequests') as typeof import('@/collections/OfferRequests')
  const call = (u: unknown) =>
    (deleteOfferRequest as (a: { req: { user: unknown } }) => unknown)({ req: { user: u } })

  test('admin and dev delete anything', () => {
    expect(call({ id: 'u1', roles: ['admin'] })).toBe(true)
    expect(call({ id: 'u2', roles: ['dev'] })).toBe(true)
  })

  test('signed out deletes nothing', () => {
    expect(call(null)).toBe(false)
  })

  test('a plain user is narrowed to their OWN row, and only while it is a draft', () => {
    // This is what makes Cancel work for the hiring/HR population without
    // handing them everyone else's offers.
    expect(call({ id: 'u3', roles: ['user'] })).toEqual({
      and: [{ createdBy: { equals: 'u3' } }, { status: { equals: 'draft' } }],
    })
  })
})
