// The shared chrome every app's (authed) layout renders around its own
// content: the app switcher + session bar. An async SERVER component so it
// can run the "view as" users-list query itself (mirrors what
// (offers)/(authed)/layout.tsx did before the multi-app split) without an
// extra client round trip. The only interactive piece — the "switch app"
// <select> — is split into the sibling client component AppSwitcher.tsx.
//
// Callers resolve the viewer themselves via requireApp()/requireSession() and
// pass it in; this component makes no auth call of its own.

import Link from 'next/link'
import React from 'react'

import { hasRole } from '@/access/roles'
import { appsFor, getApp } from '@/lib/apps/registry'
import type { Viewer } from '@/lib/auth/viewer'

import AppSwitcher from './AppSwitcher'
import SessionBar, { type SessionUserOption } from './SessionBar'

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
  // get the "view as" dropdown, self and emulation-blocked users excluded.
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

  const current = appId ? getApp(appId) : undefined
  const available = appsFor(v.actor)

  // Always the ACTOR's own profile, never the emulated viewer's: "Settings"
  // must take the real human to their own account. `/u/me` covers an account
  // created before usernames existed and not yet backfilled.
  const profileHref = v.actor.username ? `/u/${v.actor.username}` : '/u/me'

  return (
    <>
      <SessionBar
        actorLabel={v.actor.name || v.actor.email}
        viewerLabel={v.viewer.name || v.viewer.email}
        canManage={canManage}
        isEmulating={v.isEmulating}
        users={users}
        profileHref={profileHref}
        leading={
          <div className="as-switcher">
            {/* Next forces a hard navigation between route groups with
                different root layouts, so this crosses into (hub) correctly. */}
            <Link className="as-home" href="/">
              ◈ Apps
            </Link>
            {current && <span className="as-current">{current.name}</span>}
            {available.length > 1 && (
              <AppSwitcher
                apps={available.map((a) => ({ id: a.id, name: a.name, href: a.href }))}
                currentAppId={appId}
              />
            )}
          </div>
        }
      />
      {children}
    </>
  )
}
