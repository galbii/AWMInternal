// Profile projection — the ONLY shape a user document is ever allowed to leave
// the server in for /u/<username>.
//
// WHY THIS EXISTS: `users.read` is `selfOrAdminOrDev`, so a normal user cannot
// read a colleague's document at all. The directory profile needs a *narrow*
// slice of other people's records without loosening that rule, so these
// functions read with `overrideAccess: true` and then hand back an explicitly
// built object.
//
// RULES FOR EDITING THIS FILE:
//  - NEVER spread the Payload doc (`...user`). Every returned field is listed
//    by hand, so a field added to the collection later is private by default.
//  - `hash`, `salt`, `sessions`, `loginAttempts`, `lockUntil`, `resetPasswordToken`
//    and `emulationBlocked` must never appear in a projection.
//  - `email` is not public: it is included only for the owner and admins/devs.

import type { Payload } from 'payload'

import { hasRole, type Role } from '@/access/roles'
import type { User } from '@/payload-types'

/** What ANY signed-in user may see about ANY other user. */
export interface PublicProfile {
  id: string
  username: string
  /** Falls back to the username so the UI never renders an empty heading. */
  name: string
  roles: Role[]
  createdAt: string
}

/** A profile plus what the current viewer is allowed to do with it. */
export interface ProfileView extends PublicProfile {
  /** Owner and admin/dev only — absent for everyone else. */
  email?: string
  isSelf: boolean
  /** Owner or admin/dev, and never while emulating. */
  canEdit: boolean
  /** Admin/dev only. Nobody can change their own roles. */
  canEditRoles: boolean
  /**
   * Passkeys are self-service ONLY. An admin editing someone else's profile
   * must not be able to enrol a credential on that account — that would be a
   * permanent backdoor rather than an administrative action.
   */
  canManagePasskeys: boolean
}

const rolesOf = (u: Pick<User, 'roles'>): Role[] =>
  Array.isArray(u.roles) ? (u.roles.filter(Boolean) as Role[]) : []

function toPublicProfile(u: User): PublicProfile {
  const username = typeof u.username === 'string' ? u.username : ''
  return {
    id: String(u.id),
    username,
    name: (typeof u.name === 'string' && u.name.trim()) || username,
    roles: rolesOf(u),
    createdAt: typeof u.createdAt === 'string' ? u.createdAt : new Date().toISOString(),
  }
}

/** Look a user up by handle. `me` resolves to the viewer's own record. */
export async function findUserByHandle(
  payload: Payload,
  handle: string,
  selfId: string,
): Promise<User | null> {
  if (handle === 'me') {
    return payload
      .findByID({ collection: 'users', id: selfId, depth: 0, overrideAccess: true })
      .catch(() => null)
  }

  const byUsername = await payload.find({
    collection: 'users',
    where: { username: { equals: handle.toLowerCase() } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (byUsername.docs[0]) return byUsername.docs[0]

  // Fallback for accounts created before usernames existed, so their profile
  // links keep working until the backfill runs.
  return payload
    .findByID({ collection: 'users', id: handle, depth: 0, overrideAccess: true })
    .catch(() => null)
}

/**
 * Build the view a specific viewer gets of a specific profile.
 *
 * `isEmulating` collapses every edit permission: view-as is READ-ONLY across
 * the whole app, and a profile page is no exception.
 */
export function toProfileView(
  target: User,
  actor: User,
  isEmulating: boolean,
): ProfileView {
  const base = toPublicProfile(target)
  const isSelf = String(target.id) === String(actor.id)
  const isAdmin = hasRole(actor, 'admin', 'dev')
  const privileged = isSelf || isAdmin

  return {
    ...base,
    ...(privileged && typeof target.email === 'string' ? { email: target.email } : {}),
    isSelf,
    canEdit: privileged && !isEmulating,
    canEditRoles: isAdmin && !isSelf && !isEmulating,
    canManagePasskeys: isSelf && !isEmulating,
  }
}
