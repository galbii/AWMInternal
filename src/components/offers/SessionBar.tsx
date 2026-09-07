'use client'

// Slim session strip above the app shell: who is signed in, settings/sign-out,
// and — for admins/devs — "view as" emulation and user creation. While
// emulating, a hard orange frame + banner make the mode impossible to miss,
// and the whole app is read-only (writes are rejected server-side).

import React, { useState } from 'react'

import NewUserModal from './NewUserModal'
import UserSettingsModal from './UserSettingsModal'

export interface SessionUserOption {
  id: string
  label: string
}

interface SessionBarProps {
  actorLabel: string
  viewerLabel: string
  /** True for admin OR dev — identical permissions (view-as, user creation). */
  canManage: boolean
  isEmulating: boolean
  users: SessionUserOption[]
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
  viewerLabel,
  canManage,
  isEmulating,
  users,
}: SessionBarProps): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [newUserOpen, setNewUserOpen] = useState(false)

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

  return (
    <>
      {isEmulating && <div className="emu-frame" aria-hidden="true" />}
      {isEmulating && (
        <div className="emu-banner" role="status">
          <strong>Viewing as {viewerLabel}</strong> — read-only. You are still signed in as{' '}
          {actorLabel}.
          <button className="emu-exit" onClick={() => void exitViewAs()} disabled={busy}>
            Exit view-as
          </button>
        </div>
      )}
      <div className="session-bar">
        <span className="sb-user">
          Signed in as <strong>{actorLabel}</strong>
        </span>
        <span className="sb-spacer" />
        {canManage && !isEmulating && (
          <button className="sb-signout" onClick={() => setNewUserOpen(true)} disabled={busy}>
            + New user
          </button>
        )}
        {canManage && !isEmulating && users.length > 0 && (
          <label className="sb-viewas">
            View as
            <select
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
        )}
        <button className="sb-signout" onClick={() => setSettingsOpen(true)} disabled={busy}>
          Settings
        </button>
        <button className="sb-signout" onClick={() => void signOut()} disabled={busy}>
          Sign out
        </button>
      </div>
      <UserSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {canManage && <NewUserModal open={newUserOpen} onClose={() => setNewUserOpen(false)} />}
    </>
  )
}
