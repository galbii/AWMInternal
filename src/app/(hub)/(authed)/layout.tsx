// The auth gate for the hub itself (served at "/"). No appId is passed to
// AppShell here — the hub is not one of the registry's apps, it's the
// launcher that lists them.

import React from 'react'

import AppShell from '@/components/shell/AppShell'
import { requireSession } from '@/lib/apps/guard'

export default async function HubAuthedLayout({ children }: { children: React.ReactNode }) {
  const v = await requireSession('/')
  return <AppShell viewer={v}>{children}</AppShell>
}
