// The profile & settings page at /u/<username>.
//
// This replaced the old "My settings" modal: settings are a PAGE now, so they
// have a shareable URL, and the same page doubles as the read-only directory
// card any signed-in colleague sees.
//
// LAYOUT (2026-09-29): a sticky identity RAIL beside a column of sections.
// The rail STATES who this is — avatar, handle, roles, apps, joined, the
// shareable link — and the sections are the only place those values are
// CHANGED, so no fact is rendered twice on one screen (it used to be: the old
// header printed role and app chips that the cards below then edited, and the
// two disagreed until a manual reload). ProfileEditor calls router.refresh()
// after a save so the rail follows. Below 940px the rail becomes a banner
// above the sections and its nav turns into a scrollable strip.
//
// Everything the page is allowed to show or offer comes from ProfileView
// (src/lib/users/profile.ts) — this file never inspects the raw user document
// beyond looking it up, and never spreads it into the client payload.

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import React from 'react'

import { hasRole, type Role } from '@/access/roles'
import PasskeyManager from '@/components/shell/PasskeyManager'
import ProfileEditor from '@/components/shell/ProfileEditor'
import ProfileLink from '@/components/shell/ProfileLink'
import { requireSession } from '@/lib/apps/guard'
import { membershipApps } from '@/lib/apps/registry'
import { initialsOf } from '@/lib/users/initials'
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
  const targetIsManager = hasRole(target, 'admin', 'dev')

  // canEdit collapses to false for everyone while emulating. Say so, but only
  // to a viewer who would otherwise have had the buttons.
  const actorIsManager = hasRole(v.actor, 'admin', 'dev')
  const blockedByEmulation = v.isEmulating && (profile.isSelf || actorIsManager)
  const readOnly = !profile.canEdit && !profile.canManagePasskeys

  // The rail's jump list. Built here rather than in the editor because the page
  // is what decides which sections exist — and the order MUST match the render
  // order below (ProfileEditor: profile, roles, apps, password; then passkeys).
  const sections: { id: string; label: string }[] = [
    ...(profile.canEdit ? [{ id: 'pf-profile', label: 'Profile' }] : []),
    ...(profile.canEditRoles ? [{ id: 'pf-roles', label: 'Roles' }] : []),
    ...(profile.canEditApps ? [{ id: 'pf-apps', label: 'App access' }] : []),
    ...(profile.canEdit ? [{ id: 'pf-password', label: 'Password' }] : []),
    ...(profile.canManagePasskeys ? [{ id: 'pf-passkeys', label: 'Passkeys' }] : []),
  ]

  return (
    <div className="pf">
      <aside className="pf-rail">
        <div className="pf-idcard">
          <span className="pf-av" aria-hidden="true">
            {initialsOf(profile.name)}
          </span>
          {/* One wrapper, so the narrow layout can put the disc BESIDE the
              identity with a plain flex row. (Grid areas cannot do it: several
              children sharing one named area layer on top of each other.) */}
          <div className="pf-who">
            <h1 className="pf-name">{profile.name}</h1>
            {profile.username && <p className="pf-handle">@{profile.username}</p>}

            {profile.roles.length > 0 && (
              <p className="pf-chips" aria-label="Roles">
                {profile.roles.map((r) => (
                  <span className="profile-role" key={r}>
                    {ROLE_LABEL[r]}
                  </span>
                ))}
              </p>
            )}

            {/* Only the owner and admins/devs get `apps` in the projection. */}
            {profile.apps && (
              <p className="pf-chips" aria-label="Apps">
                {targetIsManager ? (
                  <span className="profile-role profile-role-quiet">All apps</span>
                ) : profile.apps.length === 0 ? (
                  <span className="profile-role profile-role-quiet">No apps yet</span>
                ) : (
                  membershipApps()
                    .filter((a) => profile.apps?.includes(a.id))
                    .map((a) => (
                      <span className="profile-role profile-role-quiet" key={a.id}>
                        {a.name}
                      </span>
                    ))
                )}
              </p>
            )}

            {joined && <p className="pf-joined">Joined {joined}</p>}

            {profile.username && (
              <>
                <div className="pf-sep" />
                <ProfileLink username={profile.username} />
              </>
            )}

            {/* An admin usually arrives here from the directory and goes back to
              it to edit the next person. A plain user has no such page. */}
            {actorIsManager && !v.isEmulating && (
              <Link className="pf-back" href="/users">
                All users
              </Link>
            )}
          </div>
        </div>

        {sections.length > 1 && (
          <nav className="pf-nav" aria-label="Sections of this profile">
            {sections.map((s) => (
              <a className="pf-nav-item" key={s.id} href={`#${s.id}`}>
                {s.label}
              </a>
            ))}
          </nav>
        )}
      </aside>

      <div className="pf-main">
        {blockedByEmulation && (
          <p className="pf-note">
            Changes are turned off while you are viewing as another user. Exit view-as to edit this
            profile.
          </p>
        )}

        {profile.canEdit && <ProfileEditor profile={profile} />}
        {profile.canManagePasskeys && <PasskeyManager />}
        {readOnly && !blockedByEmulation && (
          <p className="pf-readonly">
            {profile.name} keeps this profile up to date. Ask {profile.name} or an administrator if
            something here needs to change.
          </p>
        )}
      </div>
    </div>
  )
}
