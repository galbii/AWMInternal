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
  /*
   * VIEWER, not actor — both of these are what the person on screen is meant
   * to SEE, and seeing what the target user sees is the entire point of
   * "view as". Reading them off `actor` meant the hub rendered identically
   * while emulating: the admin's own name in the greeting and the admin's own
   * shelf of cards, under a session bar that said "Viewing as <someone else>".
   * That contradiction was the bug — the page did update, it just had nothing
   * emulation-dependent on it to change.
   *
   * `viewer.ts` draws the line: `actor` is for audit attribution, `viewer` is
   * the identity reads are evaluated against. A greeting and a card shelf are
   * reads, and AppShell already follows this for `viewerLabel`.
   *
   * Note this deliberately does NOT match AppShell's app switcher, which
   * stays on `actor` because it has to mirror `requireApp`'s actor-based gate
   * — an admin emulating a plain user keeps access to the app so view-as
   * stays usable for debugging. So the shelf can show fewer cards than the
   * switcher while emulating, which is correct: the shelf answers "what does
   * THIS user have?", the switcher answers "where may I still go?". Exiting
   * view-as is always available in the session bar either way.
   */
  const apps = appsFor(v.viewer)
  const displayName = v.viewer.name || v.viewer.email

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
