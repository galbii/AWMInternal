// The cross-offer activity feed, for the Analysis view's "Recent activity".
//
// GET ?limit=60&before=<ISO>&filter=all|edits|stage|people|letter
//   -> { events, nextBefore }   newest first; `nextBefore` is the cursor for
//      the next page (pass it back as `before`), or null at the end.
//
// Evaluated as the VIEWER with real access control: offer-events.read is
// `authenticated` and offers are a shared workspace, so any signed-in user
// sees the same feed a colleague does — and "view as" shows exactly that.

import type { Where } from 'payload'

import { deny, getViewer } from '@/lib/auth/viewer'
import { isActivityFilter, kindsForFilter, toActivityEvent } from '@/lib/offers/activity'

export const dynamic = 'force-dynamic'

const DEFAULT_LIMIT = 60
const MAX_LIMIT = 200

export async function GET(request: Request): Promise<Response> {
  const v = await getViewer()
  if (!v) return deny(401)

  const params = new URL(request.url).searchParams
  const limitRaw = Number.parseInt(params.get('limit') || '', 10)
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 1), MAX_LIMIT)
    : DEFAULT_LIMIT
  const before = params.get('before')
  const filterRaw = params.get('filter') || 'all'
  const filter = isActivityFilter(filterRaw) ? filterRaw : 'all'
  const kinds = kindsForFilter(filter)

  const and: Where[] = []
  if (before && !Number.isNaN(Date.parse(before))) {
    and.push({ createdAt: { less_than: new Date(before).toISOString() } })
  }
  if (kinds) and.push({ kind: { in: kinds } })

  const res = await v.payload.find({
    collection: 'offer-events',
    ...(and.length ? { where: { and } } : {}),
    sort: '-createdAt',
    limit,
    depth: 1,
    user: v.viewer,
    overrideAccess: false,
  })

  const events = res.docs.map(toActivityEvent)
  const last = events[events.length - 1]
  return Response.json({
    events,
    nextBefore: res.hasNextPage && last ? last.at : null,
  })
}
