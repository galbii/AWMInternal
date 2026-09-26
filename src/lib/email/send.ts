// THE ONE DOOR for outbound application email.
//
// Delivery is Resend, configured ONCE as Payload's email adapter
// (`resendAdapter` in payload.config.ts), so this seam sends through
// `payload.sendEmail` rather than talking to api.resend.com itself. One set of
// credentials then covers both Payload's own mail (admin password resets) and
// anything an app sends, and swapping providers stays a one-line adapter
// change instead of a hunt through call sites.
//
// With RESEND_API_KEY unset there is no adapter at all: Payload logs the
// message to the server console instead of sending it, which is what local dev
// wants. Callers get `{ ok: false, skipped: true }` — never a silent success —
// so a UI can say "email is off here" rather than claim a send that never
// happened.
//
// Nothing here throws. A notification that fails must not fail the request
// that triggered it; the caller logs the result and carries on.

import config from '@payload-config'
import { getPayload } from 'payload'

import { env } from '@/lib/env'

export interface EmailMessage {
  to: string | string[]
  subject: string
  /** At least one of html/text — Resend rejects a message with neither. */
  html?: string
  text?: string
  cc?: string | string[]
  bcc?: string | string[]
  replyTo?: string
  /**
   * Overrides RESEND_FROM_ADDRESS for this one message. Whatever domain it
   * uses must be verified in Resend, so leave it unset unless you mean it.
   */
  from?: string
  /**
   * `content` is BASE64, not raw bytes: Resend's API takes base64 and the
   * adapter passes a string attachment straight through without re-encoding
   * it. Handing it a utf-8 string would upload a corrupt file.
   */
  attachments?: { filename: string; content: string }[]
}

export type EmailResult =
  /** Handed to Resend. `id` is their message id, for support tickets. */
  | { ok: true; id: string | null }
  /** Email is switched off in this environment — nothing was sent. */
  | { ok: false; skipped: true; reason: string }
  /** Resend (or the message) was rejected. `error` is safe to show an admin. */
  | { ok: false; skipped: false; error: string }

export function emailEnabled(): boolean {
  return env.RESEND !== null
}

/**
 * What /api/email/test reports. Never includes the key — only whether it is
 * present and whether it has Resend's `re_` shape, which is the one typo
 * worth naming out loud.
 */
export function emailStatus(): {
  configured: boolean
  fromAddress: string | null
  fromName: string | null
  keyLooksValid: boolean
  overrideTo: string | null
} {
  const r = env.RESEND
  return {
    configured: r !== null,
    fromAddress: r?.fromAddress ?? null,
    fromName: r?.fromName ?? null,
    keyLooksValid: r ? r.apiKey.startsWith('re_') : false,
    overrideTo: r?.overrideTo ?? null,
  }
}

export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  if (!env.RESEND) {
    return {
      ok: false,
      skipped: true,
      reason:
        'Email is not configured: RESEND_API_KEY is unset, so messages are logged to the server console instead of sent.',
    }
  }

  if (!msg.html && !msg.text) {
    return { ok: false, skipped: false, error: 'An email needs html or text content.' }
  }

  const payload = await getPayload({ config })

  try {
    const res = await payload.sendEmail({
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      cc: msg.cc,
      bcc: msg.bcc,
      replyTo: msg.replyTo,
      ...(msg.from ? { from: msg.from } : {}),
      ...(msg.attachments?.length ? { attachments: msg.attachments } : {}),
    })

    // The Resend adapter resolves with their JSON ({ id }) and throws on
    // anything else, so this is a read of a successful response, not a check.
    const id =
      res && typeof res === 'object' && 'id' in res && typeof res.id === 'string' ? res.id : null

    return { ok: true, id }
  } catch (err) {
    // The adapter's APIError message already carries Resend's own wording
    // ("domain is not verified", "you can only send to your own address"),
    // which is exactly what whoever is configuring this needs to read.
    payload.logger.error({ err, msg: `email send failed: ${msg.subject}` })
    return {
      ok: false,
      skipped: false,
      error: err instanceof Error ? err.message : 'The email could not be sent.',
    }
  }
}
