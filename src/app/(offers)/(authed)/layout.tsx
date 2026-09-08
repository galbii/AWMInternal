// The auth gate for the Offer Manager app. Rendering is gated here for UX; the
// real security boundary is Payload access control behind every route handler
// (each one calls getViewer() independently — a layout is not a boundary).

import React from 'react'

import AppShell from '@/components/shell/AppShell'
import { requireApp } from '@/lib/apps/guard'

export default async function OffersAuthedLayout({ children }: { children: React.ReactNode }) {
  const v = await requireApp('offers')
  return (
    <AppShell appId="offers" viewer={v}>
      {children}
    </AppShell>
  )
}
