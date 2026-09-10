// ROOT layout for the Kern Org Manager. Its own <html>/<body> is what keeps
// this app's global CSS from reaching any other app — see CLAUDE.md, "Adding an
// app to the hub". Crossing between apps is a full page load, by design.

import type { Metadata } from 'next'
import React from 'react'

import '../shell.css'
import './kern.css'

export const metadata: Metadata = {
  title: 'Kern Org Manager',
  robots: { index: false, follow: false },
}

export default function KernLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
