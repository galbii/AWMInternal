// Server-side identity resolution for the Offer Manager dashboard.
//
// `actor` is the real, authenticated human — audit attribution ALWAYS uses it.
// `viewer` is the identity every data read is evaluated against; it differs
// from `actor` only while an admin/dev is emulating ("view as") another user,
// via the httpOnly EMULATE_COOKIE. The role is re-checked on EVERY request, so
// a demoted user's stale cookie stops working immediately, and emulation is
// READ-ONLY: write routes must reject when isEmulating.
//
// Emulation runs real access control: Payload's Local API evaluates access
// functions against an arbitrary `user` when `overrideAccess: false` — the
// emulated view is exactly what that user would see logged in.

import config from '@payload-config'
import { cookies, headers as nextHeaders } from 'next/headers'
import { getPayload, type Payload } from 'payload'

import { hasRole } from '@/access/roles'
import type { User } from '@/payload-types'

export const EMULATE_COOKIE = 'awm-emulate'

export interface Viewer {
  /** The real, authenticated human. Never emulated. */
  actor: User
  /** The identity data reads run as. === actor unless emulating. */
  viewer: User
  isEmulating: boolean
  payload: Payload
}

export async function getViewer(): Promise<Viewer | null> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await nextHeaders() })
  if (!user) return null
  const actor = user as User

  let viewer: User = actor
  let isEmulating = false

  const targetId = (await cookies()).get(EMULATE_COOKIE)?.value
  if (targetId && targetId !== String(actor.id) && hasRole(actor, 'admin', 'dev')) {
    const target = await payload
      .findByID({ collection: 'users', id: targetId, depth: 0, overrideAccess: true })
      .catch(() => null)
    if (target && !target.emulationBlocked) {
      viewer = { ...target, collection: 'users' }
      isEmulating = true
    }
  }

  return { actor, viewer, isEmulating, payload }
}

/** For route handlers: 401/403 responses instead of redirects. */
export function deny(status: 401 | 403, msg?: string): Response {
  return new Response(msg ?? (status === 401 ? 'Unauthorized' : 'Forbidden'), { status })
}
