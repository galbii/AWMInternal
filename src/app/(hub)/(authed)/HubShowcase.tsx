'use client'

// The launcher's showcase: one connected slab of uniform TALL cards — flush
// edges, square corners, hairline seams; the hovered card expands over its
// neighbours (hub.css). This is a client component for
// exactly one reason: the sheen highlight follows the pointer, so each card
// needs a mousemove handler that writes CSS custom properties (--gx/--gy).
// Everything visual lives in hub.css; everything the cards SAY comes from the
// registry via props. Reduced-motion users get static cards (the handler
// no-ops and the sheen stays put).

import Link from 'next/link'
import React, { useRef } from 'react'

import type { AppDef } from '@/lib/apps/registry'

export default function HubShowcase({ apps }: { apps: AppDef[] }): React.JSX.Element {
  // Lazily read once — matchMedia is unavailable during SSR.
  const reducedRef = useRef<boolean | null>(null)
  const reducedMotion = (): boolean => {
    if (reducedRef.current === null) {
      reducedRef.current =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
    }
    return reducedRef.current
  }

  const sheen = (e: React.MouseEvent<HTMLElement>): void => {
    if (reducedMotion()) return
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    el.style.setProperty('--gx', `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`)
    el.style.setProperty('--gy', `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`)
  }

  return (
    <ul className="hub-grid">
      {apps.map((app, i) => {
        const isPlanned = app.status === 'planned'
        // Consumed by the <li>'s entrance delay: one wave across the slab.
        const liStyle = { '--r': i } as React.CSSProperties

        const card = (
          <>
            {app.group && <span className="hub-tile-group">{app.group}</span>}
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
          <li key={app.id} style={liStyle}>
            {isPlanned ? (
              <div className="hub-tile hub-tile-off" aria-disabled="true">
                {card}
              </div>
            ) : (
              <Link className="hub-tile" href={app.href} onMouseMove={sheen}>
                {card}
              </Link>
            )}
          </li>
        )
      })}
    </ul>
  )
}
