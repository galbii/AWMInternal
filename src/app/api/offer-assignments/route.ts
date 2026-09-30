// Assignments for the offer LIST views — who is assigned to every offer the
// viewer can read, in one call, plus add/remove edits that can span many
// offers (the bulk "Assign" in the pipeline selection bar).
//
// GET  -> { me, canAssign, users, byOffer: { [offerId]: Assignee[] } }
//         evaluated as the VIEWER; `users` is only sent to people who may assign.
// POST { ids: string[], add?: userId[], remove?: userId[] }
//      -> { ok, byOffer } for the touched offers. Admin/dev only; blocked while
//         emulating. Each offer's array is re-derived from ITS current rows so a
//         row's role survives, and the beforeChange hook keeps assignedAt/By
//         (src/collections/OfferRequests/hooks/syncOfferMeta.ts). Every change
//         lands in `offer-events` through the existing afterChange hook.
//
// Roles are still set per offer on /offers/[id] (/api/offer-timeline).

import { hasRole } from '@/access/roles'
import { blockEmulatedWrite, canWrite, deny, getViewer, writeUser } from '@/lib/auth/viewer'
import {
  applyAssignmentEdit,
  isAssignRole,
  sameAssignees,
  type AssignRole,
} from '@/lib/offers/assignments'
import type { User } from '@/payload-types'

export const dynamic = 'force-dynamic'

const MAX_IDS = 200

interface Assignee {
  user: string
  label: string
  role: string
  roleOther: string
}

const label = (u: unknown): string => {
  if (!u || typeof u !== 'object') return ''
  const user = u as Partial<User>
  return user.name || user.email || String(user.id ?? '')
}

const idOf = (v: unknown): string => {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object' && 'id' in v) return String((v as { id: unknown }).id)
  return ''
}

interface RawRow {
  user: string | User
  role?: string | null
  roleOther?: string | null
}

/** Rows as the client sees them; `labels` fills names in when `user` is a bare id. */
function rowsOf(rows: RawRow[] | null | undefined, labels?: Map<string, string>): Assignee[] {
  return (rows ?? []).map((a) => {
    const id = idOf(a.user)
    const fromDoc = typeof a.user === 'string' ? '' : label(a.user)
    return {
      user: id,
      label: fromDoc || labels?.get(id) || id,
      role: a.role || '',
      roleOther: a.roleOther || '',
    }
  })
}

async function userLabels(v: NonNullable<Awaited<ReturnType<typeof getViewer>>>) {
  const res = await v.payload.find({
    collection: 'users',
    limit: 0,
    pagination: false,
    depth: 0,
    sort: 'name',
    overrideAccess: true,
  })
  const users = res.docs.map((u) => ({ id: String(u.id), label: label(u) }))
  return { users, labels: new Map(users.map((u) => [u.id, u.label])) }
}

export async function GET(): Promise<Response> {
  const v = await getViewer()
  if (!v) return deny(401)

  const { docs } = await v.payload.find({
    collection: 'offer-requests',
    depth: 1,
    limit: 0,
    pagination: false,
    select: { assignments: true },
    user: v.viewer,
    overrideAccess: false,
  })
  const byOffer: Record<string, Assignee[]> = {}
  for (const d of docs) byOffer[String(d.id)] = rowsOf(d.assignments as RawRow[] | null | undefined)

  // Evaluated against the identity a write would RUN as: acting is strictly
  // downward, so acting-as-a-plain-user correctly cannot assign.
  const canAssign = canWrite(v) && hasRole(writeUser(v), 'admin', 'dev')
  const users = canAssign ? (await userLabels(v)).users : []

  return Response.json({ me: String(v.viewer.id), canAssign, users, byOffer })
}

const strings = (x: unknown): string[] =>
  Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string' && s.length > 0) : []

export async function POST(request: Request): Promise<Response> {
  const v = await getViewer()
  if (!v) return deny(401)
  const blocked = blockEmulatedWrite(v, 'acting-ok')
  if (blocked) return blocked
  if (!hasRole(writeUser(v), 'admin', 'dev')) return deny(403)

  let body: { ids?: unknown; add?: unknown; remove?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return new Response('Bad request', { status: 400 })
  }
  const ids = Array.from(new Set(strings(body.ids)))
  if (!ids.length || ids.length > MAX_IDS) return new Response('Bad request', { status: 400 })

  // Only real accounts can be assigned; unknown ids are dropped, not 500s.
  const { labels } = await userLabels(v)
  const add = strings(body.add).filter((id) => labels.has(id))
  const remove = strings(body.remove)
  if (!add.length && !remove.length) return Response.json({ ok: true, byOffer: {} })

  const byOffer: Record<string, Assignee[]> = {}
  try {
    for (const id of ids) {
      const doc = await v.payload.findByID({
        collection: 'offer-requests',
        id,
        depth: 0,
        user: writeUser(v),
        overrideAccess: false,
      })
      const current = rowsOf(doc.assignments as RawRow[] | null | undefined, labels)
      const next = applyAssignmentEdit(current, { add, remove }, (user) => ({
        user,
        label: labels.get(user) || user,
        role: '',
        roleOther: '',
      }))
      if (sameAssignees(current, next)) {
        byOffer[id] = current
        continue
      }
      await v.payload.update({
        collection: 'offer-requests',
        id,
        data: {
          assignments: next.map((r) => ({
            user: r.user,
            role: isAssignRole(r.role) ? (r.role as AssignRole) : null,
            roleOther: r.roleOther || null,
          })),
        },
        depth: 0,
        user: writeUser(v),
        overrideAccess: false,
      })
      byOffer[id] = next
    }
  } catch (err) {
    v.payload.logger.error({ err, msg: 'offer-assignments update failed' })
    return new Response('Update failed', { status: 500 })
  }

  return Response.json({ ok: true, byOffer })
}
