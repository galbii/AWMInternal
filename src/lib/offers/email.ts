// Sending an offer letter from inside the app: the pure half.
//
// Both ends of the send share this module. SendLetterModal validates with it
// before it posts so the user sees a bad address immediately; /api/offer-email
// re-validates with the SAME code before anything reaches Resend, because a
// client-side check is a courtesy, never the gate.
//
// The subject and the default message still come from letter-exports.ts
// (`offerEmailSubject` / `offerEmailBody`, ported S3 520–528) — the wording is
// part of the port and does not change just because the transport did.

import { esc } from '@/lib/offers/format'

/** Resend caps `to` at 50; this is the app's own, saner ceiling. */
export const MAX_RECIPIENTS = 10
export const MAX_MESSAGE = 5000
/** Letter PDFs run ~200KB–1MB; base64 adds a third. Refuse anything wilder. */
export const MAX_ATTACHMENT_BASE64 = 8 * 1024 * 1024

// Deliberately loose: the only job here is to catch a typo or a stray name
// before the request goes out. Resend is the real judge of an address.
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/

export function isEmailAddress(s: string): boolean {
  return EMAIL_RE.test(s.trim())
}

/**
 * "a@x.com, b@y.com; c@z.com" -> ['a@x.com','b@y.com','c@z.com'].
 * Split on commas, semicolons and newlines — every separator a pasted
 * address list is likely to arrive with — then trim and de-duplicate
 * case-insensitively, keeping the order typed.
 */
export function parseRecipients(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of (raw || '').split(/[,;\n]+/)) {
    const addr = part.trim()
    if (!addr) continue
    const key = addr.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(addr)
  }
  return out
}

/** The entries that are not plausible addresses — empty list means "send it". */
export function invalidRecipients(list: string[]): string[] {
  return list.filter((a) => !isEmailAddress(a))
}

/**
 * The typed note becomes the email body. It is plain text the user wrote, so
 * it is escaped and its line breaks are honoured — never interpolated as HTML.
 */
export function messageToHtml(message: string): string {
  const paragraphs = (message || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => '<p style="margin:0 0 12px">' + esc(p).replace(/\n/g, '<br>') + '</p>')
    .join('')

  return (
    '<div style="font-family:Segoe UI,Calibri,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a">' +
    paragraphs +
    '</div>'
  )
}

export interface EmailDraftProblem {
  field: 'to' | 'cc' | 'subject' | 'message' | 'attachment'
  message: string
}

export interface EmailDraft {
  to: string[]
  cc: string[]
  subject: string
  message: string
}

/**
 * The one set of rules both ends apply. Returns the first problem, or null
 * when the draft is sendable.
 */
export function checkDraft(draft: EmailDraft): EmailDraftProblem | null {
  if (!draft.to.length) return { field: 'to', message: 'Add at least one recipient.' }
  if (draft.to.length + draft.cc.length > MAX_RECIPIENTS) {
    return { field: 'to', message: `That is more than ${MAX_RECIPIENTS} recipients.` }
  }

  const badTo = invalidRecipients(draft.to)
  if (badTo.length) return { field: 'to', message: `Not an email address: ${badTo.join(', ')}` }

  const badCc = invalidRecipients(draft.cc)
  if (badCc.length) return { field: 'cc', message: `Not an email address: ${badCc.join(', ')}` }

  if (!draft.subject.trim()) return { field: 'subject', message: 'Add a subject.' }
  if (!draft.message.trim()) return { field: 'message', message: 'Add a message.' }
  if (draft.message.length > MAX_MESSAGE) {
    return { field: 'message', message: 'That message is too long to send.' }
  }
  return null
}
