// The shared chrome every app's (authed) layout renders around its own
// content: the dock (SessionBar), pinned to the bottom of the window. An async
// SERVER component so it can run the "view as" users-list query itself
// without an extra client round trip, and hand the dock the apps it links to.
//
// Callers resolve the viewer themselves via requireApp()/requireSession() and
// pass it in; this component makes no auth call of its own.

import React from 'react'

import { hasRole } from '@/access/roles'
import { appsFor, userApps } from '@/lib/apps/registry'
import { mayActAs, type Viewer } from '@/lib/auth/viewer'

import SessionBar, { type SessionUserOption } from './SessionBar'
import { ViewerProvider } from './ViewerProvider'

export interface AppShellProps {
  /** Registry app id, or undefined when rendering the hub itself. */
  appId?: string
  /** Resolved by the caller's requireApp()/requireSession() — no second auth call. */
  viewer: Viewer
  children: React.ReactNode
}

export default async function AppShell({
  appId,
  viewer,
  children,
}: AppShellProps): Promise<React.JSX.Element> {
  const v = viewer

  // Identical to (offers)/(authed)/layout.tsx's users-list query: admin/dev
  // get the "view as" picker, self and emulation-blocked users excluded.
  // `canManage` is the ACTOR's role, so the roster is here while emulating too
  // — that is what lets SessionBar's Switch pill hop straight to the next
  // person. The person being viewed as stays IN the list, marked "now".
  const canManage = hasRole(v.actor, 'admin', 'dev')
  let users: SessionUserOption[] = []
  if (canManage) {
    const res = await v.payload.find({
      collection: 'users',
      limit: 0,
      pagination: false,
      depth: 0,
      sort: 'name',
      overrideAccess: true,
    })
    users = res.docs
      .filter((u) => String(u.id) !== String(v.actor.id) && !u.emulationBlocked)
      .map((u) => ({ id: String(u.id), label: u.name || u.email }))
  }

  // The ACTOR's apps, not the viewer's: the dock has to mirror requireApp's
  // actor-based gate, so an admin viewing as someone can still get anywhere.
  // Planned apps have no routes yet, so they get no link.
  const dockApps = appsFor(v.actor)
    .filter((a) => a.status !== 'planned')
    .map((a) => ({ id: a.id, name: a.name, short: a.short, href: a.href, icon: a.icon }))

  // Always the ACTOR's own profile, never the emulated viewer's: "Settings"
  // must take the real human to their own account. `/u/me` covers an account
  // created before usernames existed and not yet backfilled.
  const profileHref = v.actor.username ? `/u/${v.actor.username}` : '/u/me'

  return (
    <>
      {/* Client components in every app ask this instead of drilling a prop.
          `isManager` drops while emulating, so view-as shows the plain user's
          UI — the same rule SessionBar's adminTools already follows. */}
      <ViewerProvider
        value={{
          id: String(v.actor.id),
          name: v.actor.name || v.actor.email,
          username: typeof v.actor.username === 'string' ? v.actor.username : '',
          roles: Array.isArray(v.actor.roles) ? v.actor.roles.filter(Boolean) : [],
          // From the VIEWER, not the actor: an admin viewing as a hiring
          // manager must see that person's capabilities (offers/official.ts).
          apps: userApps(v.viewer),
          isManager: canManage && !v.isEmulating,
          isEmulating: v.isEmulating,
          isActing: v.isActing,
        }}
      >
        {children}
      </ViewerProvider>
      {/* Holds the dock's height at the end of the page, so the last of an
          app's content can always be scrolled clear of the fixed bar. */}
      <div className="sb-room" aria-hidden="true" />
      <SessionBar
        actorLabel={v.actor.name || v.actor.email}
        actorEmail={v.actor.email}
        viewerLabel={v.viewer.name || v.viewer.email}
        canManage={canManage}
        isEmulating={v.isEmulating}
        isActing={v.isActing}
        canAct={v.isEmulating && mayActAs(v.viewer)}
        viewerId={String(v.viewer.id)}
        users={users}
        profileHref={profileHref}
        apps={dockApps}
        currentAppId={appId}
      />
    </>
  )
}
