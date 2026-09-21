import type { Metadata } from 'next'
import { Public_Sans, Source_Serif_4 } from 'next/font/google'
import { cookies } from 'next/headers'
import React from 'react'

import { parseTheme, THEME_COOKIE, themeDomAttr } from '@/lib/theme'

import '../shell.css'
// The hub sheet supplies the --awm-* tokens, the page ground and the role
// chips this app reuses; users.css adds only its own .us-* rules.
import '../(hub)/hub.css'
import './users.css'

// Same faces as the hub and the offers app, so every app reads as one product.
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
  title: 'Users',
  robots: { index: false, follow: false },
}

export default async function UsersLayout({ children }: { children: React.ReactNode }) {
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
