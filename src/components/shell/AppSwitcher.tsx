'use client'

// The one interactive piece of the app switcher: a <select> that navigates to
// another app's href on change. Split out from AppShell so AppShell itself can
// stay an async server component — this is the only client-side sliver.

import { useRouter } from 'next/navigation'
import React from 'react'

export interface AppSwitcherOption {
  id: string
  name: string
  href: string
}

interface AppSwitcherProps {
  apps: AppSwitcherOption[]
  /** Registry id of the app currently being viewed, if any. */
  currentAppId?: string
}

export default function AppSwitcher({ apps, currentAppId }: AppSwitcherProps): React.JSX.Element {
  const router = useRouter()

  return (
    <select
      className="as-select"
      aria-label="Switch app"
      defaultValue={currentAppId && apps.some((a) => a.id === currentAppId) ? currentAppId : ''}
      onChange={(e) => {
        const href = apps.find((a) => a.id === e.target.value)?.href
        if (href) router.push(href)
      }}
    >
      <option value="" disabled>
        Switch app…
      </option>
      {apps.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  )
}
