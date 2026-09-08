// THE APP REGISTRY — the single integration point for the internal dashboard.
//
// Adding an app to the hub is two steps:
//   1. Create its route group under src/app/  (see docs in CLAUDE.md)
//   2. Add one entry to APPS below.
//
// Nothing else needs to change. The hub renders from this list, filtered by the
// viewer's roles; `requireApp()` (src/lib/apps/guard.ts) reads the same entry to
// gate the app's own routes.
//
// IMPORTANT: the `roles` field here is a UX filter — it decides what a user SEES
// on the hub. It is NOT the security boundary. Every app must still gate its own
// routes (requireApp) and every route handler must resolve the viewer itself,
// exactly as /api/offer-records does.

import type { Role } from '@/access/roles'

export type AppStatus = 'live' | 'beta' | 'planned'

export interface AppDef {
  /** Stable slug — used by requireApp() and as the React key. Never reuse. */
  id: string
  /** Card title on the hub. */
  name: string
  /** One line: what the app is for. Shown on the card. */
  description: string
  /** Where the app lives. Its route group must serve this path. */
  href: string
  /** Emoji shown on the card. Keep it one glyph. */
  icon: string
  /**
   * Roles that may see + open the app. Omit for "any authenticated user".
   * A user needs at least ONE of the listed roles.
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
    description:
      'New-hire requests, generated offer letters, and the hiring pipeline from offer to hired.',
    href: '/offers',
    icon: '📄',
    status: 'live',
    group: 'People',
  },
]

/** Every app the given user may see, in registry order. */
export function appsFor(user: unknown): AppDef[] {
  return APPS.filter((a) => canUseApp(user, a))
}

/** True when `user` carries at least one of the app's roles (or it lists none). */
export function canUseApp(user: unknown, app: AppDef): boolean {
  if (!user) return false
  if (!app.roles || app.roles.length === 0) return true
  const roles = (user as { roles?: unknown }).roles
  if (!Array.isArray(roles)) return false
  return roles.some((r) => app.roles?.includes(r as Role))
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
