// The applicant identity rules shared by the offer-requests linkApplicant hook
// and scripts/backfill-applicants.ts.

import { describe, expect, it } from 'bun:test'

import { applicantKey, applicantSnapshot, snapshotChanged } from '@/lib/offers/applicant'

describe('applicantKey', () => {
  it('keys on the email when there is one, case- and whitespace-insensitively', () => {
    expect(applicantKey({ email: '  Jane.Doe@Example.com ', employeeName: 'Jane Doe' })).toBe(
      'email:jane.doe@example.com',
    )
  })

  it('falls back to the collapsed, lowercased name without an email', () => {
    expect(applicantKey({ employeeName: '  Jane   Q.  Doe ' })).toBe('name:jane q. doe')
    expect(applicantKey({ email: '   ', employeeName: 'Jane Doe' })).toBe('name:jane doe')
  })

  it('is empty when there is nothing to key on (an empty draft)', () => {
    expect(applicantKey({})).toBe('')
    expect(applicantKey({ email: ' ', employeeName: ' ' })).toBe('')
    expect(applicantKey({ position: 'Loan Officer' })).toBe('')
  })
})

describe('applicantSnapshot', () => {
  it('mirrors group A trimmed, never anything else from the form', () => {
    const snap = applicantSnapshot({
      employeeName: ' Jane Doe ',
      preferredName: 'Janie',
      email: 'jane@example.com ',
      phone: ' 702-555-0100',
      fullAddress: '1 Main St\nLas Vegas, NV 89113',
      nmls: '123456',
      position: 'Loan Officer',
      baseAnnual: '90000',
    })
    expect(snap).toEqual({
      name: 'Jane Doe',
      preferredName: 'Janie',
      email: 'jane@example.com',
      phone: '702-555-0100',
      address: '1 Main St\nLas Vegas, NV 89113',
      nmls: '123456',
    })
  })

  it('is all-empty-strings for a blank form', () => {
    expect(applicantSnapshot({})).toEqual({
      name: '',
      preferredName: '',
      email: '',
      phone: '',
      address: '',
      nmls: '',
    })
  })
})

describe('snapshotChanged', () => {
  const next = applicantSnapshot({ employeeName: 'Jane Doe', email: 'jane@example.com' })

  it('is false when the stored row already matches (null and missing count as empty)', () => {
    expect(
      snapshotChanged({ name: 'Jane Doe', email: 'jane@example.com', phone: null }, next),
    ).toBe(false)
    expect(snapshotChanged({ name: 'Jane Doe', email: 'jane@example.com' }, next)).toBe(false)
  })

  it('is true when any mirrored field differs', () => {
    expect(snapshotChanged({ name: 'Jane Doe', email: 'jane@old.example.com' }, next)).toBe(true)
    expect(snapshotChanged({ name: 'Jane Doe', email: 'jane@example.com', nmls: '9' }, next)).toBe(
      true,
    )
  })
})
