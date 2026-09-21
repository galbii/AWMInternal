'use client'

// Slim session strip above every app's shell. 2026-09: two quiet clusters —
// the app breadcrumb on the left (AppShell passes it in as `leading`) and ONE
// account menu on the right: avatar, name, chevron, opening a dark popover
// that holds Settings, Profile and Sign out, plus — for admins/devs — "view
// as" emulation and a link to the Users app (/users, where accounts are
// created and managed). No outlined buttons live in the bar.
//
// "View as" lives in the SAME bar, not a second banner: the strip and the
// avatar turn amber, the label reads "Viewing as <user>", and an inline Exit
// pill sits beside it. A thin fixed frame keeps the whole window visibly
// marked while the app is read-only (writes are rejected server-side).
//
// The bar can be FOLDED: a chevron at the far right tucks it into a slim
// strip with one restore tab, and the choice persists in the awm-bar cookie
// (src/lib/bar.ts) so the server renders it folded next time.
//
// Identity settings (name, username, passkeys) live on /u/<username>; the
// settings modal links there rather than duplicating them.

import { ChevronDown, ChevronUp } from 'lucide-react'
import Link from 'next/link'
import React, { useState } from 'react'

import { BAR_COOKIE, BAR_COOKIE_MAX_AGE } from '@/lib/bar'
import { initialsOf } from '@/lib/users/initials'

import SettingsModal from './SettingsModal'
import ShellMenu from './ShellMenu'

export interface SessionUserOption {
  id: string
  label: string
}

interface SessionBarProps {
  actorLabel: string
  /** Shown under the name in the account menu; omitted when it IS the label. */
  actorEmail?: string
  viewerLabel: string
  /** True for admin OR dev — identical permissions (view-as, user creation). */
  canManage: boolean
  isEmulating: boolean
  users: SessionUserOption[]
  /**
   * The actor's own profile page: `/u/<username>`, or `/u/me` when the
   * account has no username yet.
   */
  profileHref: string
  /** Optional content rendered first inside the bar (AppShell's app switcher). */
  leading?: React.ReactNode
  /** Server-read awm-bar cookie: start folded. */
  initialMinimized?: boolean
}

function writeBarCookie(min: boolean): void {
  document.cookie = `${BAR_COOKIE}=${min ? 'min' : 'full'}; path=/; max-age=${BAR_COOKIE_MAX_AGE}; samesite=lax`
}

async function postEmulate(userId: string | null): Promise<boolean> {
  try {
    const res = await fetch('/api/emulate', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    return res.ok
  } catch {
    return false
  }
}

export default function SessionBar({
  actorLabel,
  actorEmail,
  viewerLabel,
  canManage,
  isEmulating,
  users,
  profileHref,
  leading,
  initialMinimized = false,
}: SessionBarProps): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [minimized, setMinimized] = useState(initialMinimized)

  const setBar = (min: boolean): void => {
    setMinimized(min)
    try {
      writeBarCookie(min)
    } catch {
      /* the choice just does not persist */
    }
  }
  const [settingsOpen, setSettingsOpen] = useState(false)

  const viewAs = async (userId: string): Promise<void> => {
    if (!userId || busy) return
    setBusy(true)
    if (await postEmulate(userId)) window.location.reload()
    else setBusy(false)
  }

  const exitViewAs = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    if (await postEmulate(null)) window.location.reload()
    else setBusy(false)
  }

  const signOut = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    // Clear any emulation first — the emulate route needs the auth cookie.
    if (isEmulating) await postEmulate(null)
    try {
      await fetch('/api/users/logout', { method: 'POST', credentials: 'same-origin' })
    } catch {
      /* cookie may already be gone */
    }
    window.location.href = '/login'
  }

  const showEmail = Boolean(actorEmail) && actorEmail !== actorLabel
  const adminTools = canManage && !isEmulating

  if (minimized) {
    return (
      <>
        {isEmulating && <div className="emu-frame" aria-hidden="true" />}
        <div className={isEmulating ? 'session-bar sb-min emulating' : 'session-bar sb-min'}>
          <button
            type="button"
            className="sb-restore"
            title="Show the top bar"
            aria-label={
              isEmulating ? 'Show the top bar. Viewing as ' + viewerLabel : 'Show the top bar'
            }
            onClick={() => setBar(false)}
          >
            {isEmulating ? (
              <span className="sb-avatar sb-avatar-emu sb-avatar-xs" aria-hidden="true">
                {initialsOf(viewerLabel)}
              </span>
            ) : (
              <span className="sb-avatar sb-avatar-xs" aria-hidden="true">
                {initialsOf(actorLabel)}
              </span>
            )}
            <ChevronDown size={13} strokeWidth={2.25} aria-hidden="true" />
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      {isEmulating && <div className="emu-frame" aria-hidden="true" />}
      <div className={isEmulating ? 'session-bar emulating' : 'session-bar'} role="status">
        {leading}
        <span className="sb-spacer" />
        <ShellMenu
          align="end"
          triggerClassName="sb-account"
          triggerTitle={isEmulating ? 'Viewing as another user' : 'Account'}
          panelLabel="Account"
          trigger={
            isEmulating ? (
              <>
                <span className="sb-avatar sb-avatar-emu" aria-hidden="true">
                  {initialsOf(viewerLabel)}
                </span>
                <span className="sb-user">
                  <span className="sr-only">Signed in as {actorLabel}. </span>
                  <span className="sb-mode">Viewing as</span>
                  <strong>{viewerLabel}</strong>
                </span>
              </>
            ) : (
              <>
                <span className="sb-avatar" aria-hidden="true">
                  {initialsOf(actorLabel)}
                </span>
                {/* The visually hidden lead-in keeps the trigger's accessible
                    name a sentence, and the e2e suite's "Signed in as" check. */}
                <span className="sb-user">
                  <span className="sr-only">Signed in as </span>
                  <strong>{actorLabel}</strong>
                </span>
              </>
            )
          }
        >
          {(close) => (
            <>
              {isEmulating ? (
                <div className="shm-head">
                  <div className="shm-name">Viewing as {viewerLabel}</div>
                  <div className="shm-sub">Read-only. You are signed in as {actorLabel}.</div>
                </div>
              ) : (
                <div className="shm-head">
                  <div className="shm-name">{actorLabel}</div>
                  {showEmail ? <div className="shm-sub">{actorEmail}</div> : null}
                </div>
              )}
              <div className="shm-sep" role="separator" />
              <button
                type="button"
                className="shm-item"
                data-shm-item
                onClick={() => {
                  close()
                  setSettingsOpen(true)
                }}
              >
                Settings
              </button>
              {/* Crossing into the (hub) group is a full navigation, by design. */}
              <Link href={profileHref} className="shm-item" data-shm-item>
                Profile
              </Link>

              {adminTools ? (
                <>
                  <div className="shm-sep" role="separator" />
                  {users.length > 0 ? (
                    <label className="shm-field">
                      <span className="shm-label">View as</span>
                      <select
                        className="shm-select"
                        data-shm-item
                        defaultValue=""
                        disabled={busy}
                        onChange={(e) => {
                          void viewAs(e.target.value)
                        }}
                      >
                        <option value="" disabled>
                          Choose a user…
                        </option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <Link href="/users" className="shm-item" data-shm-item>
                    Manage users
                  </Link>
                </>
              ) : null}

              <div className="shm-sep" role="separator" />
              <button
                type="button"
                className="shm-item shm-item-quiet"
                data-shm-item
                disabled={busy}
                onClick={() => void signOut()}
              >
                Sign out
              </button>
            </>
          )}
        </ShellMenu>
        {isEmulating ? (
          <button
            type="button"
            className="sb-exit"
            onClick={() => void exitViewAs()}
            disabled={busy}
          >
            Exit view-as
          </button>
        ) : null}
        <button
          type="button"
          className="sb-fold"
          title="Hide the top bar"
          aria-label="Hide the top bar"
          onClick={() => setBar(true)}
        >
          <ChevronUp size={14} strokeWidth={2.25} aria-hidden="true" />
        </button>
      </div>
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        profileHref={profileHref}
        actorLabel={actorLabel}
      />
    </>
  )
}
