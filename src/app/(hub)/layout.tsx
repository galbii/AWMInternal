import type { Metadata } from 'next'
import { Public_Sans } from 'next/font/google'
import React from 'react'

import '../shell.css'
import './hub.css'

// Public Sans — a humanist sans drawn for US government services. Chosen for a
// regulated-lending tool: institutional without being cold, and it sits under
// the logo's classical serif letterforms without competing with them. Loaded
// through next/font so it is self-hosted (no external request, no layout shift)
// and scoped to this route group; the offers app keeps its verbatim port CSS.
const publicSans = Public_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-awm',
})

export const metadata: Metadata = {
  title: 'AWM Internal',
  robots: { index: false, follow: false },
}

export default function HubLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={publicSans.variable}>
      <body className={publicSans.className}>{children}</body>
    </html>
  )
}
