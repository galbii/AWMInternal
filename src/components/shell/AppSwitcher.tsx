'use client'

// The app's name in the session bar IS the switcher: a quiet button that opens
// the list of apps this user may open, the current one marked. With a single
// app there is nothing to switch to, so it renders as plain text. Split out
// from AppShell so AppShell itself can stay an async server component.
//
// Real links, not router.push: crossing between route groups is a full
// navigation by design (each app owns its root layout), and a link keeps
// middle-click / cmd-click working.

import Link from 'next/link'
import React from 'react'

import ShellMenu from './ShellMenu'

export interface AppSwitcherOption {
  id: string
  name: string
  href: string
}

interface AppSwitcherProps {
  apps: AppSwitcherOption[]
  /** Registry id of the app currently being viewed. */
  currentAppId?: string
  /** Its display name — the trigger text. */
  currentName: string
}

export default function AppSwitcher({
  apps,
  currentAppId,
  currentName,
}: AppSwitcherProps): React.JSX.Element {
  if (apps.length < 2) return <span className="as-current">{currentName}</span>

  return (
    <ShellMenu
      triggerClassName="as-app"
      triggerTitle="Switch app"
      panelRole="menu"
      panelLabel="Switch app"
      trigger={<span className="as-app-name">{currentName}</span>}
    >
      {apps.map((a) => (
        <Link
          key={a.id}
          href={a.href}
          className="shm-item"
          role="menuitemradio"
          aria-checked={a.id === currentAppId}
          data-shm-item
        >
          {a.name}
        </Link>
      ))}
    </ShellMenu>
  )
}
