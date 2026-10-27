// THE HUB — served at "/". Lists every app the signed-in user may open,
// filtered by role. This page owns no business logic of its own: it is a
// thin render of src/lib/apps/registry.ts.
//
// 2026-10: minimal glass on brand blue — a grid of frosted cards over the
// sign-in swoosh, redrawn as lines that flow on a loop. A server component:
// nothing here needs the browser. Getting between apps is the dock's job
// (SessionBar), so this page is only the cards. See hub.css.

import Image from 'next/image'
import Link from 'next/link'
import React from 'react'

import AppIcon from '@/components/shell/AppIcon'
import { appsFor, type AppDef } from '@/lib/apps/registry'
import { requireSession } from '@/lib/apps/guard'

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
   * Note this deliberately does NOT match the dock's quick links (AppShell),
   * which stay on `actor` because it has to mirror `requireApp`'s actor-based gate
   * — an admin emulating a plain user keeps access to the app so view-as
   * stays usable for debugging. So the hub can show fewer cards than the
   * dock while emulating, which is correct: the hub answers "what does THIS
   * user have?", the dock answers "where may I still go?". Exiting view-as is
   * always available in the dock either way.
   */
  const apps = appsFor(v.viewer)
  const displayName = v.viewer.name || v.viewer.email

  return (
    <div className="hub">
      <HubLines />
      <div className="hub-inner">
        <header className="hub-top">
          <Image
            className="hub-mark"
            src="/brand/awm-logo.png"
            alt="All Western Mortgage"
            width={128}
            height={128}
            priority
          />
          <h1 className="hub-hello">Welcome back, {displayName}</h1>
          <p className="hub-sub">Choose a tool to get started.</p>
        </header>

        {apps.length === 0 ? (
          <div className="hub-empty">
            <h2>Nothing here yet</h2>
            <p>
              Your account doesn&apos;t have access to any tools. Ask an administrator to add you.
            </p>
          </div>
        ) : (
          <ul className="hub-grid">
            {apps.map((app, i) => (
              // --r staggers the entrance, one card after another.
              <li key={app.id} style={{ '--r': i } as React.CSSProperties}>
                <HubCard app={app} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function HubCard({ app }: { app: AppDef }): React.JSX.Element {
  const body = (
    <>
      <span className="hub-card-icon">
        <AppIcon name={app.icon} size={19} />
      </span>
      <span className="hub-card-name">
        {app.name}
        {app.status === 'beta' && <span className="hub-tag">Beta</span>}
        {app.status === 'planned' && <span className="hub-tag">Soon</span>}
      </span>
      <span className="hub-card-desc">{app.description}</span>
    </>
  )
  if (app.status === 'planned') {
    return (
      <div className="hub-card hub-card-off" aria-disabled="true">
        {body}
      </div>
    )
  }
  // Crossing into another route group is a full navigation, by design.
  return (
    <Link className="hub-card" href={app.href}>
      {body}
    </Link>
  )
}

/** The sign-in swoosh (LoginForm), three strands, flowing. Decorative. */
function HubLines(): React.JSX.Element {
  return (
    <svg className="hub-lines" viewBox="0 0 720 240" preserveAspectRatio="none" aria-hidden="true">
      <path className="hub-line hub-line-c" pathLength="1" d="M0,140 C220,70 460,20 720,44" />
      <path className="hub-line hub-line-a" pathLength="1" d="M0,170 C230,96 470,44 720,72" />
      <path className="hub-line hub-line-b" pathLength="1" d="M0,196 C240,126 480,78 720,104" />
    </svg>
  )
}
