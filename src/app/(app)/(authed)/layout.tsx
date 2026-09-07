// The auth gate for everything under "/". Rendering is gated here for UX; the
// real security boundary is Payload access control behind every route handler
// (each one calls getViewer() independently — a layout is not a boundary).

import { redirect } from 'next/navigation'
import React from 'react'

import { hasRole } from '@/access/roles'
import SessionBar, { type SessionUserOption } from '@/components/offers/SessionBar'
import { getViewer } from '@/lib/auth/viewer'

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const v = await getViewer()
  if (!v) redirect('/login')

  // admin and dev carry identical permissions (view-as, user management).
  const canManage = hasRole(v.actor, 'admin', 'dev')
  let users: SessionUserOption[] = []
  if (canManage) {
    const res = await v.payload.find({
      collection: 'users',
      limit: 0,
      pagination: false,
      depth: 0,
      sort: 'name',
      overrideAccess: true,
    })
    users = res.docs
      .filter((u) => String(u.id) !== String(v.actor.id) && !u.emulationBlocked)
      .map((u) => ({ id: String(u.id), label: u.name || u.email }))
  }

  return (
    <>
      <SessionBar
        actorLabel={v.actor.name || v.actor.email}
        viewerLabel={v.viewer.name || v.viewer.email}
        canManage={canManage}
        isEmulating={v.isEmulating}
        users={users}
      />
      {children}
    </>
  )
}
