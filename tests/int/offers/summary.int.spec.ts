// The sticky header on /offers/[id] reads its facts off the same record and
// resolved LetterConfig as the letter, so these pin what it shows.

import { describe, expect, it } from 'bun:test'

import { resolveLetter } from '@/lib/offers/letter'
import {
  completion,
  guaranteeShort,
  offerFacts,
  shortLocation,
  signOnTotal,
} from '@/lib/offers/summary'
import type { OfferRecord } from '@/lib/offers/types'

const rec = (data: Record<string, string>, extra: Partial<OfferRecord> = {}): OfferRecord => ({
  id: 'rsummary001',
  data,
  status: 'draft',
  created: '2026-09-01T00:00:00.000Z',
  updated: '2026-09-01T00:00:00.000Z',
  ...extra,
})

const byId = (facts: ReturnType<typeof offerFacts>, id: string) => facts.find((f) => f.id === id)

describe('offerFacts', () => {
  it('shows the letter terms for a salaried operations hire', () => {
    const r = rec(
      {
        employeeName: 'Jane Doe',
        startDate: '2026-10-05',
        baseAnnual: '$60,000',
        employmentType: 'Full Time - Operations',
        workLocation: 'Branch Office (required to report to the office each workday)',
      },
      { letter: { date: '2026-09-20', signatory: 'kern' } },
    )
    const facts = offerFacts(r, resolveLetter(r))
    expect(byId(facts, 'start')?.value).toBe('October 5, 2026')
    expect(byId(facts, 'base')?.value).toBe('$60,000 annually')
    expect(byId(facts, 'employment')?.value).toBe('Full Time - Operations')
    expect(byId(facts, 'location')?.value).toBe('Branch office')
    expect(byId(facts, 'signatory')?.value).toBe('Ty Kern')
    expect(byId(facts, 'date')?.value).toBe('September 20, 2026')
    // Nothing optional leaks in as an empty chip.
    expect(byId(facts, 'signon')).toBeUndefined()
    expect(byId(facts, 'guarantee')).toBeUndefined()
  })

  it('marks missing required terms and reads commission-only as informational', () => {
    const r = rec({ employeeName: 'Lee Officer', position: 'Loan Officer' })
    const facts = offerFacts(r, resolveLetter(r))
    expect(byId(facts, 'start')).toMatchObject({ value: 'Not set', tone: 'missing' })
    expect(byId(facts, 'base')).toMatchObject({ value: 'Commission only', tone: 'dim' })
    expect(byId(facts, 'employment')).toMatchObject({ value: 'Not set', tone: 'missing' })
    expect(byId(facts, 'location')).toBeUndefined()
  })

  it('adds sign-on and guarantee chips only when they are in the offer', () => {
    const r = rec({
      employeeName: 'Sam Seller',
      employmentType: 'Commissioned Sales',
      bonusSignOnAmount: '$5,000',
      bonusSignOnMonth2: '2,500',
      bonusSignOnMonth3: '',
      bonusGuaranteeAmount: '4000',
      bonusGuaranteeMonths: '3',
    })
    const facts = offerFacts(r, resolveLetter(r))
    expect(byId(facts, 'signon')?.value).toBe('$7,500')
    expect(byId(facts, 'guarantee')?.value).toBe('$4,000/mo · 3 mo')
  })
})

describe('helpers', () => {
  it('shortLocation collapses the long radio labels', () => {
    expect(
      shortLocation('Branch Office (required to report to the office each workday)'),
    ).toBe('Branch office')
    expect(shortLocation('Flexible/Hybrid')).toBe('Hybrid')
    expect(shortLocation('Remote')).toBe('Remote')
    expect(shortLocation('')).toBe('')
  })

  it('signOnTotal ignores blanks and zeros', () => {
    expect(signOnTotal({ bonusSignOnAmount: '0', bonusSignOnMonth2: '' })).toBe('')
    expect(signOnTotal({ bonusSignOnAmount: '1000', bonusSignOnMonth3: '$250' })).toBe('$1,250')
  })

  it('guaranteeShort needs both an amount and a month count', () => {
    expect(guaranteeShort({ bonusGuaranteeAmount: '4000' })).toBe('')
    expect(guaranteeShort({ bonusGuaranteeAmount: '4000', bonusGuaranteeMonths: '2' })).toBe(
      '$4,000/mo · 2 mo',
    )
  })

  it('completion counts the open required answers', () => {
    const draft = completion(rec({ employeeName: 'A' }))
    expect(draft.complete).toBe(false)
    expect(draft.missing).toBeGreaterThan(0)
    expect(draft.label).toMatch(/^Draft · \d+ required missing$/)
  })
})

describe('relativeTime', () => {
  const now = Date.parse('2026-09-20T12:00:00.000Z')
  const at = (ms: number): string => new Date(now - ms).toISOString()
  const { relativeTime } = require('@/lib/offers/summary') as typeof import('@/lib/offers/summary')

  it('buckets by seconds, minutes, hours and days', () => {
    expect(relativeTime(at(10_000), now)).toBe('just now')
    expect(relativeTime(at(5 * 60_000), now)).toBe('5m ago')
    expect(relativeTime(at(3 * 3_600_000), now)).toBe('3h ago')
    expect(relativeTime(at(2 * 86_400_000), now)).toBe('2d ago')
  })

  it('falls back to a short date past a week, with the year only when it differs', () => {
    expect(relativeTime('2026-08-01T12:00:00.000Z', now)).toMatch(/^Aug 1$/)
    expect(relativeTime('2025-08-01T12:00:00.000Z', now)).toMatch(/^Aug 1, 2025$/)
  })

  it('passes garbage through rather than throwing', () => {
    expect(relativeTime('not a date', now)).toBe('not a date')
    expect(relativeTime('', now)).toBe('')
  })
})
