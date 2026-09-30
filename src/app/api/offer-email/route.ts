// Send an offer letter by email — the door behind SendLetterModal.
//
// POST { id, to, cc?, subject, message, attachment? } -> { ok, id } | { error }
//
// The offer is re-read as the VIEWER with `overrideAccess: false`, so a user
// who cannot see the record cannot mail it either: the body's `id` is a lookup
// key, never a grant. The draft is re-checked with the same pure rules the
// modal used (src/lib/offers/email.ts), because a client-side check is a
// courtesy and this is the gate.
//
// Emulation is refused. Sending mail under someone else's name leaves a trace
// outside the app that "view as" can never take back.
//
// The send is audited into `offer-events` (kind: 'email-sent') so the activity
// rail shows who mailed the offer, to whom, and when — best-effort, exactly
// like the collection's own hooks: a failed audit must not report a sent email
// as failed, because the email is already gone.

import { blockEmulatedWrite, deny, getViewer } from '@/lib/auth/viewer'
import { sendEmail } from '@/lib/email/send'
import {
  MAX_ATTACHMENT_BASE64,
  checkDraft,
  messageToHtml,
  parseRecipients,
} from '@/lib/offers/email'

export const dynamic = 'force-dynamic'

interface SendBody {
  id?: unknown
  to?: unknown
  cc?: unknown
  subject?: unknown
  message?: unknown
  attachment?: { filename?: unknown; contentBase64?: unknown } | null
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

const bad = (message: string, status: 400 | 404 | 413 = 400): Response =>
  Response.json({ ok: false, error: message }, { status })

export async function POST(request: Request): Promise<Response> {
  const v = await getViewer()
  if (!v) return deny(401)
  const blocked = blockEmulatedWrite(v, 'never')
  if (blocked) return blocked

  let body: SendBody
  try {
    body = (await request.json()) as SendBody
  } catch {
    return bad('That request could not be read.')
  }

  const id = str(body.id).trim()
  if (!id) return bad('Which offer?')

  const { docs } = await v.payload.find({
    collection: 'offer-requests',
    where: { id: { equals: id } },
    limit: 1,
    depth: 0,
    user: v.viewer,
    overrideAccess: false,
  })
  const doc = docs[0]
  if (!doc) return bad('That offer no longer exists.', 404)

  const draft = {
    to: parseRecipients(str(body.to)),
    cc: parseRecipients(str(body.cc)),
    subject: str(body.subject).trim(),
    message: str(body.message),
  }
  const problem = checkDraft(draft)
  if (problem) return bad(problem.message)

  const attachments: { filename: string; content: string }[] = []
  if (body.attachment) {
    const filename = str(body.attachment.filename).trim()
    const content = str(body.attachment.contentBase64)
    if (!filename || !content) return bad('The attachment did not arrive intact.')
    if (content.length > MAX_ATTACHMENT_BASE64) {
      return bad('That attachment is too large to email.', 413)
    }
    attachments.push({ filename, content })
  }

  const sent = await sendEmail({
    to: draft.to,
    cc: draft.cc.length ? draft.cc : undefined,
    subject: draft.subject,
    text: draft.message,
    html: messageToHtml(draft.message),
    // Mail leaves the shared RESEND_FROM_ADDRESS, so a reply would land
    // nowhere useful. Point it at the person who pressed Send.
    replyTo: v.actor.email,
    attachments,
  })

  if (!sent.ok) {
    return Response.json(
      { ok: false, error: sent.skipped ? sent.reason : sent.error },
      { status: sent.skipped ? 503 : 502 },
    )
  }

  // Audited after a confirmed send, and never allowed to fail the response.
  try {
    await v.payload.create({
      collection: 'offer-events',
      data: {
        offerId: String(doc.id),
        offerTitle: String(doc.employeeName || doc.id),
        actor: String(v.actor.id),
        kind: 'email-sent',
        summary:
          'Emailed the offer to ' +
          draft.to.join(', ') +
          (draft.cc.length ? ' (cc ' + draft.cc.join(', ') + ')' : '') +
          (attachments.length ? ' with the letter attached' : ''),
      },
    })
  } catch (err) {
    v.payload.logger.warn({ err, msg: 'offer-email: audit write failed after a sent email' })
  }

  return Response.json({ ok: true, id: sent.id, to: draft.to, cc: draft.cc })
}
