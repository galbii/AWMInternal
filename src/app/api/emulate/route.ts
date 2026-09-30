// Admin/dev "view as": sets/clears the httpOnly emulation cookie. The cookie
// only NAMES a user id and a mode — src/lib/auth/viewer.ts re-verifies the
// actor's role AND the target's on every request, so a forged or stale cookie
// on an unprivileged account does nothing, and a cookie minted while the target
// was a plain user stops granting writes the moment they are promoted.
//
// TWO MODES (2026-09-29):
//   view  read-only, the original contract. One hour.
//   act   writes permitted and executed AS THE TARGET. Fifteen minutes, never
//         for an admin or developer, and every switch lands in
//         `emulation-events` — a write-capable session that left no trace would
//         be the one thing worse than no session at all.

import { cookies } from 'next/headers'

import { hasRole } from '@/access/roles'
import {
  ACT_COOKIE_MAX_AGE,
  EMULATE_COOKIE,
  VIEW_COOKIE_MAX_AGE,
  decodeEmulation,
  deny,
  encodeEmulation,
  getViewer,
  mayActAs,
  type EmulationMode,
} from '@/lib/auth/viewer'
import type { User } from '@/payload-types'

export const dynamic = 'force-dynamic'

const label = (u: Pick<User, 'name' | 'email'> | null): string =>
  u ? u.name || u.email || 'someone' : 'someone'

export async function POST(request: Request): Promise<Response> {
  const v = await getViewer()
  if (!v) return deny(401)
  if (!hasRole(v.actor, 'admin', 'dev')) return deny(403)

  let userId: string | null = null
  let mode: EmulationMode = 'view'
  try {
    const body = (await request.json()) as { userId?: unknown; mode?: unknown }
    userId = typeof body.userId === 'string' && body.userId ? body.userId : null
    mode = body.mode === 'act' ? 'act' : 'view'
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  const jar = await cookies()

  // Best-effort audit: it must never be the reason a session cannot be left.
  const audit = async (
    action: 'start' | 'mode' | 'stop',
    target: User | null,
    m: EmulationMode | null,
    summary: string,
  ): Promise<void> => {
    try {
      await v.payload.create({
        collection: 'emulation-events',
        data: {
          actor: String(v.actor.id),
          target: target ? String(target.id) : null,
          action,
          mode: m,
          summary,
        },
        overrideAccess: true,
      })
    } catch (err) {
      v.payload.logger.warn({ err, msg: 'emulate: audit write failed' })
    }
  }

  if (!userId) {
    const prev = decodeEmulation(jar.get(EMULATE_COOKIE)?.value)
    jar.delete(EMULATE_COOKIE)
    if (prev) {
      await audit('stop', null, prev.mode, label(v.actor) + ' stopped viewing as another user')
    }
    return Response.json({ ok: true })
  }

  const target = await v.payload
    .findByID({ collection: 'users', id: userId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!target) return new Response('No such user', { status: 404 })
  if (target.emulationBlocked) return deny(403, 'Emulation is blocked for this account.')

  // Strictly downward. Acting as a peer would make "act as" a laundering route
  // for exactly the privilege changes that stay blocked in every mode.
  if (mode === 'act' && !mayActAs(target)) {
    return deny(403, 'You cannot act as an administrator or developer — view only.')
  }

  const prev = decodeEmulation(jar.get(EMULATE_COOKIE)?.value)
  jar.set(EMULATE_COOKIE, encodeEmulation(userId, mode), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: new URL(request.url).protocol === 'https:',
    maxAge: mode === 'act' ? ACT_COOKIE_MAX_AGE : VIEW_COOKIE_MAX_AGE,
  })

  const same = prev && prev.userId === userId
  await audit(
    same ? 'mode' : 'start',
    target,
    mode,
    label(v.actor) +
      (mode === 'act' ? ' started ACTING as ' : ' started viewing as ') +
      label(target),
  )

  return Response.json({ ok: true, mode })
}
