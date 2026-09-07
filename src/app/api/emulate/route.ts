// Admin/dev "view as": sets/clears the httpOnly emulation cookie. The cookie
// only NAMES a user id — src/lib/auth/viewer.ts re-verifies the role on every
// request, so a forged or stale cookie on an unprivileged account does nothing.

import { cookies } from 'next/headers'

import { hasRole } from '@/access/roles'
import { deny, EMULATE_COOKIE, getViewer } from '@/lib/auth/viewer'

export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const v = await getViewer()
  if (!v) return deny(401)
  if (!hasRole(v.actor, 'admin', 'dev')) return deny(403)

  let userId: string | null = null
  try {
    const body = (await request.json()) as { userId?: unknown }
    userId = typeof body.userId === 'string' && body.userId ? body.userId : null
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  const jar = await cookies()
  if (!userId) {
    jar.delete(EMULATE_COOKIE)
  } else {
    const target = await v.payload
      .findByID({ collection: 'users', id: userId, depth: 0, overrideAccess: true })
      .catch(() => null)
    if (!target) return new Response('No such user', { status: 404 })
    if (target.emulationBlocked) return deny(403, 'Emulation is blocked for this account.')
    jar.set(EMULATE_COOKIE, userId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: new URL(request.url).protocol === 'https:',
      maxAge: 60 * 60, // view-as auto-expires after an hour
    })
  }
  return Response.json({ ok: true })
}
