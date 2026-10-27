// Where DocuSign's sending screen returns the browser after HR finishes a
// DRAFT envelope (one with extra agreements — see /api/offer-signature).
//
// GET ?offer=<id>&envelope=<envelopeId>[&event=Send|Save|Cancel…]
//
// DocuSign appends `event`, but a query string is the user's to type, so it
// is never trusted: the envelope's REAL status is read back from DocuSign, and
// only an envelope that has actually left draft is audited as sent. The
// offer is re-read as the viewer, so a URL for someone else's offer audits
// nothing. Either way the browser lands back on the workspace with a
// `signature=` flag the page turns into a toast.

import { getViewer } from '@/lib/auth/viewer'
import { routingSummary } from '@/lib/docusign/build'
import { envelopeRecipients, envelopeStatus } from '@/lib/docusign/envelope'
import { env } from '@/lib/env'
import { recordSignatureSent } from '@/lib/offers/signature-audit'

export const dynamic = 'force-dynamic'

const SENT = new Set(['sent', 'delivered', 'completed'])

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const offer = (url.searchParams.get('offer') || '').trim()
  const envelope = (url.searchParams.get('envelope') || '').trim()
  const origin = env.DOCUSIGN ? env.DOCUSIGN.publicOrigin : url.origin

  const land = (flag: string): Response => {
    const to = new URL(offer ? `/hiring/${encodeURIComponent(offer)}` : '/hiring', origin)
    to.searchParams.set('signature', flag)
    return Response.redirect(to.toString(), 303)
  }

  const v = await getViewer()
  if (!v) return Response.redirect(new URL('/login', origin).toString(), 303)
  if (!env.DOCUSIGN || !offer || !envelope) return land('unknown')

  const { docs } = await v.payload.find({
    collection: 'offer-requests',
    where: { id: { equals: offer } },
    limit: 1,
    depth: 0,
    user: v.viewer,
    overrideAccess: false,
  })
  const doc = docs[0]
  if (!doc) return land('unknown')

  const status = await envelopeStatus(env.DOCUSIGN, envelope)
  if (!status.ok) return land('unknown')
  if (!SENT.has(status.status)) return land('draft')

  const people = await envelopeRecipients(env.DOCUSIGN, envelope)
  const routing = people.ok ? routingSummary(people.signers, people.copies, 0) : 'recipients unavailable'
  // A reload of this URL would audit the same send twice; one row per envelope.
  const seen = await v.payload.find({
    collection: 'offer-events',
    where: {
      and: [
        { offerId: { equals: String(doc.id) } },
        { kind: { equals: 'signature-sent' } },
        { summary: { contains: envelope } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (!seen.docs.length) await recordSignatureSent(v, doc, envelope, routing)
  return land('sent')
}
