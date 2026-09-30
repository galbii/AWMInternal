// Admin writes for the Users app (/users). Admin/dev only, and rejected while
// emulating — view-as is read-only everywhere. Every accepted field is copied
// out by hand; the request body never reaches payload.update.
//
// PATCH  { id, roles?, apps?, emulationBlocked? } -> { ok, user }
//        roles: never on yourself (the same rule /api/profile enforces).
//        apps: membership-managed app ids only, canonicalised by withApps.
// DELETE { id } -> { ok }        never yourself.
//
// Creating users stays on Payload's own /api/users (NewUserModal); this route
// covers what that endpoint has no place for.

import { Forbidden, NotFound } from 'payload'

import { hasRole, type Role } from '@/access/roles'
import { withApps } from '@/lib/apps/membership'
import { isMembershipApp } from '@/lib/apps/registry'
import { blockEmulatedWrite, deny, getViewer, type Viewer } from '@/lib/auth/viewer'
import type { User } from '@/payload-types'
import { toDirectoryUser } from '@/lib/users/directory'

export const dynamic = 'force-dynamic'

const ROLES = new Set<string>(['dev', 'admin', 'user'] satisfies Role[])

const fail = (status: 400 | 404, msg: string): Response => new Response(msg, { status })

async function gate(): Promise<{ v: Viewer } | { err: Response }> {
  const v = await getViewer()
  if (!v) return { err: deny(401) }
  const blocked = blockEmulatedWrite(v, 'never')
  if (blocked) {
    return {
      err: blocked,
    }
  }
  if (!hasRole(v.actor, 'admin', 'dev')) return { err: deny(403) }
  return { v }
}

async function readId(
  request: Request,
): Promise<{ id: string; body: Record<string, unknown> } | null> {
  try {
    const body = (await request.json()) as Record<string, unknown>
    const id = typeof body.id === 'string' ? body.id.trim() : ''
    return id ? { id, body } : null
  } catch {
    return null
  }
}

function explain(err: unknown, v: Viewer, what: string): Response {
  v.payload.logger.warn({ err, msg: `directory ${what} failed` })
  if (err instanceof NotFound) return fail(404, 'That account no longer exists.')
  if (err instanceof Forbidden) return deny(403, 'You cannot make that change.')
  const message = err instanceof Error ? err.message.trim() : ''
  const readable = message.length > 0 && message.length <= 160 && !message.includes('\n')
  return fail(400, readable ? message : 'That change could not be saved.')
}

export async function PATCH(request: Request): Promise<Response> {
  const g = await gate()
  if ('err' in g) return g.err
  const { v } = g

  const parsed = await readId(request)
  if (!parsed) return fail(400, 'Missing account id.')
  const { id, body } = parsed
  const isSelf = String(v.actor.id) === id

  const data: { roles?: Role[]; apps?: User['apps']; emulationBlocked?: boolean } = {}

  if (body.roles !== undefined) {
    if (isSelf) return deny(403, 'You cannot change your own roles.')
    if (!Array.isArray(body.roles)) return fail(400, 'Roles must be a list.')
    const supplied: unknown[] = body.roles
    if (supplied.length === 0) return fail(400, 'Pick at least one role.')
    const roles = supplied.filter((r): r is Role => typeof r === 'string' && ROLES.has(r))
    if (roles.length !== supplied.length) return fail(400, 'Unknown role.')
    data.roles = roles
  }

  if (body.apps !== undefined) {
    if (!Array.isArray(body.apps)) return fail(400, 'Apps must be a list.')
    const supplied: unknown[] = body.apps
    const apps = supplied.filter((a): a is string => typeof a === 'string' && isMembershipApp(a))
    if (apps.length !== supplied.length) return fail(400, 'Unknown app.')
    data.apps = withApps([], apps) as User['apps']
  }

  if (body.emulationBlocked !== undefined) {
    if (typeof body.emulationBlocked !== 'boolean') return fail(400, 'Bad request.')
    data.emulationBlocked = body.emulationBlocked
  }

  if (Object.keys(data).length === 0) return fail(400, 'Nothing to update.')

  try {
    const updated = await v.payload.update({
      collection: 'users',
      id,
      data,
      depth: 0,
      overrideAccess: false,
      user: v.actor,
    })
    return Response.json({ ok: true, user: toDirectoryUser(updated) })
  } catch (err) {
    return explain(err, v, 'update')
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const g = await gate()
  if ('err' in g) return g.err
  const { v } = g

  const parsed = await readId(request)
  if (!parsed) return fail(400, 'Missing account id.')
  if (String(v.actor.id) === parsed.id) return deny(403, 'You cannot delete your own account.')

  try {
    await v.payload.delete({
      collection: 'users',
      id: parsed.id,
      depth: 0,
      overrideAccess: false,
      user: v.actor,
    })
    return Response.json({ ok: true })
  } catch (err) {
    return explain(err, v, 'delete')
  }
}
