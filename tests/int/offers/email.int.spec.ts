// The send-an-offer rules, which the modal and /api/offer-email BOTH apply.
// A change here changes the gate, not just the hint under the field.

import { describe, expect, test } from 'bun:test'

import {
  MAX_MESSAGE,
  MAX_RECIPIENTS,
  checkDraft,
  invalidRecipients,
  isEmailAddress,
  messageToHtml,
  parseRecipients,
} from '@/lib/offers/email'

const draft = (over: Partial<Parameters<typeof checkDraft>[0]> = {}) => ({
  to: ['new.hire@example.com'],
  cc: [],
  subject: 'Your Offer of Employment',
  message: 'Hi Mickey,\n\nCongratulations!',
  ...over,
})

describe('recipients', () => {
  test('splits on commas, semicolons and newlines', () => {
    expect(parseRecipients('a@x.com, b@y.com; c@z.com\nd@w.com')).toEqual([
      'a@x.com',
      'b@y.com',
      'c@z.com',
      'd@w.com',
    ])
  })

  test('trims, drops blanks, and de-duplicates case-insensitively', () => {
    expect(parseRecipients('  a@x.com ,, A@X.com ;  ')).toEqual(['a@x.com'])
  })

  test('empty input is no recipients, not one blank one', () => {
    expect(parseRecipients('')).toEqual([])
    expect(parseRecipients('  ,;  ')).toEqual([])
  })

  test('catches what is plainly not an address', () => {
    expect(isEmailAddress('new.hire@example.com')).toBe(true)
    expect(isEmailAddress('mickey')).toBe(false)
    expect(isEmailAddress('mickey@localhost')).toBe(false)
    expect(invalidRecipients(['a@x.com', 'nope'])).toEqual(['nope'])
  })
})

describe('checkDraft', () => {
  test('a filled draft passes', () => {
    expect(checkDraft(draft())).toBeNull()
  })

  test('needs a recipient, a subject and a message', () => {
    expect(checkDraft(draft({ to: [] }))?.field).toBe('to')
    expect(checkDraft(draft({ subject: '   ' }))?.field).toBe('subject')
    expect(checkDraft(draft({ message: '' }))?.field).toBe('message')
  })

  test('names the bad address rather than just refusing', () => {
    const problem = checkDraft(draft({ to: ['a@x.com', 'oops'] }))
    expect(problem?.field).toBe('to')
    expect(problem?.message).toContain('oops')
  })

  test('cc is validated too', () => {
    expect(checkDraft(draft({ cc: ['nope'] }))?.field).toBe('cc')
  })

  test('to and cc share the recipient ceiling', () => {
    const many = Array.from({ length: MAX_RECIPIENTS }, (_, i) => `a${i}@x.com`)
    expect(checkDraft(draft({ to: many, cc: ['one.more@x.com'] }))?.field).toBe('to')
  })

  test('refuses a message longer than the cap', () => {
    expect(checkDraft(draft({ message: 'x'.repeat(MAX_MESSAGE + 1) }))?.field).toBe('message')
  })
})

describe('messageToHtml', () => {
  test('escapes the note — it is typed text, never markup', () => {
    expect(messageToHtml('<script>alert(1)</script>')).not.toContain('<script>')
    expect(messageToHtml('a & b')).toContain('a &amp; b')
  })

  test('blank lines become paragraphs, single breaks stay breaks', () => {
    const html = messageToHtml('Hi Mickey,\n\nLine one\nLine two')
    expect(html.match(/<p /g)?.length).toBe(2)
    expect(html).toContain('Line one<br>Line two')
  })
})
