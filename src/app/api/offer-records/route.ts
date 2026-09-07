// The single door to `offer-requests` for the app at "/". (The collection sets
// `endpoints: false`, so Payload's generated REST for it is closed.)
//
// GET  -> the full record list in display order, evaluated as the VIEWER (so a
//         dev's "view as" sees exactly what that user would see).
// POST -> a sync diff from the client seam (src/lib/offers/storage.ts):
//         { upsert: [{rec, pos?}], reorder: [{id, pos}], remove: [ids] },
//         applied in one Mongo transaction as the ACTOR. Rejected while
//         emulating — view-as is read-only.

import { createLocalReq } from 'payload'

import { deny, getViewer } from '@/lib/auth/viewer'
import { toOfferDoc, toOfferRecord } from '@/lib/offers/payload-doc'
import type { OfferRecord } from '@/lib/offers/types'

export const dynamic = 'force-dynamic'

interface UpsertEntry {
  rec: OfferRecord
  pos?: number
}

interface SyncBody {
  upsert?: UpsertEntry[]
  reorder?: { id: string; pos: number }[]
  remove?: string[]
}

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
  return Response.json({ records: docs.map(toOfferRecord) })
}

export async function POST(request: Request): Promise<Response> {
  const v = await getViewer()
  if (!v) return deny(401)
  if (v.isEmulating) {
    return deny(403, 'Read-only: you are viewing as another user. Exit view-as to make changes.')
  }

  let body: SyncBody
  try {
    body = (await request.json()) as SyncBody
  } catch {
    return new Response('Bad request', { status: 400 })
  }
  const upsert = Array.isArray(body.upsert) ? body.upsert.filter((u) => u && u.rec && u.rec.id) : []
  const reorder = Array.isArray(body.reorder) ? body.reorder : []
  const remove = Array.isArray(body.remove) ? body.remove.filter((id) => typeof id === 'string') : []
  if (!upsert.length && !reorder.length && !remove.length) return Response.json({ ok: true })

  const { payload } = v
  const req = await createLocalReq({ user: v.actor }, payload)
  const transactionID = await payload.db.beginTransaction()
  if (transactionID) req.transactionID = transactionID

  try {
    if (remove.length) {
      await payload.delete({
        collection: 'offer-requests',
        where: { id: { in: remove } },
        depth: 0,
        req,
        user: v.actor,
        overrideAccess: false,
      })
    }

    if (upsert.length) {
      const { docs: existing } = await payload.find({
        collection: 'offer-requests',
        where: { id: { in: upsert.map((u) => u.rec.id) } },
        depth: 0,
        limit: 0,
        pagination: false,
        select: { id: true },
        req,
        user: v.actor,
        overrideAccess: false,
      })
      const have = new Set(existing.map((d) => String(d.id)))
      for (const u of upsert) {
        const data = toOfferDoc(u.rec, u.pos)
        if (have.has(u.rec.id)) {
          await payload.update({
            collection: 'offer-requests',
            id: u.rec.id,
            data,
            depth: 0,
            req,
            user: v.actor,
            overrideAccess: false,
          })
        } else {
          await payload.create({
            collection: 'offer-requests',
            data: { ...data, id: u.rec.id },
            depth: 0,
            req,
            user: v.actor,
            overrideAccess: false,
          })
        }
      }
    }

    for (const r of reorder) {
      await payload.update({
        collection: 'offer-requests',
        id: r.id,
        data: { pos: r.pos },
        depth: 0,
        req,
        user: v.actor,
        overrideAccess: false,
      })
    }

    if (transactionID) await payload.db.commitTransaction(transactionID)
    return Response.json({ ok: true })
  } catch (err) {
    if (transactionID) await payload.db.rollbackTransaction(transactionID)
    payload.logger.error({ err, msg: 'offer-records sync failed' })
    return new Response('Sync failed', { status: 500 })
  }
}
