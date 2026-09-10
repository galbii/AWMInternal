// THE HUB — served at "/". Lists every app the signed-in user may open,
// filtered by role. This page owns no business logic of its own: it is a
// thin render of src/lib/apps/registry.ts.
//
// Rendered as a SHOWCASE: one shelf of uniform 3D cards (HubShowcase, a
// client component — the tilt tracks the pointer). See hub.css.

import Image from 'next/image'
import React from 'react'

import { appsFor } from '@/lib/apps/registry'
import { requireSession } from '@/lib/apps/guard'

import HubShowcase from './HubShowcase'

export const dynamic = 'force-dynamic'

export default async function HubPage() {
  const v = await requireSession('/')
  const apps = appsFor(v.actor)
  const displayName = v.actor.name || v.actor.email

  return (
    <div className="hub">
      <header className="hub-top">
        <Image
          className="hub-mark"
          src="/brand/awm-logo.png"
          alt="All Western Mortgage"
          width={200}
          height={200}
          priority
        />
        <h1 className="hub-hello">Welcome back, {displayName}</h1>
        <p className="hub-sub">Choose a tool to get started.</p>
      </header>

      {apps.length === 0 ? (
        <div className="hub-empty">
          <h2>Nothing here yet</h2>
          <p>
            Your account doesn&apos;t have access to any tools. Ask an administrator to add
            you.
          </p>
        </div>
      ) : (
        <HubShowcase apps={apps} />
      )}
    </div>
  )
}
