// The New Hire Requests app — the hiring manager's door onto the SAME
// `offer-requests` collection the Offer Letters app (/offers) serves.
//
// It renders the SAME components with the SAME stylesheets on purpose: the two
// apps are one application, and the only difference is what membership lets
// you do inside it (src/lib/offers/official.ts). Nothing here may fork the
// offers UI — a divergence belongs in this route group's composition, never in
// a capability conditional inside a shared component.

import type { Metadata } from 'next'
import { Public_Sans, Source_Serif_4 } from 'next/font/google'
import { cookies } from 'next/headers'
import React from 'react'

import { parseTheme, THEME_COOKIE, themeDomAttr } from '@/lib/theme'

import '../shell.css'
import '../(offers)/offers.css'
import '../(offers)/letter.css'

const publicSans = Public_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-awm',
})

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  weight: ['600'],
  display: 'swap',
  variable: '--font-serif',
})

export const metadata: Metadata = {
  title: 'New Hire Requests',
  robots: { index: false, follow: false },
}

export default async function HiringLayout({ children }: { children: React.ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)
  return (
    <html
      lang="en"
      data-theme={themeDomAttr(theme)}
      className={`${publicSans.variable} ${sourceSerif.variable}`}
    >
      <body className={publicSans.className}>{children}</body>
    </html>
  )
}
