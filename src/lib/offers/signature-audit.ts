// The `signature-sent` audit row, written by both doors that can end in a sent
// envelope: /api/offer-signature (sent straight away) and its /return route
// (sent by HR from DocuSign's tagging screen).
//
// Best-effort, exactly like /api/offer-email: the envelope has already gone
// out, so a failed audit must never turn into a failed request. `actor` is
// always the real human; sending is refused under emulation anyway.

import type { Viewer } from '@/lib/auth/viewer'
import type { OfferRequest } from '@/payload-types'

export async function recordSignatureSent(
  v: Viewer,
  doc: Pick<OfferRequest, 'id' | 'employeeName'>,
  envelopeId: string,
  routing: string,
): Promise<void> {
  try {
    await v.payload.create({
      collection: 'offer-events',
      data: {
        offerId: String(doc.id),
        offerTitle: String(doc.employeeName || doc.id),
        actor: String(v.actor.id),
        kind: 'signature-sent',
        summary: 'Sent for signature via DocuSign: ' + routing + ' · envelope ' + envelopeId,
      },
    })
  } catch (err) {
    v.payload.logger.warn({ err, msg: 'offer-signature: audit write failed after a sent envelope' })
  }
}
