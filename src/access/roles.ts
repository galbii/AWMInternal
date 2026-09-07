// Role helpers for the Offer Manager dashboard.
//
// Roles live on the `users` collection as a hasMany select. `admin` and `dev`
// carry IDENTICAL permissions (including "view as" emulation and user
// management — see src/lib/auth/viewer.ts); the two names exist so humans can
// tell operators from developers in the user list.

import type { Access, FieldAccess } from 'payload'

import type { User } from '@/payload-types'

export type Role = 'dev' | 'admin' | 'user'

/** True when the user carries at least one of the given roles. */
export const hasRole = (user: unknown, ...roles: Role[]): boolean => {
  const u = user as { roles?: unknown } | null | undefined
  if (!u || !Array.isArray(u.roles)) return false
  return u.roles.some((r) => roles.includes(r as Role))
}

export const adminOrDev: Access<User> = ({ req: { user } }) => hasRole(user, 'admin', 'dev')

export const adminOrDevFieldAccess: FieldAccess = ({ req: { user } }) =>
  hasRole(user, 'admin', 'dev')

/** Admins/devs see everyone; everyone else only themselves (a Where constraint). */
export const selfOrAdminOrDev: Access<User> = ({ req: { user } }) => {
  if (!user) return false
  if (hasRole(user, 'admin', 'dev')) return true
  return { id: { equals: user.id } }
}
