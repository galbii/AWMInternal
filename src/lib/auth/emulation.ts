// The EMULATION RULES — pure, and deliberately kept out of viewer.ts.
//
// viewer.ts imports `@payload-config` to resolve a session, which drags in the
// whole CMS (and a required DATABASE_URL) the moment anything touches it. These
// functions decide who may write and whose name goes on the result, so they
// have to be unit-testable on their own. viewer.ts re-exports every one of them
// — callers keep importing from '@/lib/auth/viewer'.

import { hasRole } from '@/access/roles'
import type { User } from '@/payload-types'

export const EMULATE_COOKIE = 'awm-emulate'

/** How long a write-capable session lives, against an hour for a read-only one. */
export const ACT_COOKIE_MAX_AGE = 15 * 60
export const VIEW_COOKIE_MAX_AGE = 60 * 60

export type EmulationMode = 'view' | 'act'

/** `<id>` -> view, `<id>|act` -> act. One cookie, so the two cannot desync. */
export function encodeEmulation(userId: string, mode: EmulationMode): string {
  return mode === 'act' ? userId + '|act' : userId
}

/**
 * Anything that is not exactly `|act` degrades to VIEW — including every
 * cookie minted before act mode existed. The failure direction is read-only.
 */
export function decodeEmulation(raw: string | undefined): {
  userId: string
  mode: EmulationMode
} | null {
  if (!raw) return null
  const [userId, flag] = raw.split('|')
  if (!userId) return null
  return { userId, mode: flag === 'act' ? 'act' : 'view' }
}

/** Acting is strictly downward: never as someone who manages users. */
export function mayActAs(target: User): boolean {
  return !hasRole(target, 'admin', 'dev')
}

/** For route handlers: 401/403 responses instead of redirects. */
export function deny(status: 401 | 403, msg?: string): Response {
  return new Response(msg ?? (status === 401 ? 'Unauthorized' : 'Forbidden'), { status })
}

/* ------------------------------ write guards ------------------------------ */

/** The part of a resolved Viewer these rules actually read. */
export interface EmulationState {
  actor: User
  viewer: User
  isEmulating: boolean
  isActing: boolean
}

const REFUSED_VIEW =
  'Read-only while viewing as another user. Switch to "Act as" to make changes.'
const REFUSED_ALWAYS =
  'This cannot be done while viewing as another user, in any mode. Exit view-as first.'

/**
 * What a write route may do while emulation is on. Two tiers, because not all
 * writes are equal:
 *
 *   'acting-ok'  In-app, auditable, reversible work — offer records, stages,
 *                the HR handoff, assignments. Permitted while ACTING.
 *   'never'      Refused in every emulated mode:
 *                  - privilege and identity (roles, users.apps, the roster,
 *                    the directory, profiles, passwords, passkeys) — a change
 *                    made "as" someone is attribution laundering, and a
 *                    passkey enrolled that way is a permanent backdoor;
 *                  - anything that LEAVES THE BUILDING (offer email, test
 *                    mail) — a letter reaching a candidate cannot be recalled.
 *
 * Returns a Response to send, or null to proceed.
 */
export function blockEmulatedWrite(
  v: EmulationState,
  tier: 'acting-ok' | 'never',
): Response | null {
  if (!v.isEmulating) return null
  if (tier === 'acting-ok' && v.isActing) return null
  return deny(403, tier === 'never' ? REFUSED_ALWAYS : REFUSED_VIEW)
}

/** May this session write at all? False only while VIEWING as someone. */
export function canWrite(v: EmulationState): boolean {
  return !v.isEmulating || v.isActing
}

/**
 * The identity a WRITE runs as.
 *
 * While acting this is the EMULATED user, so their real limits apply — writing
 * as the admin would silently succeed at things the target cannot do, which is
 * worse than refusing. Audit attribution is separate: routes pass the real
 * human in `req.context.actingFor` and the hooks name them both.
 */
export function writeUser(v: EmulationState): User {
  return v.isActing ? v.viewer : v.actor
}

/** `req.context` for a write, so the audit hooks can name the real human. */
export function writeContext(v: EmulationState): { actingFor?: string } {
  return v.isActing ? { actingFor: String(v.actor.id) } : {}
}
