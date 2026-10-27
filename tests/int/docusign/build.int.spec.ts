// The DocuSign envelope body and the placement gate /api/offer-signature
// applies to what the browser reports.

import { describe, expect, test } from 'bun:test'

import { MAX_SUBJECT, buildEnvelope, readPlacement } from '@/lib/docusign/build'

const input = {
  pdfBase64: 'JVBERi0=',
  filename: 'Offer_Letter_Test.pdf',
  signerName: 'Dana Smith',
  signerEmail: 'dana@example.com',
  subject: 'Your Offer of Employment — All Western Mortgage',
  message: 'Hi Dana',
  place: { page: 2, x: 40.4, y: 600.6, dateX: 300.2 },
}

describe('buildEnvelope', () => {
  const env = buildEnvelope(input) as {
    status: string
    emailSubject: string
    documents: { documentBase64: string; fileExtension: string }[]
    recipients: {
      signers: {
        email: string
        name: string
        tabs: {
          signHereTabs: Record<string, string>[]
          dateSignedTabs: Record<string, string>[]
        }
      }[]
    }
  }

  test('is sent immediately, with the PDF as the one document', () => {
    expect(env.status).toBe('sent')
    expect(env.documents).toHaveLength(1)
    expect(env.documents[0].documentBase64).toBe('JVBERi0=')
    expect(env.documents[0].fileExtension).toBe('pdf')
  })

  test('has exactly one signer: the candidate', () => {
    expect(env.recipients.signers).toHaveLength(1)
    expect(env.recipients.signers[0].email).toBe('dana@example.com')
    expect(env.recipients.signers[0].name).toBe('Dana Smith')
  })

  test('places both tabs on the reported page, above the rule, as integer strings', () => {
    const { signHereTabs, dateSignedTabs } = env.recipients.signers[0].tabs
    expect(signHereTabs[0]).toEqual({ documentId: '1', pageNumber: '2', xPosition: '40', yPosition: '571' })
    expect(dateSignedTabs[0]).toEqual({ documentId: '1', pageNumber: '2', xPosition: '300', yPosition: '587' })
  })

  test('never places a tab off the top of the page', () => {
    const top = buildEnvelope({ ...input, place: { page: 1, x: 0, y: 5, dateX: 0 } }) as typeof env
    expect(top.recipients.signers[0].tabs.signHereTabs[0].yPosition).toBe('0')
  })

  test('caps the subject at DocuSign’s limit', () => {
    const long = buildEnvelope({ ...input, subject: 'x'.repeat(150) }) as typeof env
    expect(long.emailSubject).toHaveLength(MAX_SUBJECT)
  })
})

describe('readPlacement', () => {
  test('accepts a placement on a letter page', () => {
    expect(readPlacement({ page: 1, x: 40, y: 700, dateX: 300 })).toEqual({
      page: 1,
      x: 40,
      y: 700,
      dateX: 300,
    })
  })

  test.each([
    null,
    'x',
    {},
    { page: 0, x: 40, y: 700, dateX: 300 },
    { page: 1.5, x: 40, y: 700, dateX: 300 },
    { page: 1, x: -1, y: 700, dateX: 300 },
    { page: 1, x: 40, y: 900, dateX: 300 },
    { page: 1, x: 40, y: 700, dateX: 700 },
    { page: 1, x: '40', y: 700, dateX: 300 },
    { page: 1, x: Number.NaN, y: 700, dateX: 300 },
  ])('refuses %p', (v) => {
    expect(readPlacement(v)).toBeNull()
  })
})
