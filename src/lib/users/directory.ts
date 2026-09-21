// The ADMIN directory projection — what the Users app (/users, admin/dev only)
// shows about every account. Explicit fields, never a spread: the raw user
// document also carries hash/salt/sessions/loginAttempts/reset tokens, and
// those stay on the server. Because this is for administrators it includes
// the email and the view-as block flag, which the public ProfileView in
// profile.ts deliberately never exposes — do not reuse it for anything a
// regular user can reach.

import type { Payload } from 'payload'

import type { Role } from '@/access/roles'
import { userApps } from '@/lib/apps/registry'
import type { User } from '@/payload-types'

export interface DirectoryUser {
  id: string
  name: string
  username: string
  email: string
  roles: Role[]
  /** Membership-managed app ids this person may open (admins/devs open every app regardless). */
  apps: string[]
  createdAt: string
  /** "Prevent dev view-as from emulating this account." */
  emulationBlocked: boolean
}

export function toDirectoryUser(u: User): DirectoryUser {
  const username = typeof u.username === 'string' ? u.username : ''
  return {
    id: String(u.id),
    name: (typeof u.name === 'string' && u.name.trim()) || username || u.email,
    username,
    email: u.email,
    roles: Array.isArray(u.roles) ? (u.roles.filter(Boolean) as Role[]) : [],
    apps: userApps(u),
    createdAt: typeof u.createdAt === 'string' ? u.createdAt : '',
    emulationBlocked: Boolean(u.emulationBlocked),
  }
}

/** Every account, by name. Caller has already proven the viewer is admin/dev. */
export async function listDirectory(payload: Payload): Promise<DirectoryUser[]> {
  const res = await payload.find({
    collection: 'users',
    limit: 0,
    pagination: false,
    depth: 0,
    sort: 'name',
    overrideAccess: true,
  })
  return res.docs.map(toDirectoryUser)
}
