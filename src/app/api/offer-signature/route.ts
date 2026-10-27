// Send an offer letter to DocuSign for signature — the door behind
// SendForSignatureModal (offered on /hiring only; see SignatureProvider).
//
// POST {
//   id, subject, message,
//   letter:   { filename, base64 },                 the rendered letter PDF
//   extras:   [{ filename, base64 }],                further agreements (pdf/docx/doc)
//   internal: { name, email, place },                signs FIRST, on "Warm regards"
//   candidate:{ name, email, place },                signs SECOND, on the acceptance line
//   copyTo:   { name?, email } | null                the reporting manager's copy
// }
// -> { ok, envelopeId, reviewUrl? } | { error }
//
// With no extras the envelope is SENT straight away. With extras it is created
// as a DRAFT and `reviewUrl` opens DocuSign's tagging screen, where HR places
// the extras' fields and sends; DocuSign then returns the browser to
// /api/offer-signature/return, which confirms the send and audits it.
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

import { blockEmulatedWrite, deny, getViewer } from '@/lib/auth/viewer'
import {
  MAX_EXTRA_DOCS,
  MAX_SUBJECT,
  isAcceptedExtra,
  readPlacement,
  routingSummary,
  type EnvelopeDoc,
  type EnvelopeParty,
} from '@/lib/docusign/build'
import { createEnvelope, senderViewUrl } from '@/lib/docusign/envelope'
import { env } from '@/lib/env'
import { MAX_ATTACHMENT_BASE64, MAX_MESSAGE, isEmailAddress } from '@/lib/offers/email'
import { letterIsOfficial, mayIssueFinal } from '@/lib/offers/official'
import { recordSignatureSent } from '@/lib/offers/signature-audit'

export const dynamic = 'force-dynamic'

/** Everything in one envelope, base64. DocuSign's own ceiling is 25MB per document. */
const MAX_TOTAL_BASE64 = 32 * 1024 * 1024

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {}

const bad = (message: string, status: 400 | 403 | 404 | 413 | 503 = 400): Response =>
  Response.json({ ok: false, error: message }, { status })

function readDoc(v: unknown): EnvelopeDoc | null {
  const o = obj(v)
  const filename = str(o.filename).trim()
  const base64 = str(o.base64)
  return filename && base64 ? { filename, base64 } : null
}

function readParty(v: unknown): EnvelopeParty | null {
  const o = obj(v)
  const email = str(o.email).trim()
  return isEmailAddress(email) ? { name: str(o.name).trim(), email } : null
}

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
    body = obj(await request.json())
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

  const subject = str(body.subject).trim()
  const message = str(body.message)
  if (!subject) return bad('Add a subject.')
  if (subject.length > MAX_SUBJECT) return bad(`Keep the subject under ${MAX_SUBJECT} characters.`)
  if (message.length > MAX_MESSAGE) return bad('That message is too long.')

  const letter = readDoc(body.letter)
  if (!letter) return bad('The letter did not arrive intact.')
  if (letter.base64.length > MAX_ATTACHMENT_BASE64) return bad('That letter is too large to send.', 413)

  const rawExtras = Array.isArray(body.extras) ? body.extras : []
  if (rawExtras.length > MAX_EXTRA_DOCS) return bad(`Attach at most ${MAX_EXTRA_DOCS} agreements.`)
  const extras: EnvelopeDoc[] = []
  for (const raw of rawExtras) {
    const d = readDoc(raw)
    if (!d) return bad('An attached agreement did not arrive intact.')
    if (!isAcceptedExtra(d.filename)) return bad(`${d.filename}: attach PDF or Word files only.`)
    extras.push(d)
  }
  const total = letter.base64.length + extras.reduce((n, d) => n + d.base64.length, 0)
  if (total > MAX_TOTAL_BASE64) return bad('Those documents are too large to send together.', 413)

  const internal = readParty(body.internal)
  const internalAt = readPlacement(obj(body.internal).place)
  const candidate = readParty(body.candidate)
  const candidateAt = readPlacement(obj(body.candidate).place)
  if (!internal || !internal.name) return bad('Add the internal signer’s name and email.')
  if (!candidate || !candidate.name) return bad('Add the candidate’s name and email.')
  if (!internalAt) return bad('Could not find the signatory’s line on the letter.')
  if (!candidateAt || candidateAt.dateX === undefined) {
    return bad('Could not find the acceptance line on the letter.')
  }
  if (internal.email.toLowerCase() === candidate.email.toLowerCase()) {
    return bad('The internal signer and the candidate must be different people.')
  }

  let copyTo: EnvelopeParty | null = null
  if (body.copyTo) {
    copyTo = readParty(body.copyTo)
    if (!copyTo) return bad('That reporting manager email does not look right.')
  }

  const draft = extras.length > 0
  const created = await createEnvelope(env.DOCUSIGN, {
    letter,
    extras,
    internal: { ...internal, place: internalAt },
    candidate: { ...candidate, place: candidateAt },
    copyTo,
    subject,
    message,
    draft,
  })
  if (!created.ok) return Response.json({ ok: false, error: created.error }, { status: 502 })

  if (!draft) {
    await recordSignatureSent(
      v,
      doc,
      created.envelopeId,
      routingSummary([internal, candidate], copyTo ? [copyTo] : [], 0),
    )
    return Response.json({ ok: true, envelopeId: created.envelopeId })
  }

  const back = new URL('/api/offer-signature/return', env.DOCUSIGN.publicOrigin)
  back.searchParams.set('offer', String(doc.id))
  back.searchParams.set('envelope', created.envelopeId)
  const view = await senderViewUrl(env.DOCUSIGN, created.envelopeId, back.toString())
  if (!view.ok) {
    return Response.json(
      {
        ok: false,
        error:
          'The envelope was created as a draft in DocuSign, but its sending screen could not be opened: ' +
          view.error,
      },
      { status: 502 },
    )
  }
  return Response.json({ ok: true, envelopeId: created.envelopeId, reviewUrl: view.url })
}
