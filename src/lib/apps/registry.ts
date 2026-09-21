// THE APP REGISTRY — the single integration point for the internal dashboard.
//
// Adding an app to the hub is two steps:
//   1. Create its route group under src/app/  (see docs in CLAUDE.md)
//   2. Add one entry to APPS below.
//
// Nothing else needs to change. The hub renders from this list, filtered by
// what the viewer may open; `requireApp()` (src/lib/apps/guard.ts) reads the
// same entry to gate the app's own routes.
//
// WHO MAY OPEN AN APP (2026-09 — per-app membership):
//   - An app that lists `roles` is ROLE-GATED: only users carrying one of
//     those roles see and open it (the Users app, admin/dev).
//   - An app that lists NO roles is MEMBERSHIP-MANAGED: a person opens it
//     when its id is in their `users.apps` list — granted inside the app's own
//     "Users" view, in the /users directory, or on their profile — and
//     admins/developers, who manage every app, always can.
//
// IMPORTANT: this is a UX filter — it decides what a user SEES on the hub and
// what requireApp() lets through. It is NOT the security boundary. Every route
// handler must resolve the viewer itself and pass { user, overrideAccess:
// false } to Payload, exactly as /api/offer-records does.

import type { Role } from '@/access/roles'

export type AppStatus = 'live' | 'beta' | 'planned'

export interface AppDef {
  /** Stable slug — used by requireApp(), stored in `users.apps`, and the React key. Never reuse. */
  id: string
  /** Card title on the hub. */
  name: string
  /** A word or two for chips and columns ("Offers"), where `name` is too long. */
  short: string
  /** One line: what the app is for. Shown on the card. */
  description: string
  /** Where the app lives. Its route group must serve this path. */
  href: string
  /** Emoji shown on the card. Keep it one glyph. */
  icon: string
  /**
   * Set this and the app is ROLE-GATED: a user needs at least ONE of the
   * listed roles, and membership cannot grant it. Omit it and the app is
   * MEMBERSHIP-MANAGED (see the header comment).
   */
  roles?: Role[]
  /** `planned` renders as a disabled card; `beta` adds a badge. */
  status: AppStatus
  /** Optional heading the card is grouped under on the hub. */
  group?: string
}

export const APPS: AppDef[] = [
  {
    id: 'offers',
    name: 'Offer & New Hire Manager',
    short: 'Offers',
    description:
      'New-hire requests, generated offer letters, and the hiring pipeline from offer to hired.',
    href: '/offers',
    icon: '📄',
    status: 'live',
    group: 'People',
  },
  {
    id: 'kern',
    name: 'Kern Org Manager',
    short: 'Kern',
    description:
      'Divisions → Regions → Areas → Branches — org structure, branch rosters, and production analytics.',
    href: '/kern',
    icon: '🏢',
    status: 'beta',
    group: 'Operations',
  },
  {
    id: 'users',
    name: 'Users',
    short: 'Users',
    description: 'Accounts, roles and access for everyone who signs in to AWM Internal.',
    href: '/users',
    icon: '👥',
    status: 'live',
    group: 'Administration',
    roles: ['admin', 'dev'],
  },
]

/** The roles that manage users and may open every membership-managed app. */
const MANAGER_ROLES: Role[] = ['admin', 'dev']

const rolesOf = (user: unknown): string[] => {
  const r = (user as { roles?: unknown } | null | undefined)?.roles
  return Array.isArray(r) ? r.filter((x): x is string => typeof x === 'string') : []
}

/** True for admins and developers — the people who manage users and open every app. */
export function isAppManager(user: unknown): boolean {
  return rolesOf(user).some((r) => MANAGER_ROLES.includes(r as Role))
}

/** The app ids on a user's `apps` list, as a clean string array. */
export function userApps(user: unknown): string[] {
  const a = (user as { apps?: unknown } | null | undefined)?.apps
  return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : []
}

/** The apps a person can be GIVEN — every registry entry that lists no roles. */
export function membershipApps(): AppDef[] {
  return APPS.filter((a) => !a.roles || a.roles.length === 0)
}

export function isMembershipApp(id: string): boolean {
  return membershipApps().some((a) => a.id === id)
}

/** Every app the given user may see, in registry order. */
export function appsFor(user: unknown): AppDef[] {
  return APPS.filter((a) => canUseApp(user, a))
}

/**
 * True when `user` may open `app`: one of its roles for a role-gated app;
 * otherwise a manager, or a person with the app on their list.
 */
export function canUseApp(user: unknown, app: AppDef): boolean {
  if (!user) return false
  if (app.roles && app.roles.length > 0) {
    const roles = rolesOf(user)
    return roles.some((r) => app.roles?.includes(r as Role))
  }
  if (isAppManager(user)) return true
  return userApps(user).includes(app.id)
}

export function getApp(id: string): AppDef | undefined {
  return APPS.find((a) => a.id === id)
}

/** Registry entries grouped by `group`, preserving first-seen group order. */
export function appsByGroup(apps: AppDef[]): { group: string; apps: AppDef[] }[] {
  const out: { group: string; apps: AppDef[] }[] = []
  for (const app of apps) {
    const group = app.group || 'Apps'
    const bucket = out.find((g) => g.group === group)
    if (bucket) bucket.apps.push(app)
    else out.push({ group, apps: [app] })
  }
  return out
}
