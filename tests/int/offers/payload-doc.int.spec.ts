// The doc<->record mappers must be a lossless identity over the frozen record
// shape — LetterView's letterSig and the storage seam's snapshot diff both
// compare JSON strings, so a round trip must be byte-stable.

import { describe, expect, it } from 'bun:test'

import { toOfferDoc, toOfferRecord } from '@/lib/offers/payload-doc'
import type { OfferRecord } from '@/lib/offers/types'
import type { OfferRequest } from '@/payload-types'

function roundtrip(rec: OfferRecord): OfferRecord {
  // Simulate the DB round trip: the write data plus the id, then back.
  const doc = { id: rec.id, ...toOfferDoc(rec, 3) } as OfferRequest
  return toOfferRecord(doc)
}

describe('payload-doc mappers', () => {
  it('round-trips a minimal form-created record (no stage, no letter)', () => {
    const rec: OfferRecord = {
      id: 'r1abc23xyz9',
      data: { employeeName: 'Jane Doe', baseMonthly: '4,333' },
      status: 'draft',
      created: '2026-09-06T10:00:00.000Z',
      updated: '2026-09-06T10:05:00.000Z',
    }
    expect(JSON.stringify(roundtrip(rec))).toBe(JSON.stringify(rec))
  })

  it('round-trips a full record losslessly and is byte-stable once mapped', () => {
    const rec: OfferRecord = {
      id: 'rmno45pqr78',
      data: { employeeName: 'John Smith', email: '', extraUnknownKey: 'kept' },
      status: 'complete',
      stage: 'hired',
      created: '2026-01-02T03:04:05.678Z',
      updated: '2026-02-03T04:05:06.789Z',
      letter: { date: '2026-02-01', signatory: 'kern', watermark: { on: true, text: 'DRAFT' } },
      letterHtml: '<table class="letter"><tr><td>Dear John &amp; co — $4,333</td></tr></table>',
      letterStale: true,
    }
    const out = roundtrip(rec)
    // Lossless: every field survives (key ORDER may differ from hand-built input;
    // the client itself appends keys like `stage` in patch order).
    expect(out).toEqual(rec)
    expect(out.letterHtml).toBe(rec.letterHtml)
    // Byte-stable: a second round trip of mapper output is the identity — this is
    // what the storage snapshot diff and letterSig comparisons rely on.
    expect(JSON.stringify(roundtrip(out))).toBe(JSON.stringify(out))
  })

  it('normalizes null-ish letter state: null letterHtml and false letterStale drop out', () => {
    const rec: OfferRecord = {
      id: 'rzz99aa11bb',
      data: {},
      status: 'draft',
      created: '2026-09-06T10:00:00.000Z',
      updated: '2026-09-06T10:00:00.000Z',
      letterHtml: null,
      letterStale: false,
    }
    const out = roundtrip(rec)
    expect('letterHtml' in out).toBe(false)
    expect('letterStale' in out).toBe(false)
    expect(out.stage).toBeUndefined()
    // Truthiness-equivalent to the input everywhere the app reads these.
    expect(out.letterHtml || '').toBe(rec.letterHtml || '')
    expect(!out.letterStale).toBe(!rec.letterStale)
  })

  it('unknown data keys survive the round trip (old-backup compatibility)', () => {
    const rec: OfferRecord = {
      id: 'rkeep1234ab',
      data: { legacyFieldThatNoLongerExists: 'still here', employeeName: 'A' },
      status: 'draft',
      created: 'not-even-iso', // intake can carry a non-ISO submitted stamp
      updated: '2026-09-06T10:00:00.000Z',
    }
    const out = roundtrip(rec)
    expect(out.data.legacyFieldThatNoLongerExists).toBe('still here')
    expect(out.created).toBe('not-even-iso')
  })

  it('toOfferDoc carries pos only when given (standalone page must not write it)', () => {
    const rec: OfferRecord = {
      id: 'rpos1234abc',
      data: {},
      status: 'draft',
      created: '2026-09-06T10:00:00.000Z',
      updated: '2026-09-06T10:00:00.000Z',
    }
    expect('pos' in toOfferDoc(rec)).toBe(false)
    expect(toOfferDoc(rec, 7).pos).toBe(7)
  })
})
