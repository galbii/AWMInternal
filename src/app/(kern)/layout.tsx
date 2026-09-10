// ROOT layout for the Kern Org Manager. Its own <html>/<body> is what keeps
// this app's global CSS from reaching any other app — see CLAUDE.md, "Adding an
// app to the hub". Crossing between apps is a full page load, by design.

import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import React from 'react'

import { parseTheme, THEME_COOKIE, themeDomAttr } from '@/lib/theme'

import '../shell.css'
import './kern.css'

export const metadata: Metadata = {
  title: 'Kern Org Manager',
  robots: { index: false, follow: false },
}

export default async function KernLayout({ children }: { children: React.ReactNode }) {
  // Theme covers the SHARED CHROME only (session bar, modals) — the app's own
  // styles stay light; see src/lib/theme.ts for the contract.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)
  return (
    <html lang="en" data-theme={themeDomAttr(theme)}>
      <body>{children}</body>
    </html>
  )
}
