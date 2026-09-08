// THE HUB — served at "/". Lists every app the signed-in user may open,
// grouped as the registry declares, filtered by role. This page owns no
// business logic of its own: it is a thin render of src/lib/apps/registry.ts.

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

  return (
    <div className="hub-page">
      <header className="hub-masthead">
        <Image
          className="hub-mark"
          src="/brand/awm-logo.png"
          alt="All Western Mortgage"
          width={200}
          height={200}
          priority
        />
        <div className="hub-greeting">
          <h1>Welcome, {displayName}</h1>
          <p className="hub-subtitle">
            {apps.length === 0
              ? 'Internal tools'
              : apps.length === 1
                ? 'You have one app available.'
                : `You have ${apps.length} apps available.`}
          </p>
        </div>
      </header>

      {apps.length === 0 ? (
        <div className="hub-empty">
          <div className="hub-empty-icon" aria-hidden="true">
            🗄️
          </div>
          <h2>No apps yet</h2>
          <p>
            You don&apos;t have any apps assigned to your account yet. Contact an administrator
            to get access.
          </p>
        </div>
      ) : (
        groups.map((g) => (
          <section className="hub-group" key={g.group}>
            <h2 className="hub-group-title">{g.group}</h2>
            <div className="hub-grid">
              {g.apps.map((app) => {
                const isPlanned = app.status === 'planned'
                const card = (
                  <>
                    <span className="hub-card-icon" aria-hidden="true">
                      {app.icon}
                    </span>
                    <span className="hub-card-body">
                      <span className="hub-card-name">
                        {app.name}
                        {app.status === 'beta' && (
                          <span className="hub-badge hub-badge-beta">Beta</span>
                        )}
                        {isPlanned && (
                          <span className="hub-badge hub-badge-planned">Coming soon</span>
                        )}
                      </span>
                      <span className="hub-card-desc">{app.description}</span>
                    </span>
                  </>
                )

                if (isPlanned) {
                  return (
                    <div
                      className="hub-card hub-card-disabled"
                      key={app.id}
                      aria-disabled="true"
                    >
                      {card}
                    </div>
                  )
                }

                return (
                  <Link className="hub-card" href={app.href} key={app.id}>
                    {card}
                  </Link>
                )
              })}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
