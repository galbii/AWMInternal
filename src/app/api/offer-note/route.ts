// Add a note to an offer's activity feed.
//
// POST { offerId, body } -> { ok, event }
//
// A note is the one activity row a human writes on purpose, rather than one
// the hooks derive from a change. It goes through the same `offer-events`
// collection as everything else, so it appears in the per-offer rail and the
// cross-offer Analysis feed with no extra plumbing.
//
// Tier 'acting-ok': a note IS in-app, auditable and reversible, so it is
// exactly the kind of work view-as should be able to do — and when an admin is
// ACTING as someone, `actingAs` attributes it to both, so the feed reads
// "Chance (as Dana)". A note that silently claimed to be Dana's would be the
// forgery this whole design exists to avoid.
//
// The offer is re-read as the VIEWER with overrideAccess:false — the body's
// offerId is a lookup key, never a grant.

import { blockEmulatedWrite, deny, getViewer, writeUser } from '@/lib/auth/viewer'
import { MAX_NOTE, toActivityEvent } from '@/lib/offers/activity'

export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const v = await getViewer()
  if (!v) return deny(401)
  const blocked = blockEmulatedWrite(v, 'acting-ok')
  if (blocked) return blocked

  let input: { offerId?: unknown; body?: unknown }
  try {
    input = (await request.json()) as typeof input
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  const offerId = typeof input.offerId === 'string' ? input.offerId : ''
  const text = (typeof input.body === 'string' ? input.body : '').trim()
  if (!offerId) return new Response('Bad request', { status: 400 })
  if (!text) return deny(403, 'A note cannot be empty.')
  if (text.length > MAX_NOTE) return deny(403, `A note is at most ${MAX_NOTE} characters.`)

  const found = await v.payload.find({
    collection: 'offer-requests',
    where: { id: { equals: offerId } },
    limit: 1,
    depth: 0,
    user: v.viewer,
    overrideAccess: false,
  })
  const doc = found.docs[0]
  if (!doc) return deny(403)

  try {
    const created = await v.payload.create({
      collection: 'offer-events',
      data: {
        offerId: String(doc.id),
        offerTitle: String(doc.employeeName || doc.id),
        // Dual attribution, exactly as the collection hooks do it.
        actor: String(v.actor.id),
        actingAs: v.isActing ? String(writeUser(v).id) : null,
        kind: 'note',
        summary: text,
      },
      depth: 1,
      overrideAccess: true,
    })
    return Response.json({ ok: true, event: toActivityEvent(created) })
  } catch (err) {
    v.payload.logger.error({ err, msg: 'offer-note create failed' })
    return new Response('Could not add the note', { status: 500 })
  }
}
