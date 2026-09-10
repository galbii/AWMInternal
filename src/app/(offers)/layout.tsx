import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import React from 'react'

import { parseTheme, THEME_COOKIE, themeDomAttr } from '@/lib/theme'

import '../shell.css'
import './offers.css'
import './letter.css'

export const metadata: Metadata = {
  title: 'Offer & New Hire Request Manager',
  robots: { index: false, follow: false },
}

export default async function OffersLayout({ children }: { children: React.ReactNode }) {
  // Theme covers the SHARED CHROME only (session bar, modals). The offers
  // content itself is parity-frozen light CSS and ignores the attribute.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)
  return (
    <html lang="en" data-theme={themeDomAttr(theme)}>
      <body>{children}</body>
    </html>
  )
}
