// The profile & settings page at /u/<username>.
//
// This replaced the old "My settings" modal: settings are a PAGE now, so they
// have a shareable URL, and the same page doubles as the read-only directory
// card any signed-in colleague sees.
//
// Everything the page is allowed to show or offer comes from ProfileView
// (src/lib/users/profile.ts) — this file never inspects the raw user document
// beyond looking it up, and never spreads it into the client payload.

import { notFound, redirect } from 'next/navigation'
import React from 'react'

import { hasRole, type Role } from '@/access/roles'
import PasskeyManager from '@/components/shell/PasskeyManager'
import ProfileEditor from '@/components/shell/ProfileEditor'
import { requireSession } from '@/lib/apps/guard'
import { findUserByHandle, toProfileView } from '@/lib/users/profile'

export const dynamic = 'force-dynamic'

const ROLE_LABEL: Record<Role, string> = {
  dev: 'Developer',
  admin: 'Admin',
  user: 'User',
}

function joinedLabel(createdAt: string): string {
  const d = new Date(createdAt)
  if (Number.isNaN(d.getTime())) return ''
  // Explicit locale so the server render and the client hydration agree.
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>
}): Promise<React.JSX.Element> {
  const { handle } = await params
  const v = await requireSession(`/u/${handle}`)

  const target = await findUserByHandle(v.payload, handle, String(v.viewer.id))
  if (!target) notFound()

  const profile = toProfileView(target, v.actor, v.isEmulating)

  // Canonicalise the URL: `me`, a legacy id link, or an old handle all land on
  // /u/<current username> so the address people see and copy is the real one.
  // Accounts still waiting on the username backfill have nowhere to go, so they
  // stay on whatever handle resolved them.
  if (profile.username && handle !== profile.username) {
    redirect(`/u/${profile.username}`)
  }

  const joined = joinedLabel(profile.createdAt)

  // canEdit collapses to false for everyone while emulating. Say so, but only
  // to a viewer who would otherwise have had the buttons.
  const blockedByEmulation = v.isEmulating && (profile.isSelf || hasRole(v.actor, 'admin', 'dev'))
  const readOnly = !profile.canEdit && !profile.canManagePasskeys

  return (
    <div className="profile-page">
      <header className="profile-head">
        <div className="profile-identity">
          <h1 className="profile-name">{profile.name}</h1>
          {profile.username && <p className="profile-handle">@{profile.username}</p>}
          {profile.roles.length > 0 && (
            <p className="profile-roles">
              {profile.roles.map((r) => (
                <span className="profile-role" key={r}>
                  {ROLE_LABEL[r]}
                </span>
              ))}
            </p>
          )}
          {joined && <p className="profile-joined">Joined {joined}</p>}
        </div>
      </header>

      {blockedByEmulation && (
        <p className="profile-emunote">
          Changes are turned off while you are viewing as another user. Exit view-as to edit this
          profile.
        </p>
      )}

      <div className="profile-sections">
        {profile.canEdit && <ProfileEditor profile={profile} />}
        {profile.canManagePasskeys && <PasskeyManager />}
        {readOnly && !blockedByEmulation && (
          <p className="profile-readonly">
            {profile.name} keeps this profile up to date. Ask {profile.name} or an administrator if
            something here needs to change.
          </p>
        )}
      </div>
    </div>
  )
}
