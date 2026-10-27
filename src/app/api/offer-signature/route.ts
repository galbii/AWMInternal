// Send an offer letter to DocuSign for the candidate to sign — the door
// behind SendForSignatureModal (offered on /hiring only; see SignatureProvider).
//
// POST { id, signerName, signerEmail, subject, message, filename, pdfBase64,
//        signAt: { page, x, y, dateX } } -> { ok, envelopeId } | { error }
//
// ONLY A FINAL LETTER GOES OUT FOR SIGNATURE. The same two halves as the
// watermark (src/lib/offers/official.ts) are re-checked here against the
// record as the server reads it: the request has been pushed to HR AND the
// person sending may issue. The modal checks too — a courtesy; this is the
// gate. The PDF itself is still rendered in the browser, so (like the
// watermark) this stops mistakes, not devtools.
//
// The offer is re-read as the VIEWER with `overrideAccess: false`: the body's
// `id` is a lookup key, never a grant. Emulation is refused, tier 'never' — an
// envelope leaves the building under someone's name and cannot be taken back.
//
// A sent envelope is audited into `offer-events` (kind 'signature-sent'),
// best-effort like /api/offer-email: a failed audit must not report a sent
// envelope as failed.

import { blockEmulatedWrite, deny, getViewer } from '@/lib/auth/viewer'
import { MAX_SUBJECT, readPlacement } from '@/lib/docusign/build'
import { sendEnvelope } from '@/lib/docusign/envelope'
import { env } from '@/lib/env'
import { MAX_ATTACHMENT_BASE64, MAX_MESSAGE, isEmailAddress } from '@/lib/offers/email'
import { letterIsOfficial, mayIssueFinal } from '@/lib/offers/official'

export const dynamic = 'force-dynamic'

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

const bad = (message: string, status: 400 | 403 | 404 | 413 | 503 = 400): Response =>
  Response.json({ ok: false, error: message }, { status })

export async function POST(request: Request): Promise<Response> {
  const v = await getViewer()
  if (!v) return deny(401)
  const blocked = blockEmulatedWrite(v, 'never')
  if (blocked) return blocked

  if (!env.DOCUSIGN) {
    return bad(
      env.DOCUSIGN_ERROR
        ? 'DocuSign is misconfigured on this server: ' + env.DOCUSIGN_ERROR
        : 'DocuSign is not configured on this server.',
      503,
    )
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
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

  if (!letterIsOfficial(doc.pushedToHr === true, mayIssueFinal(v.viewer))) {
    return bad(
      doc.pushedToHr === true
        ? 'Only HR can send a final letter for signature.'
        : 'Push this request to HR first — only a final letter can go out for signature.',
      403,
    )
  }

  const signerName = str(body.signerName).trim()
  const signerEmail = str(body.signerEmail).trim()
  const subject = str(body.subject).trim()
  const message = str(body.message)
  const filename = str(body.filename).trim() || 'Offer_Letter.pdf'
  const pdfBase64 = str(body.pdfBase64)
  const place = readPlacement(body.signAt)

  if (!signerName) return bad('Who is signing? Add the candidate’s name.')
  if (!isEmailAddress(signerEmail)) return bad('That signer email address does not look right.')
  if (!subject) return bad('Add a subject.')
  if (subject.length > MAX_SUBJECT) return bad(`Keep the subject under ${MAX_SUBJECT} characters.`)
  if (message.length > MAX_MESSAGE) return bad('That message is too long.')
  if (!pdfBase64) return bad('The letter did not arrive intact.')
  if (pdfBase64.length > MAX_ATTACHMENT_BASE64) return bad('That letter is too large to send.', 413)
  if (!place) return bad('Could not find the signature line on the letter.')

  const sent = await sendEnvelope(env.DOCUSIGN, {
    pdfBase64,
    filename,
    signerName,
    signerEmail,
    subject,
    message,
    place,
  })
  if (!sent.ok) return Response.json({ ok: false, error: sent.error }, { status: 502 })

  try {
    await v.payload.create({
      collection: 'offer-events',
      data: {
        offerId: String(doc.id),
        offerTitle: String(doc.employeeName || doc.id),
        actor: String(v.actor.id),
        kind: 'signature-sent',
        summary:
          'Sent the letter to ' + signerName + ' (' + signerEmail + ') for signature via DocuSign',
      },
    })
  } catch (err) {
    v.payload.logger.warn({ err, msg: 'offer-signature: audit write failed after a sent envelope' })
  }

  return Response.json({ ok: true, envelopeId: sent.envelopeId })
}
