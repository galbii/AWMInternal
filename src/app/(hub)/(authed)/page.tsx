// THE HUB — served at "/". Lists every app the signed-in user may open,
// grouped as the registry declares, filtered by role. This page owns no
// business logic of its own: it is a thin render of src/lib/apps/registry.ts.
//
// Rendered as an INDEX (one full-width row per app) rather than a card grid,
// so it reads as a deliberate list at any registry size. See hub.css.

import Image from 'next/image'
import Link from 'next/link'
import React from 'react'

import { appsByGroup, appsFor } from '@/lib/apps/registry'
import { requireSession } from '@/lib/apps/guard'

export const dynamic = 'force-dynamic'

export default async function HubPage() {
  const v = await requireSession('/')
  const apps = appsFor(v.actor)
  const groups = appsByGroup(apps)
  const displayName = v.actor.name || v.actor.email

  // One continuous counter across every row on the page (NOT reset per group)
  // so the rules draw in as a single pass down the index. Consumed by
  // .hub-row::after's animation-delay via the `--r` custom property.
  let rowIndex = -1

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
        <p className="hub-hello">Welcome back, {displayName}</p>
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
        groups.map((g) => (
          <section className="hub-set" key={g.group}>
            <h2 className="hub-set-name">{g.group}</h2>
            <ul className="hub-list">
              {g.apps.map((app) => {
                const isPlanned = app.status === 'planned'
                rowIndex += 1
                const rowStyle = { '--r': rowIndex } as React.CSSProperties

                const row = (
                  <>
                    <span className="hub-row-icon" aria-hidden="true">
                      {app.icon}
                    </span>
                    <span className="hub-row-main">
                      <span className="hub-row-name">
                        {app.name}
                        {app.status === 'beta' && <span className="hub-tag">Beta</span>}
                      </span>
                      <span className="hub-row-desc">{app.description}</span>
                    </span>
                    <span className="hub-row-go">
                      {isPlanned ? 'Coming soon' : 'Open'}
                    </span>
                  </>
                )

                return (
                  <li key={app.id}>
                    {isPlanned ? (
                      <div className="hub-row hub-row-off" style={rowStyle} aria-disabled="true">
                        {row}
                      </div>
                    ) : (
                      <Link className="hub-row" href={app.href} style={rowStyle}>
                        {row}
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
