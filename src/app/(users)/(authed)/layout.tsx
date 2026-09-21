// The auth gate for the Users app. The registry entry limits it to admin/dev
// (requireApp redirects everyone else to the hub); the route handler behind
// it (/api/directory) re-checks the role on every write.

import React from 'react'

import AppShell from '@/components/shell/AppShell'
import { requireApp } from '@/lib/apps/guard'

export default async function UsersAuthedLayout({ children }: { children: React.ReactNode }) {
  const v = await requireApp('users')
  return (
    <AppShell appId="users" viewer={v}>
      {children}
    </AppShell>
  )
}
