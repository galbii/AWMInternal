// History + assignments for one offer, consumed by the sidebar on /offers/[id].
// The sidebar fetches client-side (never revalidates the page) so the letter's
// imperative contenteditable island is never remounted by a sidebar refresh.
//
// GET  ?id=<recordId> -> { events, assignments, canAssign, users }
// POST { id, assignments: [{ user, role?, roleOther? }] } -> replace assignments
//      (admin/dev only; blocked while emulating).

import { hasRole } from '@/access/roles'
import { deny, getViewer } from '@/lib/auth/viewer'
import type { User } from '@/payload-types'

export const dynamic = 'force-dynamic'

const label = (u: unknown): string => {
  if (!u || typeof u !== 'object') return ''
  const user = u as Partial<User>
  return user.name || user.email || String(user.id ?? '')
}

const ASSIGN_ROLES = ['recruiter', 'hiring-manager', 'hr', 'approver', 'observer']

export async function GET(request: Request): Promise<Response> {
  const v = await getViewer()
  if (!v) return deny(401)
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return new Response('Missing id', { status: 400 })

  // Prove the viewer can read the offer before showing its history.
  const found = await v.payload.find({
    collection: 'offer-requests',
    where: { id: { equals: id } },
    limit: 1,
    depth: 1,
    user: v.viewer,
    overrideAccess: false,
  })
  const offer = found.docs[0]
  if (!offer) return new Response('Not found', { status: 404 })

  const eventsRes = await v.payload.find({
    collection: 'offer-events',
    where: { offerId: { equals: id } },
    sort: '-createdAt',
    limit: 100,
    depth: 1,
    user: v.viewer,
    overrideAccess: false,
  })

  const events = eventsRes.docs.map((e) => ({
    id: String(e.id),
    kind: e.kind,
    summary: e.summary || '',
    changes: (e.changes ?? []).map((c) => ({
      field: c.field,
      label: c.label || c.field,
      from: c.from || '',
      to: c.to || '',
    })),
    targetLabel: label(e.targetUser),
    targetRole: e.targetRole || '',
    editCount: e.editCount ?? 1,
    actorLabel: label(e.actor) || 'System',
    at: e.createdAt,
  }))

  const assignments = (offer.assignments ?? []).map((a) => ({
    user: typeof a.user === 'string' ? a.user : String(a.user.id),
    label: typeof a.user === 'string' ? a.user : label(a.user),
    role: a.role || '',
    roleOther: a.roleOther || '',
    assignedAt: a.assignedAt || '',
    assignedByLabel: label(a.assignedBy),
  }))

  const canAssign = !v.isEmulating && hasRole(v.actor, 'admin', 'dev')
  let users: { id: string; label: string }[] = []
  if (canAssign) {
    const usersRes = await v.payload.find({
      collection: 'users',
      limit: 0,
      pagination: false,
      depth: 0,
      sort: 'name',
      overrideAccess: true,
    })
    users = usersRes.docs.map((u) => ({ id: String(u.id), label: label(u) }))
  }

  return Response.json({ events, assignments, canAssign, users })
}

export async function POST(request: Request): Promise<Response> {
  const v = await getViewer()
  if (!v) return deny(401)
  if (v.isEmulating) return deny(403, 'Read-only while viewing as another user.')
  if (!hasRole(v.actor, 'admin', 'dev')) return deny(403)

  let body: { id?: unknown; assignments?: unknown }
  try {
    body = (await request.json()) as { id?: unknown; assignments?: unknown }
  } catch {
    return new Response('Bad request', { status: 400 })
  }
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id || !Array.isArray(body.assignments)) return new Response('Bad request', { status: 400 })

  const rows = body.assignments
    .map((r) => r as { user?: unknown; role?: unknown; roleOther?: unknown })
    .filter((r) => typeof r.user === 'string' && r.user)
    .map((r) => ({
      user: r.user as string,
      role:
        typeof r.role === 'string' && ASSIGN_ROLES.includes(r.role)
          ? (r.role as 'recruiter' | 'hiring-manager' | 'hr' | 'approver' | 'observer')
          : null,
      roleOther: typeof r.roleOther === 'string' ? r.roleOther : null,
    }))

  try {
    await v.payload.update({
      collection: 'offer-requests',
      id,
      data: { assignments: rows },
      depth: 0,
      user: v.actor,
      overrideAccess: false,
    })
    return Response.json({ ok: true })
  } catch (err) {
    v.payload.logger.error({ err, msg: `assignment update failed for ${id}` })
    return new Response('Update failed', { status: 500 })
  }
}
