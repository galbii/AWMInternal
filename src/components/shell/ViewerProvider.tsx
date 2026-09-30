'use client'

// Who is signed in, for CLIENT components in any app.
//
// Server code resolves identity with getViewer()/requireApp(), but a client
// component deep inside an app (the offers sidebar, a Kern tab) has no way to
// ask. <AppShell> — which every app's (authed) layout already renders — puts
// the answer here once, so no page has to drill a prop through its provider.
//
// `isManager` is the ONE question the UI keeps asking: may this person see the
// administrative surface? It is admin/dev AND not emulating, matching
// SessionBar's `adminTools` and /api/app-members' own `canManage`, so a
// "view as" session shows the plain user's UI rather than the admin's.
//
// This is a UX filter, NOT a security boundary — the same rule the registry
// carries. Every route handler still resolves the viewer itself and passes
// { user, overrideAccess: false } to Payload.

import React, { createContext, useContext } from 'react'

export interface ShellViewer {
  /** The real human's id — never the emulated target's. */
  id: string
  name: string
  username: string
  roles: string[]
  /**
   * The VIEWER's membership-managed app ids (`users.apps`) — the emulated
   * user's while viewing as, so an app's own capability checks show the
   * target's restrictions rather than the admin's. Managers open every app
   * without appearing on any list, which is what `isManager` is for.
   */
  apps: string[]
  /** Admin or developer, and NOT viewing as someone else. */
  isManager: boolean
  isEmulating: boolean
  /**
   * Emulating in WRITE mode — actions run as the emulated user and are audited
   * to both identities. Still not a manager: you are in their seat, with their
   * limits. Deny-by-default outside a provider.
   */
  isActing: boolean
}

/**
 * Default-DENY: a tree rendered without the provider (a test harness, a
 * standalone render) sees a plain user, never an administrator.
 */
const ANON: ShellViewer = {
  id: '',
  name: '',
  username: '',
  roles: [],
  apps: [],
  isManager: false,
  isEmulating: false,
  isActing: false,
}

const ViewerContext = createContext<ShellViewer>(ANON)

export function ViewerProvider({
  value,
  children,
}: {
  value: ShellViewer
  children: React.ReactNode
}): React.JSX.Element {
  // No memo: AppShell is a server component, so a new value object only ever
  // arrives with a new `children` tree anyway.
  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>
}

export function useViewer(): ShellViewer {
  return useContext(ViewerContext)
}
