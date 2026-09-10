// THE HUB — served at "/". Lists every app the signed-in user may open,
// grouped as the registry declares, filtered by role. This page owns no
// business logic of its own: it is a thin render of src/lib/apps/registry.ts.
//
// Rendered as a LAUNCHER: a grid of tiles per group. See hub.css.

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

  // One continuous counter across every tile on the page (NOT reset per group)
  // so the entrance runs as a single wave across the launcher. Consumed by
  // .hub-tile's animation-delay via the `--r` custom property.
  let tileIndex = -1

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
        groups.map((g) => (
          <section className="hub-set" key={g.group}>
            <h2 className="hub-set-name">{g.group}</h2>
            <ul className="hub-grid">
              {g.apps.map((app) => {
                const isPlanned = app.status === 'planned'
                tileIndex += 1
                const tileStyle = { '--r': tileIndex } as React.CSSProperties

                const tile = (
                  <>
                    <span className="hub-tile-icon" aria-hidden="true">
                      {app.icon}
                    </span>
                    <span className="hub-tile-name">
                      {app.name}
                      {app.status === 'beta' && <span className="hub-tag">Beta</span>}
                    </span>
                    <span className="hub-tile-desc">{app.description}</span>
                    <span className="hub-tile-open">
                      {isPlanned ? (
                        'Coming soon'
                      ) : (
                        <>
                          Open
                          <svg
                            className="hub-tile-arrow"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            focusable="false"
                          >
                            <path d="M5 12h14M13 6l6 6-6 6" />
                          </svg>
                        </>
                      )}
                    </span>
                  </>
                )

                return (
                  <li key={app.id}>
                    {isPlanned ? (
                      <div
                        className="hub-tile hub-tile-off"
                        style={tileStyle}
                        aria-disabled="true"
                      >
                        {tile}
                      </div>
                    ) : (
                      <Link className="hub-tile" href={app.href} style={tileStyle}>
                        {tile}
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
