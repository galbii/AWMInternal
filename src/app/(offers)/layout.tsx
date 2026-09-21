import type { Metadata } from 'next'
import { Public_Sans, Source_Serif_4 } from 'next/font/google'
import { cookies } from 'next/headers'
import React from 'react'

import { parseTheme, THEME_COOKIE, themeDomAttr } from '@/lib/theme'

import '../shell.css'
import './offers.css'
import './letter.css'

// Same faces as the (hub) group, so crossing between the hub and this app
// reads as one product. The letter sheet itself keeps its own Calibri stack
// (letter.css) — the document's typography is part of the frozen letter port.
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
  title: 'Offer & New Hire Request Manager',
  robots: { index: false, follow: false },
}

export default async function OffersLayout({ children }: { children: React.ReactNode }) {
  // The app chrome and content follow the theme; the letter sheet stays white
  // paper in both (it is a print document preview, not a surface).
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
