// History + assignments for one offer, consumed by the sidebar on /offers/[id].
// The sidebar fetches client-side (never revalidates the page) so the letter's
// imperative contenteditable island is never remounted by a sidebar refresh.
//
// GET  ?id=<recordId> -> { events, assignments, canAssign, users, applicant }
//      `applicant` is the person this offer is for (the `applicants` row the
//      linkApplicant hook keeps in step) plus every offer of theirs, or null
//      for an offer saved before the collection existed (see
//      scripts/backfill-applicants.ts).
// POST { id, assignments: [{ user, role?, roleOther? }] } -> replace assignments
//      (admin/dev only; blocked while emulating).

import { hasRole } from '@/access/roles'
import { blockEmulatedWrite, canWrite, deny, getViewer, writeUser } from '@/lib/auth/viewer'
import { toActivityEvent } from '@/lib/offers/activity'
import type { User } from '@/payload-types'

export const dynamic = 'force-dynamic'

const label = (u: unknown): string => {
  if (!u || typeof u !== 'object') return ''
  const user = u as Partial<User>
  return user.name || user.email || String(user.id ?? '')
}

const ASSIGN_ROLES = ['recruiter', 'hiring-manager', 'hr', 'approver', 'observer']

interface ApplicantOfferDto {
  id: string
  title: string
  position: string
  branch: string
  stage: 'pipeline' | 'hired' | 'archived'
  status: 'complete' | 'draft'
  updated: string
}

interface ApplicantDto {
  id: string
  name: string
  preferredName: string
  email: string
  phone: string
  address: string
  nmls: string
  notes: string
  offers: ApplicantOfferDto[]
}

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

  // The same shape the cross-offer feed uses (src/lib/offers/activity.ts).
  const events = eventsRes.docs.map(toActivityEvent)

  const assignments = (offer.assignments ?? []).map((a) => ({
    user: typeof a.user === 'string' ? a.user : String(a.user.id),
    label: typeof a.user === 'string' ? a.user : label(a.user),
    role: a.role || '',
    roleOther: a.roleOther || '',
    assignedAt: a.assignedAt || '',
    assignedByLabel: label(a.assignedBy),
  }))

  let applicant: ApplicantDto | null = null
  const applicantId =
    typeof offer.applicant === 'string'
      ? offer.applicant
      : offer.applicant
        ? String(offer.applicant.id)
        : ''
  if (applicantId) {
    const a = await v.payload.findByID({
      collection: 'applicants',
      id: applicantId,
      depth: 0,
      disableErrors: true,
      user: v.viewer,
      overrideAccess: false,
    })
    if (a) {
      // Every offer for this person, newest save first. `data` is selected for
      // the position/branch line only; letterHtml stays out of the payload.
      const theirs = await v.payload.find({
        collection: 'offer-requests',
        where: { applicant: { equals: a.id } },
        sort: '-updated',
        limit: 50,
        depth: 0,
        select: {
          id: true,
          employeeName: true,
          stage: true,
          status: true,
          updated: true,
          data: true,
        },
        user: v.viewer,
        overrideAccess: false,
      })
      applicant = {
        id: String(a.id),
        name: a.name || '',
        preferredName: a.preferredName || '',
        email: a.email || '',
        phone: a.phone || '',
        address: a.address || '',
        nmls: a.nmls || '',
        notes: a.notes || '',
        offers: theirs.docs.map((o) => {
          const od = (o.data && typeof o.data === 'object' ? o.data : {}) as Record<string, unknown>
          return {
            id: String(o.id),
            title: o.employeeName || '',
            position: typeof od.position === 'string' ? od.position : '',
            branch: typeof od.branchName === 'string' ? od.branchName : '',
            stage: o.stage || 'pipeline',
            status: o.status === 'complete' ? 'complete' : 'draft',
            updated: o.updated || '',
          }
        }),
      }
    }
  }

  const canAssign = canWrite(v) && hasRole(writeUser(v), 'admin', 'dev')
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

  return Response.json({ events, assignments, canAssign, users, applicant })
}

export async function POST(request: Request): Promise<Response> {
  const v = await getViewer()
  if (!v) return deny(401)
  const blocked = blockEmulatedWrite(v, 'acting-ok')
  if (blocked) return blocked
  if (!hasRole(writeUser(v), 'admin', 'dev')) return deny(403)

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
