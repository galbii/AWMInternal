import { describe, expect, test } from 'bun:test'
import { defaultLetter, resolveLetter, generateLetterHTML, compTableHTML } from '@/lib/offers/letter'
import { offerEmailBody } from '@/lib/offers/letter-exports'
import type { OfferRecord } from '@/lib/offers/types'

const rec = (data: Record<string, string>, extra: Partial<OfferRecord> = {}): OfferRecord => ({
  id: 'r1', data, status: 'draft', created: '2026-09-01T00:00:00.000Z', updated: '2026-09-01T00:00:00.000Z', ...extra,
})

test('Branch Manager without start date: commissioned wins → licensed opening', () => {
  const L = defaultLetter(rec({ position: 'Branch Manager', employmentType: 'Commissioned Sales' }))
  expect(L.opening).toBe('licensed')
  expect(L.pathAhead).toBe('accept')
  expect(L.closing).toBe('team')
  expect(L.signatory).toBe('kauffman')
})

test('Branch Manager WITH start date: manager opening', () => {
  const L = defaultLetter(rec({ position: 'Branch Manager', employmentType: 'Commissioned Sales', startDate: '2026-10-01' }))
  expect(L.opening).toBe('manager')
  expect(L.pathAhead).toBe('thrilled')
  expect(L.closing).toBe('welcome')
  expect(L.expectFamily).toBe('manager')
})

test('defaultLetter dated opening for ops hire with start date', () => {
  const L = defaultLetter(rec({ position: 'Processor', employmentType: 'Full Time - Operations', startDate: '2026-10-01' }))
  expect(L.opening).toBe('dated')
  expect(L.expectFamily).toBe('operations')
})

test('resolveLetter merges stored options but re-derives rows', () => {
  const r = rec({ position: 'Processor', employmentType: 'Full Time - Operations', baseAnnual: '$52,000' },
    { letter: { signatory: 'kern', rows: { base: { on: false, wyr: 'stale' } } as never } })
  const L = resolveLetter(r)
  expect(L.signatory).toBe('kern')
  expect(L.rows.base.on).toBe(true)
  expect(L.rows.base.wyr).toBe('$52,000 annually')
})

test('generateLetterHTML contains name, inline logo, comp table, signatory', () => {
  const r = rec({ employeeName: 'Mickey Mouse', position: 'Processor', employmentType: 'Full Time - Operations', baseAnnual: '$52,000', fullAddress: '1313 Disneyland Dr, Anaheim, CA 92802' })
  const html = generateLetterHTML(r, resolveLetter(r))
  // The letterhead must be inlined (S3 34) so offline exports still show it.
  expect(html).toContain('<img class="logo" src="data:image/png;base64,')
  expect(html).toContain('Mickey Mouse')
  expect(html).toContain('Base Salary')
  expect(html).toContain('Benefits Package')
  expect(html).toContain('Jeff Kauffman')
})

test('part-time drops benefits row', () => {
  const r = rec({ employmentType: 'Part Time - Operations', baseHourly: '$20' })
  expect(compTableHTML(r, resolveLetter(r))).not.toContain('Benefits Package')
})

test('email helpers', () => {
  expect(offerEmailBody(rec({ preferredName: 'Mickey' }))).toContain('Hi Mickey,')
})
