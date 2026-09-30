// The auth gate for the New Hire Requests app. Rendering is gated here for UX;
// the real security boundary is Payload access control behind every route
// handler (each calls getViewer() itself — a layout is not a boundary).

import React from 'react'

import AppShell from '@/components/shell/AppShell'
import { requireApp } from '@/lib/apps/guard'

export default async function HiringAuthedLayout({ children }: { children: React.ReactNode }) {
  const v = await requireApp('hiring')
  return (
    <AppShell appId="hiring" viewer={v}>
      {children}
    </AppShell>
  )
}
