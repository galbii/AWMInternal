// The DocuSign envelope body, the sender view request, and the gates
// /api/offer-signature applies to what the browser reports.

import { describe, expect, test } from 'bun:test'

import {
  MAX_SUBJECT,
  buildEnvelope,
  buildSenderView,
  extensionOf,
  isAcceptedExtra,
  readPlacement,
  routingSummary,
  type EnvelopeInput,
} from '@/lib/docusign/build'

type Tab = Record<string, string>
interface Built {
  status: string
  emailSubject: string
  documents: { documentId: string; name: string; fileExtension: string; documentBase64: string }[]
  recipients: {
    signers: {
      recipientId: string
      routingOrder: string
      email: string
      name: string
      tabs: { signHereTabs: Tab[]; dateSignedTabs?: Tab[] }
    }[]
    carbonCopies?: { recipientId: string; routingOrder: string; email: string; name: string }[]
  }
}

const input: EnvelopeInput = {
  letter: { filename: 'Offer_Letter_Dana.pdf', base64: 'JVBERi0=' },
  extras: [],
  internal: { name: 'Peter Lin', email: 'plin@allwestern.com', place: { page: 1, x: 40.4, y: 520.2 } },
  candidate: {
    name: 'Dana Smith',
    email: 'dana@example.com',
    place: { page: 2, x: 40.4, y: 600.6, dateX: 300.2 },
  },
  copyTo: null,
  subject: 'Your Offer of Employment — All Western Mortgage',
  message: 'Hi Dana',
  draft: false,
}

const build = (over: Partial<EnvelopeInput> = {}): Built => buildEnvelope({ ...input, ...over }) as unknown as Built

describe('buildEnvelope', () => {
  test('is sent immediately, with the letter as document 1', () => {
    const env = build()
    expect(env.status).toBe('sent')
    expect(env.documents).toHaveLength(1)
    expect(env.documents[0]).toEqual({
      documentId: '1',
      name: 'Offer_Letter_Dana.pdf',
      fileExtension: 'pdf',
      documentBase64: 'JVBERi0=',
    })
  })

  test('routes the internal signer first, then the candidate', () => {
    const [first, second] = build().recipients.signers
    expect([first.email, first.routingOrder, first.recipientId]).toEqual(['plin@allwestern.com', '1', '1'])
    expect([second.email, second.routingOrder, second.recipientId]).toEqual(['dana@example.com', '2', '2'])
  })

  test('the internal signer signs on their own line, with no date tab', () => {
    const tabs = build().recipients.signers[0].tabs
    expect(tabs.signHereTabs).toEqual([{ documentId: '1', pageNumber: '1', xPosition: '40', yPosition: '490' }])
    expect(tabs.dateSignedTabs).toBeUndefined()
  })

  test('the candidate signs and dates the acceptance line, above the rule', () => {
    const tabs = build().recipients.signers[1].tabs
    expect(tabs.signHereTabs).toEqual([{ documentId: '1', pageNumber: '2', xPosition: '40', yPosition: '571' }])
    expect(tabs.dateSignedTabs).toEqual([{ documentId: '1', pageNumber: '2', xPosition: '300', yPosition: '587' }])
  })

  test('no copy recipient unless asked for', () => {
    expect(build().recipients.carbonCopies).toBeUndefined()
  })

  test('the reporting manager gets a copy only after both have signed', () => {
    const cc = build({ copyTo: { name: '', email: 'boss@allwestern.com' } }).recipients.carbonCopies
    expect(cc).toEqual([{ recipientId: '3', routingOrder: '3', name: 'boss@allwestern.com', email: 'boss@allwestern.com' }])
  })

  test('extra agreements follow the letter, keeping their own type', () => {
    const env = build({
      extras: [
        { filename: 'Agreement.DOCX', base64: 'UEsD' },
        { filename: 'NDA.pdf', base64: 'JVBE' },
      ],
      draft: true,
    })
    expect(env.status).toBe('created')
    expect(env.documents.map((d) => [d.documentId, d.fileExtension])).toEqual([
      ['1', 'pdf'],
      ['2', 'docx'],
      ['3', 'pdf'],
    ])
    // The app only ever places fields on the letter.
    for (const s of env.recipients.signers) {
      expect(s.tabs.signHereTabs.every((t) => t.documentId === '1')).toBe(true)
    }
  })

  test('never places a tab off the top of the page', () => {
    const env = build({ internal: { ...input.internal, place: { page: 1, x: 0, y: 5 } } })
    expect(env.recipients.signers[0].tabs.signHereTabs[0].yPosition).toBe('0')
  })

  test('caps the subject at DocuSign’s limit', () => {
    expect(build({ subject: 'x'.repeat(150) }).emailSubject).toHaveLength(MAX_SUBJECT)
  })
})

describe('buildSenderView', () => {
  test('opens on the prepare screen (the only startingScreen DocuSign accepts) and sends from there', () => {
    const v = buildSenderView('https://app.example.com/api/offer-signature/return?offer=r1') as {
      returnUrl: string
      viewAccess: string
      settings: Record<string, string>
    }
    expect(v.returnUrl).toBe('https://app.example.com/api/offer-signature/return?offer=r1')
    expect(v.viewAccess).toBe('envelope')
    expect(v.settings.startingScreen).toBe('prepare')
    expect(v.settings.sendButtonAction).toBe('send')
  })
})

describe('extra document types', () => {
  test('reads the extension case-insensitively', () => {
    expect(extensionOf('A.Offer.PDF')).toBe('pdf')
    expect(extensionOf('noext')).toBe('')
  })

  test.each([
    ['NDA.pdf', true],
    ['Agreement.docx', true],
    ['Old.doc', true],
    ['photo.png', false],
    ['script.js', false],
    ['noext', false],
  ])('%s -> %p', (name, ok) => {
    expect(isAcceptedExtra(name)).toBe(ok)
  })
})

describe('routingSummary', () => {
  test('names the signers in order, then the copy and any extra documents', () => {
    expect(
      routingSummary(
        [
          { name: 'Peter Lin', email: 'plin@allwestern.com' },
          { name: 'Dana Smith', email: 'dana@example.com' },
        ],
        [{ name: '', email: 'boss@allwestern.com' }],
        2,
      ),
    ).toBe(
      'Peter Lin (plin@allwestern.com), then Dana Smith (dana@example.com) · copy to boss@allwestern.com · 2 more documents',
    )
  })
})

describe('readPlacement', () => {
  test('accepts a placement with a date column', () => {
    expect(readPlacement({ page: 1, x: 40, y: 700, dateX: 300 })).toEqual({ page: 1, x: 40, y: 700, dateX: 300 })
  })

  test('accepts a placement without one (the signatory line)', () => {
    expect(readPlacement({ page: 1, x: 40, y: 700 })).toEqual({ page: 1, x: 40, y: 700 })
  })

  test.each([
    null,
    'x',
    {},
    { page: 0, x: 40, y: 700 },
    { page: 1.5, x: 40, y: 700 },
    { page: 1, x: -1, y: 700 },
    { page: 1, x: 40, y: 900 },
    { page: 1, x: 40, y: 700, dateX: 700 },
    { page: 1, x: 40, y: 700, dateX: '300' },
    { page: 1, x: '40', y: 700 },
    { page: 1, x: Number.NaN, y: 700 },
  ])('refuses %p', (v) => {
    expect(readPlacement(v)).toBeNull()
  })
})
