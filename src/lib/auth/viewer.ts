// Server-side identity resolution for the internal dashboard.
//
// getViewer() is wrapped in React's `cache()`, so it is deduped PER REQUEST:
// an app's (authed) layout, its page, and <AppShell> can each call it (directly
// or via requireApp) without triggering three payload.auth() round-trips. The
// cache lifetime is one server request — it never leaks between users.
//
// `actor` is the real, authenticated human — audit attribution ALWAYS names it.
// `viewer` is the identity every data read is evaluated against; it differs
// from `actor` only while an admin/dev is emulating ("view as") another user,
// via the httpOnly EMULATE_COOKIE. The role is re-checked on EVERY request, so
// a demoted user's stale cookie stops working immediately.
//
// TWO MODES (2026-09-29). The cookie carries `<userId>` to VIEW and
// `<userId>|act` to ACT:
//
//   view  the original contract — every write route refuses. This is what
//         "what does this person see?" needs, and it is the default.
//   act   writes are permitted and run AS THE VIEWER, so the emulated user's
//         real limits apply. Entering it is a deliberate, audited switch.
//
// Why the mode is not just "emulation is read-write now": the offers UI WRITES
// WHILE YOU BROWSE. Opening the Offer Letter tab regenerates and persists
// `letterHtml` (LetterView's regen effect), and the details form autosaves on a
// 600ms debounce. Under `view` those writes are refused and harmless; if every
// emulated session were write-capable, merely INSPECTING someone's record would
// silently rewrite it. `view` staying read-only is what keeps that safe.
//
// ACTING IS STRICTLY DOWNWARD. You may never act as an admin or a developer —
// that would turn "act as" into a laundering route for the privilege changes
// that stay blocked in every mode. A cookie asking for it degrades to `view`.
//
// Emulation runs real access control: Payload's Local API evaluates access
// functions against an arbitrary `user` when `overrideAccess: false` — the
// emulated view is exactly what that user would see logged in.

import config from '@payload-config'
import { cookies, headers as nextHeaders } from 'next/headers'
import { getPayload, type Payload } from 'payload'
import { cache } from 'react'

import { hasRole } from '@/access/roles'
import { EMULATE_COOKIE, decodeEmulation as decode, mayActAs as canAct } from './emulation'
import type { User } from '@/payload-types'

// The pure rules live in ./emulation so they can be unit-tested without the
// CMS config this module pulls in. Re-exported so callers keep one import.
export {
  ACT_COOKIE_MAX_AGE,
  VIEW_COOKIE_MAX_AGE,
  blockEmulatedWrite,
  canWrite,
  decodeEmulation,
  deny,
  encodeEmulation,
  mayActAs,
  writeContext,
  writeUser,
  type EmulationMode,
  type EmulationState,
} from './emulation'
export { EMULATE_COOKIE }

export interface Viewer {
  /** The real, authenticated human. Never emulated. */
  actor: User
  /** The identity data reads run as. === actor unless emulating. */
  viewer: User
  isEmulating: boolean
  /** Emulating AND permitted to write, as the viewer. Implies isEmulating. */
  isActing: boolean
  payload: Payload
}

export const getViewer = cache(async function getViewer(): Promise<Viewer | null> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await nextHeaders() })
  if (!user) return null
  const actor = user as User

  let viewer: User = actor
  let isEmulating = false
  let isActing = false

  const parsed = decode((await cookies()).get(EMULATE_COOKIE)?.value)
  if (parsed && parsed.userId !== String(actor.id) && hasRole(actor, 'admin', 'dev')) {
    const target = await payload
      .findByID({ collection: 'users', id: parsed.userId, depth: 0, overrideAccess: true })
      .catch(() => null)
    if (target && !target.emulationBlocked) {
      viewer = { ...target, collection: 'users' }
      isEmulating = true
      // Re-checked here, not just at the door: a cookie minted while the target
      // was a plain user must stop granting writes the moment they are promoted.
      isActing = parsed.mode === 'act' && canAct(viewer)
    }
  }

  return { actor, viewer, isEmulating, isActing, payload }
})
