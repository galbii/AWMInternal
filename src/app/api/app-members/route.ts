// Per-app membership, managed from inside the app itself (the "Users" view
// each app shows through <AppMembers>).
//
// GET  ?app=<id> -> { app: {id, name}, canManage, members, candidates }
//      Admin/dev only, rejected while emulating — the roster IS user
//      management, so a plain user may not read it even for an app they can
//      open (2026-09-25). The <AppMembers> view is hidden from them too; this
//      is the door behind that.
//      members: everyone who can open the app — people with it on their list,
//      plus admins/developers (flagged `implicit`: they open every app without
//      being listed).
//      candidates: everyone else, for the add picker.
// POST { app, add?: string[], remove?: string[] } -> the same snapshot
//      Admin/dev only, rejected while emulating. Each user's list is rebuilt
//      through `withApps` and written with the ACTOR + overrideAccess:false,
//      so Payload's admin-only field access on `apps` is the second line.
//
// The user documents are read with overrideAccess (users.read is
// selfOrAdminOrDev) and projected by hand — never spread.

import { hasRole } from '@/access/roles'
import { withApps } from '@/lib/apps/membership'
import {
  getApp,
  isAppManager,
  isMembershipApp,
  userApps,
  type AppDef,
} from '@/lib/apps/registry'
import { blockEmulatedWrite, deny, getViewer, type Viewer } from '@/lib/auth/viewer'
import type { User } from '@/payload-types'

export const dynamic = 'force-dynamic'

export interface AppMember {
  id: string
  name: string
  username: string
  /** Always set — only managers reach this route. Optional for older clients. */
  email?: string
  roles: string[]
  /** An admin/developer who is not on the list but opens every app anyway. */
  implicit: boolean
}

export interface AppCandidate {
  id: string
  name: string
  username: string
  email: string
}

const fail = (status: 400 | 404, msg: string): Response => new Response(msg, { status })

const nameOf = (u: User): string =>
  (typeof u.name === 'string' && u.name.trim()) ||
  (typeof u.username === 'string' && u.username) ||
  u.email

function resolveApp(id: string | null): AppDef | null {
  if (!id) return null
  const app = getApp(id)
  return app && isMembershipApp(app.id) ? app : null
}

/** Both callers are managers, so this always carries emails and candidates. */
async function snapshot(
  v: Viewer,
  app: AppDef,
): Promise<{ members: AppMember[]; candidates: AppCandidate[] }> {
  const res = await v.payload.find({
    collection: 'users',
    limit: 0,
    pagination: false,
    depth: 0,
    sort: 'name',
    overrideAccess: true,
  })
  const members: AppMember[] = []
  const candidates: AppCandidate[] = []
  for (const u of res.docs) {
    const listed = userApps(u).includes(app.id)
    const implicit = !listed && isAppManager(u)
    const username = typeof u.username === 'string' ? u.username : ''
    if (listed || implicit) {
      members.push({
        id: String(u.id),
        name: nameOf(u),
        username,
        email: u.email,
        roles: Array.isArray(u.roles) ? u.roles.filter(Boolean) : [],
        implicit,
      })
    } else {
      candidates.push({ id: String(u.id), name: nameOf(u), username, email: u.email })
    }
  }
  return { members, candidates }
}

export async function GET(request: Request): Promise<Response> {
  const v = await getViewer()
  if (!v) return deny(401)
  const app = resolveApp(new URL(request.url).searchParams.get('app'))
  if (!app) return fail(404, 'No such app.')
  // Same gate as POST: reading who else has access is user management, and a
  // manager opens every app anyway, so there is nothing left for canUseApp
  // to decide here.
  const blocked = blockEmulatedWrite(v, 'never')
  if (blocked) return blocked
  if (!hasRole(v.actor, 'admin', 'dev')) return deny(403)

  const snap = await snapshot(v, app)
  return Response.json({ app: { id: app.id, name: app.name }, canManage: true, ...snap })
}

export async function POST(request: Request): Promise<Response> {
  const v = await getViewer()
  if (!v) return deny(401)
  const blocked = blockEmulatedWrite(v, 'never')
  if (blocked) return blocked
  if (!hasRole(v.actor, 'admin', 'dev')) return deny(403)

  let body: { app?: unknown; add?: unknown; remove?: unknown }
  try {
    body = (await request.json()) as { app?: unknown; add?: unknown; remove?: unknown }
  } catch {
    return fail(400, 'Bad request.')
  }
  const app = resolveApp(typeof body.app === 'string' ? body.app : null)
  if (!app) return fail(404, 'No such app.')

  const ids = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []
  const add = ids(body.add)
  const remove = ids(body.remove)
  if (!add.length && !remove.length) return fail(400, 'Nothing to change.')

  try {
    for (const id of new Set([...add, ...remove])) {
      const u = await v.payload.findByID({
        collection: 'users',
        id,
        depth: 0,
        overrideAccess: true,
        disableErrors: true,
      })
      if (!u) return fail(404, 'That account no longer exists.')
      const next = withApps(
        userApps(u),
        add.includes(id) ? [app.id] : [],
        remove.includes(id) ? [app.id] : [],
      )
      if (next.join('\0') === userApps(u).join('\0')) continue
      await v.payload.update({
        collection: 'users',
        id,
        data: { apps: next as User['apps'] },
        depth: 0,
        overrideAccess: false,
        user: v.actor,
      })
    }
  } catch (err) {
    v.payload.logger.warn({ err, msg: `app-members update failed for ${app.id}` })
    return fail(400, 'That change could not be saved.')
  }

  const snap = await snapshot(v, app)
  return Response.json({ app: { id: app.id, name: app.name }, canManage: true, ...snap })
}
