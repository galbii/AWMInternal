// PUSH TO HR — the handoff between the `hiring` app and `offers`.
//
// GET  -> { canPush, canReturn, mayIssueFinal, byOffer: { [id]: PushState } }
//         evaluated as the VIEWER, so "view as" sees exactly what that user
//         would. `byOffer` only carries offers the viewer can read.
// POST { ids: string[], push: boolean } -> { ok, byOffer }
//         push:true  hands the requests to HR (the hiring manager's action)
//         push:false returns them (HR only — it un-issues a letter, so it is
//         the stronger right).
//
// The push state lives BESIDE the frozen OfferRecord, like assignments:
// toOfferDoc() never writes these fields, so the client's record blob cannot
// set or clobber them and the byte-stable round trip is preserved.
//
// Emulation is refused on writes, matching every other write route: handing a
// request to HR under someone else's name leaves a trace "view as" cannot
// take back.

import { blockEmulatedWrite, canWrite, deny, getViewer, writeUser } from '@/lib/auth/viewer'
import { mayIssueFinal } from '@/lib/offers/official'

export const dynamic = 'force-dynamic'

const MAX_IDS = 200

export interface PushState {
  pushedToHr: boolean
  pushedAt: string | null
  pushedBy: string | null
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : []

const stateOf = (doc: {
  pushedToHr?: unknown
  pushedAt?: unknown
  pushedBy?: unknown
}): PushState => ({
  pushedToHr: doc.pushedToHr === true,
  pushedAt: typeof doc.pushedAt === 'string' ? doc.pushedAt : null,
  pushedBy:
    doc.pushedBy && typeof doc.pushedBy === 'object'
      ? String((doc.pushedBy as { id?: unknown }).id ?? '')
      : doc.pushedBy
        ? String(doc.pushedBy)
        : null,
})

export async function GET(): Promise<Response> {
  const v = await getViewer()
  if (!v) return deny(401)

  const { docs } = await v.payload.find({
    collection: 'offer-requests',
    depth: 0,
    limit: 0,
    pagination: false,
    sort: 'pos',
    user: v.viewer,
    overrideAccess: false,
  })

  const byOffer: Record<string, PushState> = {}
  for (const doc of docs) byOffer[String(doc.id)] = stateOf(doc)

  const issue = mayIssueFinal(v.viewer)
  return Response.json({
    // Anyone who can reach an offer can hand it on; only HR can pull it back.
    canPush: canWrite(v),
    canReturn: issue && canWrite(v),
    mayIssueFinal: issue,
    byOffer,
  })
}

export async function POST(request: Request): Promise<Response> {
  const v = await getViewer()
  if (!v) return deny(401)
  const blocked = blockEmulatedWrite(v, 'acting-ok')
  if (blocked) return blocked

  let body: { ids?: unknown; push?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  const ids = Array.from(new Set(strings(body.ids)))
  const push = body.push !== false
  if (!ids.length || ids.length > MAX_IDS) return new Response('Bad request', { status: 400 })

  // Returning a request to the hiring manager un-issues its letter, so it is
  // HR's call alone. Pushing is the hiring manager's whole purpose.
  if (!push && !mayIssueFinal(writeUser(v))) return deny(403, 'Only HR can return a request.')

  const byOffer: Record<string, PushState> = {}
  const writer = writeUser(v)
  const actorLabel = String(v.actor.name || v.actor.email || v.actor.id)

  try {
    for (const id of ids) {
      // Read as the ACTOR with overrideAccess:false — the body's id is a
      // lookup key, never a grant.
      const doc = await v.payload.findByID({
        collection: 'offer-requests',
        id,
        depth: 0,
        user: writer,
        overrideAccess: false,
      })

      const current = stateOf(doc)
      if (current.pushedToHr === push) {
        byOffer[id] = current
        continue
      }

      const updated = await v.payload.update({
        collection: 'offer-requests',
        id,
        data: {
          pushedToHr: push,
          pushedAt: push ? new Date().toISOString() : null,
          pushedBy: push ? String(writer.id) : null,
        },
        depth: 0,
        user: writer,
        overrideAccess: false,
      })
      byOffer[id] = stateOf(updated)

      // Best-effort audit, exactly like the collection's own hooks: a failed
      // event must never turn a completed handoff into an error.
      try {
        await v.payload.create({
          collection: 'offer-events',
          data: {
            offerId: String(doc.id),
            offerTitle: String(doc.employeeName || doc.id),
            actor: String(v.actor.id),
            actingAs: v.isActing ? String(v.viewer.id) : null,
            kind: push ? 'pushed-to-hr' : 'returned-to-hiring',
            summary: push
              ? 'Pushed to HR by ' + actorLabel
              : 'Returned to the hiring manager by ' + actorLabel,
          },
        })
      } catch (err) {
        v.payload.logger.warn({ err, msg: 'offer-push: audit write failed' })
      }
    }
  } catch (err) {
    v.payload.logger.error({ err, msg: 'offer-push update failed' })
    return new Response('Could not update', { status: 500 })
  }

  return Response.json({ ok: true, byOffer })
}
