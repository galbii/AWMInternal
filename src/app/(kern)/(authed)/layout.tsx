// The auth gate for the Kern Org Manager. Rendering is gated here for UX; the
// real security boundary is Payload access control behind every route handler.
// Phase 1 ships no route handler — the org document lives in localStorage.

import React from 'react'

import AppShell from '@/components/shell/AppShell'
import { requireApp } from '@/lib/apps/guard'

export default async function KernAuthedLayout({ children }: { children: React.ReactNode }) {
  const v = await requireApp('kern')
  return (
    <AppShell appId="kern" viewer={v}>
      {children}
    </AppShell>
  )
}
